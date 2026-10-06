"use client";

/**
 * Memory façade (spec §33, §34).
 *
 * The device journal is the source of truth. Server memory (Backboard) is a
 * strictly opt-in mirror:
 *   - demo/replay records are NEVER memorized anywhere;
 *   - local memory is written whenever the user has it enabled;
 *   - the server mirror happens only when the user has turned on sharing AND
 *     is not in LOCAL_ONLY privacy mode.
 *
 * Every server function returns typed results — an unavailable bridge is a
 * fact we surface, never an invented memory.
 */
import type { MemoryRecord, UserPreferences } from "@/lib/domain/types";
import {
  clearLocalMemories,
  countLocalMemories,
  deleteLocalMemory,
  localMemoryEnabled,
  recentLocalMemories,
  searchLocalMemories,
  serverMemoryAllowed,
  writeLocalMemory,
  updateLocalMemory,
} from "@/lib/memory/local";

export interface MemoryFacts {
  configured: boolean;
  assistantIdPresent: boolean;
  note: string;
}

export type MemoryProbe = {
  configured: boolean;
  state: "ready" | "not-configured" | "no-assistant" | "unauthorized" | "unreachable";
  detail: string;
  totalCount: number | null;
  latencyMs: number | null;
  at: string;
} | null;

export interface ServerMemoryEntry {
  id: string | null;
  content: string;
  score: number | null;
  createdAt: string | null;
}

export type ServerMemoryResult =
  | { kind: "ok"; memories: ServerMemoryEntry[]; totalCount?: number | null }
  | { kind: "unavailable"; state: string; reason: string };

export interface ExpeditionMemoryInput {
  userId: string;
  expeditionId: string;
  title: string;
  environment: string;
  observationCount: number;
  durationMinutes: number | null;
  grassScore: number | null;
  origin: MemoryRecord["origin"];
  prefs: UserPreferences | null;
}

/** Short human sentence used as the memory body. */
function describeExpedition(input: ExpeditionMemoryInput): string {
  const parts: string[] = [];
  parts.push(
    input.durationMinutes !== null && input.durationMinutes > 0
      ? `A ${Math.round(input.durationMinutes)}-minute walk in the ${input.environment}.`
      : `A visit to the ${input.environment}.`
  );
  parts.push(
    input.observationCount === 1
      ? "1 observation was captured."
      : `${input.observationCount} observations were captured.`
  );
  if (input.grassScore !== null) parts.push(`Grass Score ${input.grassScore}/1000.`);
  return parts.join(" ");
}

/**
 * Record a completed expedition. Returns the local record, or null when
 * memory is off or the expedition is not live data.
 */
export async function recordExpeditionMemory(
  input: ExpeditionMemoryInput
): Promise<MemoryRecord | null> {
  if (input.origin !== "live") return null; // demo isolation
  if (!localMemoryEnabled(input.prefs)) return null;

  const record = await writeLocalMemory({
    userId: input.userId,
    kind: "expedition",
    title: input.title || `Walk in the ${input.environment}`,
    body: describeExpedition(input),
    tags: ["expedition", input.environment].filter(Boolean),
    expeditionId: input.expeditionId,
    origin: input.origin,
  });

  if (!serverMemoryAllowed(input.prefs)) return record;

  const mirrored = await pushMemoryToServer(record);
  return mirrored ?? record;
}

/** Attempt the opt-in server mirror; marks the record synced on success. */
async function pushMemoryToServer(record: MemoryRecord): Promise<MemoryRecord | null> {
  try {
    const res = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add",
        record: {
          id: record.id,
          userId: record.userId,
          kind: record.kind,
          title: record.title,
          body: record.body,
          tags: record.tags,
          expeditionId: record.expeditionId,
          createdAt: record.createdAt,
        },
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { kind?: string };
    if (body.kind !== "ok") return null;
    return await updateLocalMemory({ ...record, syncState: "synced" });
  } catch {
    return null; // stays local; nothing is lost
  }
}

