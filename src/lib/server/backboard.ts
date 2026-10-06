/**
 * Backboard memory adapter (spec §33) — server-only.
 *
 * Real calls against the Backboard REST API (https://docs.backboard.io):
 *  - GET  /assistants/{id}/memories          list
 *  - POST /assistants/{id}/memories          add
 *  - POST /assistants/{id}/memories/search   semantic search
 *  - auth header: X-API-Key
 *
 * Every function returns a typed result. When the deployment is not
 * configured, or the server does not answer, callers get an honest
 * `unavailable`/`not-configured` — never an invented memory.
 */
import { getServerConfig } from "@/lib/config";

const PROBE_TIMEOUT_MS = 8_000;
const CALL_TIMEOUT_MS = 12_000;

export interface BackboardMemoryEntry {
  id: string | null;
  content: string;
  score: number | null;
  createdAt: string | null;
}

export type BackboardFailureState =
  "not-configured" | "no-assistant" | "unauthorized" | "unreachable";

export interface BackboardFailure {
  ok: false;
  state: BackboardFailureState;
  reason: string;
}

export type BackboardResult<T> = ({ ok: true } & T) | BackboardFailure;

export interface BackboardProbe {
  configured: boolean;
  state: "ready" | BackboardFailureState;
  detail: string;
  totalCount: number | null;
  latencyMs: number | null;
  at: string;
}

/** URL + key present (an assistant is still required for memory calls). */
export function backboardConfigured(): boolean {
  const cfg = getServerConfig();
  return cfg.flags.backboard && Boolean(cfg.backboard.apiUrl && cfg.backboard.apiKey);
}

function baseContext():
  BackboardFailure | { ok: true; baseUrl: string; apiKey: string; assistantId: string } {
  const cfg = getServerConfig();
  if (!cfg.backboard.apiUrl || !cfg.backboard.apiKey) {
    return {
      ok: false,
      state: "not-configured",
      reason: "Backboard is not configured for this deployment.",
    };
  }
  if (!cfg.backboard.assistantId) {
    return {
      ok: false,
      state: "no-assistant",
      reason:
        "Backboard is configured, but BACKBOARD_ASSISTANT_ID is not set — memories need an assistant.",
    };
  }
  return {
    ok: true,
    baseUrl: cfg.backboard.apiUrl,
    apiKey: cfg.backboard.apiKey,
    assistantId: cfg.backboard.assistantId,
  };
}

function requestInit(apiKey: string, body?: unknown, signal?: AbortSignal): RequestInit {
  return {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "X-API-Key": apiKey,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal,
    cache: "no-store" as RequestCache,
  };
}

function mapHttpFailure(status: number): BackboardFailure {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      state: "unauthorized",
      reason: `Backboard rejected the API key (HTTP ${status}).`,
    };
  }
  return { ok: false, state: "unreachable", reason: `Backboard answered HTTP ${status}.` };
}

function parseEntries(raw: unknown): BackboardMemoryEntry[] {
  if (typeof raw !== "object" || raw === null) return [];
  const memories = (raw as { memories?: unknown }).memories;
  if (!Array.isArray(memories)) return [];
  const entries: BackboardMemoryEntry[] = [];
  for (const m of memories) {
    if (typeof m !== "object" || m === null) continue;
    const rec = m as Record<string, unknown>;
    const content = typeof rec.content === "string" ? rec.content : null;
    if (!content) continue;
    entries.push({
      id:
        typeof rec.memory_id === "string"
          ? rec.memory_id
          : typeof rec.id === "string"
            ? rec.id
            : null,
      content,
      score: typeof rec.score === "number" ? rec.score : null,
      createdAt:
        typeof rec.created_at === "string"
          ? rec.created_at
          : typeof rec.createdAt === "string"
            ? rec.createdAt
            : null,
    });
  }
  return entries;
}

