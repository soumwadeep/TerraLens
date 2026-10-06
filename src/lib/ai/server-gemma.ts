/**
 * Server Gemma adapter — the browser-side half of the server path.
 *
 * This adapter never holds a key and never sends image bytes: it calls the
 * deployment's own `/api/analyze` route, which owns the credentials. When the
 * deployment has no server AI configured, the route answers with a typed
 * `unavailable` result — that honesty is a feature, not a failure.
 */
import {
  SERVER_ADAPTER_ID,
  type AdapterAnalysisResult,
  type AdapterProbe,
  type AIModelAdapter,
  type AnalysisRequest,
} from "@/lib/ai/adapter";

const ROUTE = "/api/analyze";
const PROBE_TIMEOUT_MS = 7000;

interface RouteHealthBody {
  configured?: unknown;
  probe?: unknown;
}

/** Flat wire shape — the route's JSON is trusted only after field checks. */
interface RouteAnalysisBody {
  kind?: unknown;
  reason?: unknown;
  latencyMs?: unknown;
  noRuntime?: unknown;
}

export class ServerGemmaAdapter implements AIModelAdapter {
  readonly id = SERVER_ADAPTER_ID;
  readonly kind = "server" as const;

  modelId(): string | null {
    return null; // known only after a probe answers
  }

  /**
   * The route's own existence is not configuration — the server that answers
   * decides. `configured()` is therefore optimistic: probe() is the truth.
   */
  configured(): boolean {
    return typeof window !== "undefined";
  }

  async probe(): Promise<AdapterProbe> {
    const at = new Date().toISOString();
    try {
      const res = await fetch(`${ROUTE}?health=1`, {
        method: "GET",
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) {
        return {
          adapterId: this.id,
          at,
          state: "unreachable",
          detail: `This deployment's server route answered HTTP ${res.status}.`,
          models: [],
          latencyMs: null,
        };
      }
      const body = (await res.json()) as RouteHealthBody;
      const probe = body.probe;
      if (
        probe !== null &&
        typeof probe === "object" &&
        "state" in probe &&
        "detail" in probe &&
        "at" in probe
      ) {
        const p = probe as {
          state: AdapterProbe["state"];
          detail: string;
          models?: string[];
          latencyMs?: number | null;
          at: string;
        };
        return {
          adapterId: this.id,
          at: typeof p.at === "string" ? p.at : at,
          state: p.state,
          detail: String(p.detail).slice(0, 400),
          models: Array.isArray(p.models)
            ? p.models.filter((m): m is string => typeof m === "string").slice(0, 50)
            : [],
          latencyMs: typeof p.latencyMs === "number" ? p.latencyMs : null,
        };
      }
      return {
        adapterId: this.id,
        at,
        state: "unreachable",
        detail: "The server route answered, but not with a probe result.",
        models: [],
        latencyMs: null,
      };
    } catch {
      return {
        adapterId: this.id,
        at,
        state: "unreachable",
        detail: "The server route did not answer from this browser.",
        models: [],
        latencyMs: null,
      };
    }
  }

  async analyze(request: AnalysisRequest): Promise<AdapterAnalysisResult> {
    let res: Response;
    try {
      res = await fetch(ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(90_000),
        cache: "no-store",
      });
    } catch {
      return {
        kind: "unavailable",
        reason: "The server route did not answer from this browser.",
        latencyMs: null,
        noRuntime: true,
      };
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return {
        kind: "unavailable",
        reason: `Server route answered HTTP ${res.status} with a non-JSON body.`,
        latencyMs: null,
        noRuntime: false,
      };
    }

    if (
      body === null ||
      typeof body !== "object" ||
      !("kind" in (body as Record<string, unknown>))
    ) {
      return {
        kind: "unavailable",
        reason: `Server route answered HTTP ${res.status} in an unexpected shape.`,
        latencyMs: null,
        noRuntime: false,
      };
    }

    const candidate = body as RouteAnalysisBody;
    if (candidate.kind === "ok") {
      return body as AdapterAnalysisResult;
    }
    return {
      kind: "unavailable",
      reason:
        typeof candidate.reason === "string"
          ? candidate.reason.slice(0, 400)
          : "Server analysis is unavailable.",
      latencyMs: typeof candidate.latencyMs === "number" ? candidate.latencyMs : null,
      noRuntime: candidate.noRuntime === true,
    };
  }
}
