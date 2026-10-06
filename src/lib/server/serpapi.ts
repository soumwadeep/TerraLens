/**
 * SerpApi adapter (spec §6f) — server-only. Online context for observations.
 *
 * Real calls against the SerpApi REST API (https://serpapi.com):
 *  - GET /account.json?api_key=...   plan + quota (used as the live probe)
 *  - GET /search.json?engine=google&q=...
 *
 * Every call returns a typed result. Unconfigured, unauthorized, throttled,
 * or down — the caller gets an honest failure state, never invented results.
 * Query text stays in memory; nothing is logged.
 */
import { getServerConfig } from "@/lib/config";

const PROBE_TIMEOUT_MS = 8_000;
const CALL_TIMEOUT_MS = 12_000;

export type SerpApiFailureState = "not-configured" | "unauthorized" | "unreachable" | "error";

export interface SerpApiFailure {
  ok: false;
  state: SerpApiFailureState;
  reason: string;
}

export type SerpApiResult<T> = ({ ok: true } & T) | SerpApiFailure;

export interface SerpApiProbe {
  configured: boolean;
  state: "ready" | SerpApiFailureState;
  detail: string;
  searchesLeft: number | null;
  latencyMs: number | null;
  at: string;
}

export interface OnlineResult {
  title: string;
  link: string;
  snippet: string;
  source: string | null;
}

export function serpapiConfigured(): boolean {
  const cfg = getServerConfig();
  return cfg.flags.serpapi && Boolean(cfg.serpapi.apiKey);
}

function apiKey(): SerpApiFailure | { ok: true; key: string } {
  const cfg = getServerConfig();
  if (!cfg.serpapi.apiKey) {
    return {
      ok: false,
      state: "not-configured",
      reason: "SERPAPI_API_KEY is not set (or ENABLE_SERPAPI is off).",
    };
  }
  return { ok: true, key: cfg.serpapi.apiKey };
}

function mapHttpFailure(status: number): SerpApiFailure {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      state: "unauthorized",
      reason: `SerpApi rejected the API key (HTTP ${status}).`,
    };
  }
  return { ok: false, state: "unreachable", reason: `SerpApi answered HTTP ${status}.` };
}

/** SerpApi signals some failures in the JSON body with HTTP 200. */
function bodyError(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const error = (body as { error?: unknown }).error;
  return typeof error === "string" && error.length > 0 ? error : null;
}

/** Live check: account.json proves key + plan without spending a search. */
export async function probeSerpApi(): Promise<SerpApiProbe> {
  const at = new Date().toISOString();
  const key = apiKey();
  if (!key.ok) {
    return {
      configured: false,
      state: key.state,
      detail: key.reason,
      searchesLeft: null,
      latencyMs: null,
      at,
    };
  }
  const startedAt = Date.now();
  try {
    const res = await fetch(
      `https://serpapi.com/account.json?api_key=${encodeURIComponent(key.key)}`,
      {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        cache: "no-store" as RequestCache,
      }
    );
    const latencyMs = Date.now() - startedAt;
    if (!res.ok) {
      const failure = mapHttpFailure(res.status);
      return {
        configured: true,
        state: failure.state,
        detail: failure.reason,
        searchesLeft: null,
        latencyMs,
        at,
      };
    }
    const body = (await res.json()) as Record<string, unknown>;
    const plan = typeof body.plan_name === "string" ? body.plan_name : "SerpApi plan";
    const left = typeof body.total_searches_left === "number" ? body.total_searches_left : null;
    return {
      configured: true,
      state: "ready",
      detail:
        left === null
          ? `SerpApi account answered (${plan}).`
          : `SerpApi account answered (${plan}) — ${left} searches left.`,
      searchesLeft: left,
      latencyMs,
      at,
    };
  } catch {
    return {
      configured: true,
      state: "unreachable",
      detail: "SerpApi did not answer.",
      searchesLeft: null,
      latencyMs: null,
      at,
    };
  }
}

interface SerpApiSearchBody {
  answer_box?: { answer?: unknown; snippet?: unknown; title?: unknown };
  organic_results?: Array<{ title?: unknown; link?: unknown; snippet?: unknown; source?: unknown }>;
  error?: unknown;
}

export async function searchOnline(
  query: string,
  limit = 5
): Promise<SerpApiResult<{ results: OnlineResult[]; answer: string | null }>> {
  const key = apiKey();
  if (!key.ok) return key;

  const params = new URLSearchParams({
    engine: "google",
    q: query,
    num: String(Math.min(Math.max(1, limit), 10)),
    api_key: key.key,
  });

  try {
    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      cache: "no-store" as RequestCache,
    });
    if (!res.ok) return mapHttpFailure(res.status);
    const body = (await res.json()) as SerpApiSearchBody;
    const error = bodyError(body);
    if (error) {
      const unauthorized = /api key|invalid key|unauthorized/i.test(error);
      return {
        ok: false,
        state: unauthorized ? "unauthorized" : "error",
        reason: unauthorized ? "SerpApi rejected the API key." : `SerpApi error: ${error}`,
      };
    }

    const answer =
      typeof body.answer_box?.answer === "string"
        ? body.answer_box.answer
        : typeof body.answer_box?.snippet === "string"
          ? body.answer_box.snippet
          : null;

    const results: OnlineResult[] = [];
    for (const item of body.organic_results ?? []) {
      const link =
        typeof item.link === "string" && /^https?:\/\//.test(item.link) ? item.link : null;
      const title = typeof item.title === "string" ? item.title : null;
      if (!link || !title) continue;
      results.push({
        title,
        link,
        snippet: typeof item.snippet === "string" ? item.snippet : "",
        source: typeof item.source === "string" ? item.source : null,
      });
      if (results.length >= limit) break;
    }
    return { ok: true, results, answer };
  } catch {
    return { ok: false, state: "unreachable", reason: "SerpApi did not answer." };
  }
}
