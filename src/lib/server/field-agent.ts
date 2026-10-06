/**
 * Mastra Field Agent (spec §5, §24, §34, §49) — server-only.
 *
 * Runs the expedition recap through a real Mastra `Agent` backed by the
 * deployment's OpenAI-compatible model endpoint. Honesty rules:
 *
 *  - Disabled or unconfigured → a typed `unavailable` result, never a pretend
 *    recap. (The client renders the deterministic summary instead, labeled.)
 *  - Mastra's `usedFallbackValue` flag means the structured output did not
 *    validate and Mastra substituted its own fallback object — that is NOT a
 *    model answer, so it is treated as unavailable. (When the invalid output
 *    makes `generate` throw instead, the thrown schema-validation error is
 *    mapped to the same honest reason.)
 *  - The emitted AgentTrace carries only whitelisted scalar attributes:
 *    model id, timing, counts. Never prompts, never model text, never user
 *    content.
 */
import { Agent } from "@mastra/core/agent";
import { getServerConfig } from "@/lib/config";
import {
  buildRecapUserPrompt,
  FieldRecapSchema,
  RECAP_SYSTEM_PROMPT,
  type FieldRecap,
  type RecapContext,
} from "@/lib/ai/recap";
import { AgentSpanSchema, AgentTraceSchema, type AgentTrace } from "@/lib/domain/types";
import { nowIso, uuid } from "@/lib/utils";

export type FieldAgentResult =
  | { kind: "ok"; recap: FieldRecap; model: string; latencyMs: number; trace: AgentTrace }
  | { kind: "unavailable"; reason: string; latencyMs: number | null; trace: AgentTrace | null };

/** Config facts for GET /api/field-agent and the health route. */
export function fieldAgentFacts(): {
  enabled: boolean;
  modelEndpoint: string | null;
  model: string;
  timeoutMs: number;
} {
  const cfg = getServerConfig();
  return {
    enabled: cfg.fieldAgentEnabled,
    modelEndpoint: cfg.gemma.baseUrl || null,
    model: cfg.gemma.model,
    timeoutMs: cfg.gemma.timeoutMs,
  };
}

export interface ModelEndpointProbe {
  reachable: boolean;
  httpStatus: number | null;
  detail: string;
}

/**
 * Live probe of the model endpoint (`GET /models` on the OpenAI-compatible
 * base URL). "Reachable" means the endpoint answered at all — exactly the
 * claim being made; a 404 is reported as answered-but-not-implemented.
 */
