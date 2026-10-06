/**
 * AI model adapter contract (spec §24–§27, §34, §49).
 *
 * Rules this module encodes:
 *  - Analysis ALWAYS goes through a real adapter. There is no pretend path.
 *  - An adapter that cannot run returns a typed `unavailable` result with an
 *    honest reason — never a fabricated response.
 *  - `probe()` is a real health check. "A URL is configured" is NEVER reported
 *    as ready. (READY == the runtime actually answered.)
 *  - Model output is untrusted text: it is parsed, schema-validated, and then
 *    passed through the deterministic safety layer before anyone sees it.
 *  - Request text is data, not instructions; prompts explicitly forbid the
 *    model from claiming certainty it does not have.
 */
import { z } from "zod";
import {
  CuriosityActionCategorySchema,
  EnvironmentSchema,
  ExpoModeSchema,
  ObservationCategorySchema,
} from "@/lib/domain/types";

/** Ollama's default OpenAI-compatible endpoint — attempted when nothing is configured. */
export const LOCAL_DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1";

export const LOCAL_ADAPTER_ID = "gemma-local" as const;
export const SERVER_ADAPTER_ID = "gemma-server" as const;

// ---------------------------------------------------------------------------
// Model output contract (untrusted; validated field by field)
// ---------------------------------------------------------------------------

export const CuriositySuggestionSchema = z.object({
  shortInsight: z.string().min(1).max(400),
  physicalAction: z.string().min(1).max(600),
  nextMission: z.string().max(500).nullable().catch(null),
  estimatedMinutes: z.coerce.number().min(1).max(30).catch(4),
  actionKind: CuriosityActionCategorySchema.catch("NOTICE"),
  /** The model may request the screen only for PHOTOGRAPH / RECORD; we force it anyway. */
  requiresScreen: z.boolean().catch(false),
});
export type CuriositySuggestion = z.infer<typeof CuriositySuggestionSchema>;

/**
 * Lenient by design: a field the model got wrong degrades to a safe default
 * instead of discarding the whole answer. Substance checks happen in the
 * pipeline (an empty object is treated as a failed analysis).
 */
export const ModelInsightSchema = z.object({
  category: ObservationCategorySchema.catch("unknown"),
  commonName: z.string().max(120).nullable().catch(null),
  scientificName: z.string().max(160).nullable().catch(null),
  confidence: z.coerce.number().min(0).max(1).catch(0),
  visualFeatures: z
    .array(z.string().max(120))
    .catch([])
    .transform((features) => features.slice(0, 8)),
  uncertainty: z.string().max(400).catch(""),
  safetyWarning: z.string().max(500).nullable().catch(null),
  curiosityPrompt: z.string().max(600).nullable().catch(null),
  suggestedNextAction: z.string().max(400).nullable().catch(null),
  curiosity: CuriositySuggestionSchema.nullable().catch(null),
});
export type ModelInsight = z.infer<typeof ModelInsightSchema>;

// ---------------------------------------------------------------------------
// Request contract
// ---------------------------------------------------------------------------

export const AnalysisRequestSchema = z.object({
  observationId: z.uuid(),
  /** The user's own words. Sent verbatim; never fabricated or extended. */
  note: z.string().max(4000).default(""),
  /** The user's tag — context, not ground truth. The model may disagree. */
  category: ObservationCategorySchema.default("unknown"),
  expeditionMode: ExpoModeSchema.default("nature"),
  environment: EnvironmentSchema.default("unknown"),
  /** Whether an image is attached (the route never receives image bytes). */
  hasImage: z.boolean().default(false),
});
export type AnalysisRequest = z.infer<typeof AnalysisRequestSchema>;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// Adapter status types
// ---------------------------------------------------------------------------

export const AdapterStateSchema = z.enum([
  "ready", // runtime answered AND the configured model is available
  "model-missing", // runtime answered, model not loaded
  "unreachable", // configured (or default) endpoint did not answer
  "not-configured", // nothing is configured for this adapter
]);
export type AdapterProbeState = z.infer<typeof AdapterStateSchema>;

export const AdapterProbeSchema = z.object({
  adapterId: z.enum([LOCAL_ADAPTER_ID, SERVER_ADAPTER_ID]),
  at: z.string().refine((v) => !Number.isNaN(Date.parse(v))),
  state: AdapterStateSchema,
  /** Human-readable and secret-free — safe to render and to store. */
  detail: z.string().max(400),
  models: z.array(z.string().max(120)).max(50).default([]),
  latencyMs: z.number().min(0).nullable().default(null),
});
export type AdapterProbe = z.infer<typeof AdapterProbeSchema>;

