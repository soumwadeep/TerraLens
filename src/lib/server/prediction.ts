/**
 * TabPFN prediction adapter (spec §28) — server-only.
 *
 * Talks to the deployment's prediction service (services/prediction/serve.py),
 * which is the ONLY place TerraLens predictions are produced. Every function
 * returns a typed result: when the service is not configured, has no trained
 * artifact, or does not answer, callers get `not-configured` / `model-missing`
 * / `unreachable` — a probability is never invented.
 */
import { getServerConfig } from "@/lib/config";

const PROBE_TIMEOUT_MS = 8_000;
const CALL_TIMEOUT_MS = 25_000;

export const PREDICTION_OUTPUT_KEYS = [
  "bird_activity",
  "insect_activity",
  "flower_likelihood",
  "rain_interruption",
  "best_window",
] as const;
export type PredictionOutputKey = (typeof PREDICTION_OUTPUT_KEYS)[number];

export type PredictionFailureState =
  "not-configured" | "insufficient-data" | "model-missing" | "unauthorized" | "unreachable";

export interface PredictionFailure {
  ok: false;
  state: PredictionFailureState;
  reason: string;
}

export interface PredictionOutput {
  key: PredictionOutputKey;
  label: string;
  probability: number | null;
  window: string | null;
}

export type PredictionResult =
  { ok: true; outputs: PredictionOutput[]; modelVersion: string | null } | PredictionFailure;

export interface PredictionProbe {
  configured: boolean;
  state: "ready" | "model-missing" | "not-configured" | "unreachable";
  detail: string;
  trained: boolean | null;
  modelVersion: string | null;
  latencyMs: number | null;
  at: string;
}

/** URL present (a trained artifact is still required for real predictions). */
export function predictionConfigured(): boolean {
  const cfg = getServerConfig();
  return cfg.flags.tabpfn && Boolean(cfg.prediction.serviceUrl);
}

function requestHeaders(apiKey: string | null, json: boolean): Record<string, string> {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(apiKey ? { "x-terralens-key": apiKey } : {}),
  };
}

function parseOutputs(raw: unknown): PredictionOutput[] | null {
  if (typeof raw !== "object" || raw === null) return null;
  const list = (raw as { outputs?: unknown }).outputs;
  if (!Array.isArray(list)) return null;
  const outputs: PredictionOutput[] = [];
  for (const entry of list) {
    if (typeof entry !== "object" || entry === null) continue;
    const rec = entry as Record<string, unknown>;
    const key = rec.key;
    if (typeof key !== "string" || !(PREDICTION_OUTPUT_KEYS as readonly string[]).includes(key))
      continue;
    const probability =
      typeof rec.probability === "number" && rec.probability >= 0 && rec.probability <= 1
        ? rec.probability
        : null;
    outputs.push({
      key: key as PredictionOutputKey,
      label: typeof rec.label === "string" ? rec.label : key,
      probability,
      window: typeof rec.window === "string" ? rec.window : null,
    });
  }
  return outputs;
}

/** Live check: one tiny /health call distinguishes process up vs artifact trained. */
export async function probePrediction(): Promise<PredictionProbe> {
  const at = new Date().toISOString();
  const cfg = getServerConfig();
  const base = cfg.prediction.serviceUrl;
  if (!cfg.flags.tabpfn || !base) {
    return {
      configured: false,
      state: "not-configured",
      detail: "The prediction service is not configured for this deployment.",
      trained: null,
      modelVersion: null,
      latencyMs: null,
      at,
    };
  }

  const startedAt = Date.now();
  try {
    const res = await fetch(`${base}/health`, {
      headers: requestHeaders(cfg.prediction.serviceKey, false),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store",
    });
    const latencyMs = Date.now() - startedAt;
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const trained = body !== null && typeof body.trained === "boolean" ? body.trained : null;
    const modelVersion =
      body !== null && typeof body.modelVersion === "string" ? body.modelVersion : null;

    if (!res.ok) {
      return {
        configured: true,
        state: "unreachable",
        detail: `The prediction service answered HTTP ${res.status}.`,
        trained,
        modelVersion,
        latencyMs,
        at,
      };
    }
    if (trained === false) {
      return {
        configured: true,
        state: "model-missing",
        detail:
          typeof body?.detail === "string" && body.detail
            ? body.detail
            : "The service is up, but no trained model is loaded — predictions stay off until train.py has run.",
        trained,
        modelVersion,
        latencyMs,
        at,
      };
    }
    return {
      configured: true,
      state: "ready",
      detail:
        modelVersion !== null
          ? `Prediction service ready — model ${modelVersion}.`
          : "Prediction service ready.",
      trained,
      modelVersion,
      latencyMs,
      at,
    };
  } catch {
    return {
      configured: true,
      state: "unreachable",
      detail: "The prediction service did not answer.",
      trained: null,
      modelVersion: null,
      latencyMs: null,
      at,
    };
  }
}

/** POST an observation's numeric features; returns real outputs or a typed failure. */
export async function requestPrediction(
  features: Record<string, number | string | null>,
  horizonDate?: string | null
): Promise<PredictionResult> {
  const cfg = getServerConfig();
  const base = cfg.prediction.serviceUrl;
  if (!cfg.flags.tabpfn || !base) {
    return {
      ok: false,
      state: "not-configured",
      reason:
        "PREDICTION_SERVICE_URL is not set (or ENABLE_TABPFN is off) — there is no model to ask, and numbers are never invented.",
    };
  }

  let res: Response;
  try {
    res = await fetch(`${base}/predict`, {
      method: "POST",
      headers: requestHeaders(cfg.prediction.serviceKey, true),
      body: JSON.stringify({ features, horizonDate: horizonDate ?? null }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return { ok: false, state: "unreachable", reason: "The prediction service did not answer." };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      state: "unauthorized",
      reason: `The prediction service rejected the key (HTTP ${res.status}).`,
    };
  }
  if (res.status === 503) {
    return {
      ok: false,
      state: "model-missing",
      reason: "The prediction service is up, but no trained model is loaded.",
    };
  }
  if (res.status === 422) {
    return {
      ok: false,
      state: "insufficient-data",
      reason: "The model does not have enough matching features to predict from this record.",
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      state: "unreachable",
      reason: `The prediction service answered HTTP ${res.status}.`,
    };
  }

  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const outputs = parseOutputs(body);
  if (outputs === null) {
    return {
      ok: false,
      state: "unreachable",
      reason: "The prediction service returned an unexpected body.",
    };
  }
  const modelVersion =
    body !== null && typeof body.modelVersion === "string" ? (body.modelVersion as string) : null;
  return { ok: true, outputs, modelVersion };
}