/** Push any local-only records to the server (used when sharing is turned on). */
export interface MirrorOutcome {
  pushed: number;
  pending: number;
  serverReached: boolean;
}

const EMPTY_MIRROR: MirrorOutcome = { pushed: 0, pending: 0, serverReached: false };

// Concurrent callers (toggle handler + settings-visit retry) share one run so
// the same record can never be pushed twice.
let mirrorInFlight: Promise<MirrorOutcome> | null = null;

export function mirrorUnsyncedMemories(
  userId: string,
  prefs: UserPreferences | null,
  max = 20
): Promise<MirrorOutcome> {
  if (mirrorInFlight) return mirrorInFlight;
  const run = (async (): Promise<MirrorOutcome> => {
    if (!serverMemoryAllowed(prefs)) return EMPTY_MIRROR;
    const records = await recentLocalMemories(userId, 200);
    const unsynced = records.filter((record) => record.syncState !== "synced");
    if (unsynced.length === 0) return { pushed: 0, pending: 0, serverReached: true };
    let pushed = 0;
    let reached = true;
    for (const record of unsynced) {
      if (pushed >= max) break;
      const updated = await pushMemoryToServer(record);
      if (updated) {
        pushed += 1;
      } else {
        reached = false; // stop hammering a server that is not answering
        break;
      }
    }
    return { pushed, pending: unsynced.length - pushed, serverReached: reached };
  })().catch(() => EMPTY_MIRROR);
  mirrorInFlight = run.finally(() => {
    mirrorInFlight = null;
  });
  return mirrorInFlight;
}

export async function recentMemories(userId: string, limit = 12): Promise<MemoryRecord[]> {
  return recentLocalMemories(userId, limit);
}

export async function countMemories(userId: string): Promise<number> {
  return countLocalMemories(userId);
}

export async function eraseMemories(userId: string): Promise<number> {
  return clearLocalMemories(userId);
}

export async function removeMemory(id: string): Promise<void> {
  return deleteLocalMemory(id);
}

/** Local search, widened with server hits when sharing is on. */
export async function searchMemories(
  userId: string,
  query: string,
  prefs: UserPreferences | null,
  limit = 8
): Promise<{ local: MemoryRecord[]; server: ServerMemoryEntry[]; serverState: string | null }> {
  const local = await searchLocalMemories(userId, query, limit);
  if (!serverMemoryAllowed(prefs)) return { local, server: [], serverState: null };
  const result = await searchServerMemories(query, limit);
  if (result.kind === "ok") return { local, server: result.memories, serverState: "ok" };
  return { local, server: [], serverState: result.state };
}

export async function memoryFacts(): Promise<MemoryFacts | null> {
  try {
    const res = await fetch("/api/memory");
    if (!res.ok) return null;
    return (await res.json()) as MemoryFacts;
  } catch {
    return null;
  }
}

export async function probeMemoryServer(): Promise<MemoryProbe> {
  try {
    const res = await fetch("/api/memory?health=1");
    if (!res.ok) return null;
    const body = (await res.json()) as { probe: MemoryProbe };
    return body.probe;
  } catch {
    return null;
  }
}

export async function searchServerMemories(query: string, limit = 5): Promise<ServerMemoryResult> {
  try {
    const res = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "search", query, limit }),
    });
    if (!res.ok) return { kind: "unavailable", state: "unreachable", reason: `HTTP ${res.status}` };
    return (await res.json()) as ServerMemoryResult;
  } catch {
    return {
      kind: "unavailable",
      state: "unreachable",
      reason: "The memory bridge did not answer.",
    };
  }
}

export async function listServerMemories(limit = 25): Promise<ServerMemoryResult> {
  try {
    const res = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list", limit }),
    });
    if (!res.ok) return { kind: "unavailable", state: "unreachable", reason: `HTTP ${res.status}` };
    return (await res.json()) as ServerMemoryResult;
  } catch {
    return {
      kind: "unavailable",
      state: "unreachable",
      reason: "The memory bridge did not answer.",
    };
  }
}