export type AdapterAnalysisResult =
  | {
      kind: "ok";
      insight: ModelInsight;
      model: string;
      latencyMs: number;
      via: typeof LOCAL_ADAPTER_ID | typeof SERVER_ADAPTER_ID;
    }
  | {
      kind: "unavailable";
      reason: string;
      latencyMs: number | null;
      /**
       * True when there was nothing to call (endpoint unreachable / nothing
       * configured). False when a runtime answered but failed (bad output,
       * HTTP error, timeout) — that state is worth persisting and showing.
       */
      noRuntime: boolean;
    };

export interface AIModelAdapter {
  readonly id: typeof LOCAL_ADAPTER_ID | typeof SERVER_ADAPTER_ID;
  readonly kind: "on-device" | "server";
  /** The model this adapter would ask for, when known. */
  modelId(): string | null;
  /** True when this adapter has explicit configuration (NOT a health check). */
  configured(): boolean;
  /** Real health check against the runtime. */
  probe(): Promise<AdapterProbe>;
  /** One structured analysis call. `imageDataUrl` is only ever passed to on-device adapters. */
  analyze(request: AnalysisRequest, imageDataUrl?: string | null): Promise<AdapterAnalysisResult>;
}

// ---------------------------------------------------------------------------
// Prompt building (shared by the local adapter and the server route)
// ---------------------------------------------------------------------------

export function buildAnalysisMessages(request: AnalysisRequest): ChatMessage[] {
  const system = [
    "You are TerraLens, a careful field companion for amateur nature observers.",
    "You are NOT a certified identification authority. Never claim more certainty than the evidence supports.",
    "Hard rules:",
    "- Base every statement only on the note and the attached image, if any. Do not invent locations, weather, or facts.",
    '- If you cannot identify the subject, set commonName and scientificName to null, keep confidence low, and explain what you can and cannot tell in "uncertainty".',
    "- Never suggest eating, tasting, touching, handling, collecting, or picking any plant, fungus, or animal. Never make medicinal claims.",
    "- The follow-up action must happen in the physical world. Only a photograph or a sound recording may require the screen.",
    '- Keep "uncertainty" honest and specific; empty flattery is worse than admitting a gap.',
    "Return exactly one JSON object, no markdown fences, matching this shape:",
    '{"category":"one of: plant, flower, tree, bird, insect, animal, fungus, rock, landscape, sound, texture, weather, other, unknown",',
    '"commonName":"string|null","scientificName":"string|null","confidence":0.0,',
    '"visualFeatures":["at most 6 short strings"],"uncertainty":"<=240 chars, always present",',
    '"safetyWarning":"string|null","curiosityPrompt":"one curiosity question <=160 chars, or null",',
    '"suggestedNextAction":"<=200 chars, or null",',
    '"curiosity":{"shortInsight":"<=200 chars","physicalAction":"<=280 chars, doable without the screen",',
    '"nextMission":"imperative <=90 chars","estimatedMinutes":4,',
    '"actionKind":"one of: LOOK, LISTEN, WALK, COMPARE, SEARCH, WAIT, NOTICE, SMELL_SAFE, PHOTOGRAPH, RECORD, REFLECT",',
    '"requiresScreen":false}}',
  ].join("\n");

  const note = request.note.trim();
  const user = [
    "Observation metadata:",
    `- User tag: ${request.category} (context only — you may disagree)`,
    `- Expedition mode: ${request.expeditionMode}`,
    `- Environment: ${request.environment}`,
    request.hasImage
      ? "- An image is attached: use it as primary evidence."
      : "- No image attached.",
    note.length > 0
      ? `- User note: "${note}"`
      : "- User note: (empty) — if there is no image either, stay very conservative.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// ---------------------------------------------------------------------------
// Robust JSON extraction — model output is text until proven otherwise
// ---------------------------------------------------------------------------

export function extractJsonObject(raw: string): unknown | null {
  const trimmed = raw.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  for (const candidate of [unfenced, sliceBetweenBraces(unfenced)]) {
    if (!candidate) continue;
    try {
      const value: unknown = JSON.parse(candidate);
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function sliceBetweenBraces(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

export function parseModelInsight(raw: string): ModelInsight | null {
  const object = extractJsonObject(raw);
  if (!object) return null;
  const parsed = ModelInsightSchema.safeParse(object);
  return parsed.success ? parsed.data : null;
}

/**
 * Substance check: a syntactically valid but empty object is a failed
 * analysis, not a "confident unknown".
 */
export function insightHasSubstance(insight: ModelInsight): boolean {
  return (
    insight.commonName !== null ||
    insight.visualFeatures.length > 0 ||
    insight.uncertainty.trim().length > 0 ||
    (insight.curiosityPrompt?.trim().length ?? 0) > 0 ||
    insight.curiosity !== null
  );
}