export async function probeModelEndpoint(): Promise<ModelEndpointProbe> {
  const cfg = getServerConfig();
  if (!cfg.fieldAgentEnabled || !cfg.gemma.baseUrl) {
    return { reachable: false, httpStatus: null, detail: "No model endpoint is configured." };
  }
  try {
    const res = await fetch(`${cfg.gemma.baseUrl.replace(/\/+$/, "")}/models`, {
      headers: cfg.gemma.apiKey ? { Authorization: `Bearer ${cfg.gemma.apiKey}` } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    return {
      reachable: true,
      httpStatus: res.status,
      detail:
        res.status === 404
          ? "The endpoint answered, but does not implement GET /models."
          : `The endpoint answered HTTP ${res.status}.`,
    };
  } catch {
    return { reachable: false, httpStatus: null, detail: "The model endpoint did not answer." };
  }
}

function buildTrace(
  startedAt: string,
  durationMs: number,
  status: "ok" | "error",
  attributes: Record<string, string | number | boolean>
): AgentTrace {
  const span = AgentSpanSchema.parse({
    id: uuid(),
    name: "mastra.generate",
    startedAt,
    durationMs,
    status: status === "ok" ? "ok" : "error",
    attributes,
  });
  return AgentTraceSchema.parse({
    id: uuid(),
    name: "terralens.field-agent.recap",
    startedAt,
    durationMs,
    status,
    spans: [span],
  });
}

/** Usage counters, content-free. Cross-SDK-safe read of the two fields we use. */
function usageCounts(usage: unknown): { inputTokens: number | null; outputTokens: number | null } {
  if (usage === null || typeof usage !== "object") return { inputTokens: null, outputTokens: null };
  const u = usage as Record<string, unknown>;
  const input = typeof u.inputTokens === "number" ? u.inputTokens : null;
  const output = typeof u.outputTokens === "number" ? u.outputTokens : null;
  return { inputTokens: input, outputTokens: output };
}

function failureReason(
  error: unknown,
  timeoutMs: number
): { reason: string; statusCode: number | null } {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  const id =
    error !== null &&
    typeof error === "object" &&
    typeof (error as { id?: unknown }).id === "string"
      ? (error as { id: string }).id
      : "";
  if (
    id === "STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED" ||
    message.startsWith("Structured output validation failed")
  ) {
    // The model DID answer — it just didn't answer in the required shape.
    // That is a different fact from "unreachable", and the reason must say so.
    return {
      reason: "The model answered, but not with a valid structured recap.",
      statusCode: null,
    };
  }
  if (name === "TimeoutError" || name === "AbortError") {
    return {
      reason: `The model endpoint did not answer within ${Math.round(timeoutMs / 1000)} seconds.`,
      statusCode: null,
    };
  }
  const statusCode =
    error !== null &&
    typeof error === "object" &&
    typeof (error as { statusCode?: unknown }).statusCode === "number"
      ? (error as { statusCode: number }).statusCode
      : null;
  if (statusCode !== null) {
    return { reason: `The model endpoint answered HTTP ${statusCode}.`, statusCode };
  }
  return { reason: "The model endpoint could not be reached.", statusCode: null };
}

/**
 * Run the recap through the Mastra agent. Never throws: every failure is a
 * typed `unavailable` carrying a human-readable reason.
 */
export async function runFieldAgent(context: RecapContext): Promise<FieldAgentResult> {
  const cfg = getServerConfig();
  const startedAt = nowIso();
  const t0 = Date.now();

  if (!cfg.fieldAgentEnabled) {
    return {
      kind: "unavailable",
      reason: "The Mastra field agent is disabled for this deployment.",
      latencyMs: null,
      trace: null,
    };
  }
  if (!cfg.gemma.baseUrl) {
    return {
      kind: "unavailable",
      reason: "No model endpoint is configured for the field agent.",
      latencyMs: null,
      trace: null,
    };
  }

  const agent = new Agent({
    id: "terralens-field-agent",
    name: "TerraLens Field Agent",
    instructions: RECAP_SYSTEM_PROMPT,
    model: {
      providerId: "terralens-gemma",
      modelId: cfg.gemma.model,
      url: cfg.gemma.baseUrl,
      apiKey: cfg.gemma.apiKey ?? "not-needed",
    },
  });

  try {
    const output = await agent.generate(buildRecapUserPrompt(context), {
      structuredOutput: { schema: FieldRecapSchema },
      abortSignal: AbortSignal.timeout(cfg.gemma.timeoutMs),
    });
    const latencyMs = Date.now() - t0;
    const usedFallback = output.usedFallbackValue === true;
    const steps = Array.isArray(output.steps) ? output.steps.length : 0;
    const { inputTokens, outputTokens } = usageCounts(output.totalUsage);
    const attributes: Record<string, string | number | boolean> = {
      model: cfg.gemma.model,
      structured: true,
      usedFallback,
      steps,
    };
    if (inputTokens !== null) attributes.inputTokens = inputTokens;
    if (outputTokens !== null) attributes.outputTokens = outputTokens;

    if (usedFallback) {
      return {
        kind: "unavailable",
        reason: "The model answered, but not with a valid structured recap.",
        latencyMs,
        trace: buildTrace(startedAt, latencyMs, "error", attributes),
      };
    }

    const parsed = FieldRecapSchema.safeParse(output.object);
    if (!parsed.success) {
      return {
        kind: "unavailable",
        reason: "The model answered, but the recap failed validation.",
        latencyMs,
        trace: buildTrace(startedAt, latencyMs, "error", attributes),
      };
    }

    return {
      kind: "ok",
      recap: parsed.data,
      model: cfg.gemma.model,
      latencyMs,
      trace: buildTrace(startedAt, latencyMs, "ok", attributes),
    };
  } catch (error) {
    const latencyMs = Date.now() - t0;
    const { reason, statusCode } = failureReason(error, cfg.gemma.timeoutMs);
    console.warn("[field-agent] generate failed:", error instanceof Error ? error.message : error);
    const attributes: Record<string, string | number | boolean> = {
      model: cfg.gemma.model,
      structured: true,
      usedFallback: false,
    };
    if (statusCode !== null) attributes.statusCode = statusCode;
    return {
      kind: "unavailable",
      reason,
      latencyMs,
      trace: buildTrace(startedAt, latencyMs, "error", attributes),
    };
  }
}