/** Live check: one tiny list call proves auth + assistant + endpoint. */
export async function probeBackboard(): Promise<BackboardProbe> {
  const at = new Date().toISOString();
  const ctx = baseContext();
  if (!ctx.ok) {
    return {
      configured: false,
      state: ctx.state,
      detail: ctx.reason,
      totalCount: null,
      latencyMs: null,
      at,
    };
  }
  const url = `${ctx.baseUrl}/assistants/${ctx.assistantId}/memories?page=1&page_size=1`;
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      ...requestInit(ctx.apiKey),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - startedAt;
    if (!res.ok) {
      const failure = mapHttpFailure(res.status);
      return {
        configured: true,
        state: failure.state,
        detail: failure.reason,
        totalCount: null,
        latencyMs,
        at,
      };
    }
    const body = (await res.json()) as unknown;
    const total =
      typeof body === "object" &&
      body !== null &&
      typeof (body as { total_count?: unknown }).total_count === "number"
        ? ((body as { total_count: number }).total_count as number)
        : parseEntries(body).length;
    return {
      configured: true,
      state: "ready",
      detail: `Backboard assistant answered — ${total} memories stored.`,
      totalCount: total,
      latencyMs,
      at,
    };
  } catch {
    return {
      configured: true,
      state: "unreachable",
      detail: "Backboard did not answer.",
      totalCount: null,
      latencyMs: null,
      at,
    };
  }
}

export async function addBackboardMemory(
  content: string,
  metadata?: Record<string, string>
): Promise<BackboardResult<{ memoryId: string | null }>> {
  const ctx = baseContext();
  if (!ctx.ok) return ctx;
  try {
    const res = await fetch(`${ctx.baseUrl}/assistants/${ctx.assistantId}/memories`, {
      ...requestInit(
        ctx.apiKey,
        { content, ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}) },
        AbortSignal.timeout(CALL_TIMEOUT_MS)
      ),
    });
    if (!res.ok) return mapHttpFailure(res.status);
    const body = (await res.json()) as Record<string, unknown>;
    const memoryId =
      typeof body.memory_id === "string"
        ? body.memory_id
        : typeof body.id === "string"
          ? body.id
          : null;
    return { ok: true, memoryId };
  } catch {
    return { ok: false, state: "unreachable", reason: "Backboard did not answer." };
  }
}

export async function searchBackboardMemories(
  query: string,
  limit = 5
): Promise<BackboardResult<{ memories: BackboardMemoryEntry[] }>> {
  const ctx = baseContext();
  if (!ctx.ok) return ctx;
  try {
    const res = await fetch(`${ctx.baseUrl}/assistants/${ctx.assistantId}/memories/search`, {
      ...requestInit(
        ctx.apiKey,
        { query, limit: Math.min(Math.max(1, limit), 25) },
        AbortSignal.timeout(CALL_TIMEOUT_MS)
      ),
    });
    if (!res.ok) return mapHttpFailure(res.status);
    const body = (await res.json()) as unknown;
    return { ok: true, memories: parseEntries(body) };
  } catch {
    return { ok: false, state: "unreachable", reason: "Backboard did not answer." };
  }
}

export async function listBackboardMemories(
  limit = 25
): Promise<BackboardResult<{ memories: BackboardMemoryEntry[]; totalCount: number | null }>> {
  const ctx = baseContext();
  if (!ctx.ok) return ctx;
  const pageSize = Math.min(Math.max(1, limit), 100);
  try {
    const res = await fetch(
      `${ctx.baseUrl}/assistants/${ctx.assistantId}/memories?page=1&page_size=${pageSize}`,
      { ...requestInit(ctx.apiKey), signal: AbortSignal.timeout(CALL_TIMEOUT_MS) }
    );
    if (!res.ok) return mapHttpFailure(res.status);
    const body = (await res.json()) as unknown;
    const totalCount =
      typeof body === "object" &&
      body !== null &&
      typeof (body as { total_count?: unknown }).total_count === "number"
        ? ((body as { total_count: number }).total_count as number)
        : null;
    return { ok: true, memories: parseEntries(body), totalCount };
  } catch {
    return { ok: false, state: "unreachable", reason: "Backboard did not answer." };
  }
}
