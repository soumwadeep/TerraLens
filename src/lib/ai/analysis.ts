/**
 * Analysis pipeline (spec §24–§27, §33, §34).
 *
 * One place where an observation becomes structured, safety-filtered,
 * persisted-able understanding:
 *
 *  1. adapter order is chosen from the user's runtime preference + privacy
 *     mode (privacy first: LOCAL_ONLY never touches the server path),
 *  2. each adapter is tried in order; a transport-level absence
 *     (`noRuntime: true`) falls through to the next, but a runtime that
 *     ANSWERED and failed stops the chain — that failure is real information,
 *  3. model output is schema-validated (adapter layer), re-scanned by the
 *     deterministic safety rules, and only then assembled into an AIAnalysis,
 *  4. a curiosity suggestion becomes a typed CuriosityAction and a mission
 *     candidate — both gated by the same deterministic safety layer as any
 *     other mission.
 *
 * If no runtime answers at all, the outcome is a typed `unavailable` analysis
 * with `engine: "unavailable"` — never an invented one.
 */
import {
  CuriosityActionSchema,
  MissionSchema,
  type AIAnalysis,
  type CuriosityAction,
  type CuriosityActionCategory,
  type Expedition,
  type Mission,
  type MissionType,
  type Observation,
  type PrivacyMode,
  type AIRuntimePreference,
} from "@/lib/domain/types";
import {
  CATEGORY_SAFETY_WARNINGS,
  missionSafetyLevel,
  reviewMissionText,
  scanTextForSafety,
  type SafetyScanResult,
} from "@/lib/safety/rules";
import { MAX_MISSIONS } from "@/lib/missions/engine";
import { clamp, nowIso, uuid } from "@/lib/utils";
import {
  LOCAL_ADAPTER_ID,
  SERVER_ADAPTER_ID,
  type AdapterAnalysisResult,
  type ModelInsight,
} from "@/lib/ai/adapter";
import { LocalGemmaAdapter } from "@/lib/ai/local-gemma";
import { ServerGemmaAdapter } from "@/lib/ai/server-gemma";

export type AnalysisKind = "local" | "server";

// ---------------------------------------------------------------------------
// Adapter selection
// ---------------------------------------------------------------------------

export interface AnalysisPreferences {
  aiRuntimePreference: AIRuntimePreference;
  privacyMode: PrivacyMode;
}

/**
 * The order adapters are tried in. Privacy is a hard constraint:
 *  - LOCAL_ONLY → on-device only, and only the on-device adapter ever
 *    receives image bytes,
 *  - AUTO tries on-device first, then the deployment's server if no local
 *    runtime answered,
 *  - CLOUD prefers the server (still text-only — images never leave the device).
 */
export function selectAnalysisOrder(prefs: AnalysisPreferences): AnalysisKind[] {
  if (prefs.privacyMode === "LOCAL_ONLY") return ["local"];
  if (prefs.aiRuntimePreference === "LOCAL") return ["local"];
  if (prefs.aiRuntimePreference === "CLOUD") return ["server"];
  return ["local", "server"];
}

/** Human sentence for the settings screen — mirrors selectAnalysisOrder exactly. */
export function describeAnalysisOrder(order: AnalysisKind[]): string {
  if (order.length === 1 && order[0] === "local") return "On-device only.";
  if (order.length === 1 && order[0] === "server") return "Server only.";
  return "On-device first, server as fallback.";
}

// ---------------------------------------------------------------------------
// Curiosity action → mission mapping
// ---------------------------------------------------------------------------

const CURIOSITY_TO_MISSION_TYPE: Record<CuriosityActionCategory, MissionType> = {
  LOOK: "OBSERVE",
  LISTEN: "LISTEN",
  WALK: "WALK",
  COMPARE: "COMPARE",
  SEARCH: "FIND",
  WAIT: "OBSERVE",
  NOTICE: "OBSERVE",
  SMELL_SAFE: "OBSERVE",
  PHOTOGRAPH: "PHOTOGRAPH",
  RECORD: "RECORD_AUDIO",
  REFLECT: "REFLECT",
};

/** Only actions that genuinely need the screen may keep requiresScreen. */
const SCREEN_ACTIONS: CuriosityActionCategory[] = ["PHOTOGRAPH", "RECORD"];

// ---------------------------------------------------------------------------
// Insight → persisted shapes
// ---------------------------------------------------------------------------

function confidenceParts(
  confidence: number,
  insight: ModelInsight
): { label: AIAnalysis["confidenceLabel"]; status: AIAnalysis["status"] } {
  const hasSomething =
    insight.commonName !== null || insight.confidence > 0 || insight.visualFeatures.length > 0;
  const label: AIAnalysis["confidenceLabel"] =
    confidence <= 0
      ? "unknown"
      : confidence >= 0.75
        ? "high"
        : confidence >= 0.45
          ? "medium"
          : "low";
  const status: AIAnalysis["status"] = hasSomething && confidence >= 0.45 ? "ok" : "low-confidence";
  return { label, status };
}

/**
 * Deterministic post-filter: the model's own suggestions can propose
 * physical actions, so every string a user will act on is re-scanned here.
 * Blocked content is withheld (not rendered, not persisted) and the analysis
 * carries a visible warning instead.
 */
function filterInsightText(insight: ModelInsight): {
  insight: ModelInsight;
  withheld: boolean;
  cautionWarnings: string[];
} {
  let withheld = false;
  const cautionWarnings: string[] = [];

  const scanField = (text: string | null): string | null => {
    if (text === null) return null;
    const scan: SafetyScanResult = scanTextForSafety(text);
    if (scan.level === "blocked") {
      withheld = true;
      return null;
    }
    cautionWarnings.push(...scan.warnings);
    return text;
  };

  let curiosity = insight.curiosity;
  if (curiosity) {
    const scan = scanTextForSafety(
      `${curiosity.shortInsight}\n${curiosity.physicalAction}\n${curiosity.nextMission ?? ""}`
    );
    if (scan.level === "blocked") {
      withheld = true;
      curiosity = null;
    } else {
      cautionWarnings.push(...scan.warnings);
    }
  }

  const visualFeatures = insight.visualFeatures.filter(
    (f) => scanTextForSafety(f).level !== "blocked"
  );

  return {
    insight: {
      ...insight,
      visualFeatures,
      safetyWarning: scanField(insight.safetyWarning),
      curiosityPrompt: scanField(insight.curiosityPrompt),
      suggestedNextAction: scanField(insight.suggestedNextAction),
      curiosity,
    },
    withheld,
    cautionWarnings,
  };
}

function mergedWarning(insight: ModelInsight, filterWarnings: string[]): string | null {
  const categoryWarning = CATEGORY_SAFETY_WARNINGS[insight.category] ?? null;
  const parts = [categoryWarning, ...filterWarnings, insight.safetyWarning].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0
  );
  if (parts.length === 0) return null;
  return Array.from(new Set(parts)).join(" ").slice(0, 500);
}

export interface AnalysisContext {
  observation: Pick<Observation, "id" | "category" | "note">;
  expedition: Pick<Expedition, "id" | "mode" | "environment">;
  preferences: AnalysisPreferences;
  imageDataUrl?: string | null;
  /** Existing board state, for the mission-candidate cap and dedup. */
  boardTitles: string[];
  boardCount: number;
  nextOrderIndex: number;
}

export interface AnalysisOutcome {
  analysis: AIAnalysis;
  /** AI-authored curiosity — replaces the rules action when present. */
  curiosityAction: CuriosityAction | null;
  /** Unpersisted mission candidate; the caller decides whether to add it. */
  suggestedMission: Mission | null;
  /** True when no runtime answered at all (stay quiet on the board). */
  unavailability: { noRuntime: boolean; adapterId: string | null } | null;
}

const WITHHELD_WARNING = "A suggested follow-up was withheld by TerraLens safety rules.";

/** Assemble an AI-authored CuriosityAction from a vetted suggestion. */
export function curiosityActionFromInsight(
  insight: ModelInsight,
  observationCategory: Observation["category"]
): CuriosityAction | null {
  const suggestion = insight.curiosity;
  if (!suggestion) return null;

  const actionKind = suggestion.actionKind;
  const textScan = scanTextForSafety(
    `${insight.curiosityPrompt ?? ""}\n${suggestion.shortInsight}\n${suggestion.physicalAction}`
  );
  if (textScan.level === "blocked") return null;

  const categoryScan = missionSafetyLevel(observationCategory);
  const safetyLevel: CuriosityAction["safetyLevel"] =
    textScan.level === "caution" || categoryScan.level === "caution" ? "caution" : "safe";

  const parsed = CuriosityActionSchema.safeParse({
    shortInsight: suggestion.shortInsight.slice(0, 400),
    physicalAction: suggestion.physicalAction.slice(0, 600),
    nextMission: suggestion.nextMission
      ? suggestion.nextMission.trim().slice(0, 500) || null
      : null,
    estimatedMinutes: clamp(Math.round(suggestion.estimatedMinutes), 1, 60),
    requiresScreen: SCREEN_ACTIONS.includes(actionKind) && suggestion.requiresScreen,
    safetyLevel,
    category: actionKind,
    generatedBy: "gemma",
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Mission candidate from the AI suggestion. Runs through the SAME deterministic
 * safety layer as every authored mission; blocked, duplicate or oversized
 * candidates simply don't exist.
 */
export function missionFromInsight(ctx: AnalysisContext, insight: ModelInsight): Mission | null {
  const suggestion = insight.curiosity;
  if (!suggestion) return null;
  if (ctx.boardCount >= MAX_MISSIONS) return null;

  const title = (suggestion.nextMission ?? insight.suggestedNextAction ?? "").trim();
  if (title.length < 3) return null;
  const normalized = title.toLowerCase();
  if (ctx.boardTitles.some((t) => t.trim().toLowerCase() === normalized)) return null;

  const instruction = suggestion.physicalAction.trim().slice(0, 600);
  if (instruction.length < 1) return null;

  const safety = reviewMissionText(title.slice(0, 140), instruction);
  if (safety.level === "blocked") return null;

  const parsed = MissionSchema.safeParse({
    id: uuid(),
    expeditionId: ctx.expedition.id,
    type: CURIOSITY_TO_MISSION_TYPE[suggestion.actionKind],
    title: title.slice(0, 140),
    instruction,
    whyItMatters: suggestion.shortInsight.slice(0, 400),
    estimatedMinutes: clamp(Math.round(suggestion.estimatedMinutes), 1, 120),
    status: "AVAILABLE",
    orderIndex: ctx.nextOrderIndex,
    createdAt: nowIso(),
    completedAt: null,
    observationIds: [],
    generatedBy: "gemma",
    offlineCapable: true,
    safetyMetadata: safety,
    syncStatus: "local-only",
    origin: "live",
    updatedAt: nowIso(),
  });
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

function okOutcome(
  ctx: AnalysisContext,
  result: Extract<AdapterAnalysisResult, { kind: "ok" }>
): AnalysisOutcome {
  const filtered = filterInsightText(result.insight);
  const insight = filtered.insight;
  const { label, status } = confidenceParts(insight.confidence, insight);
  const warningParts = [...filtered.cautionWarnings];
  if (filtered.withheld) warningParts.unshift(WITHHELD_WARNING);

  const analysis: AIAnalysis = {
    id: uuid(),
    observationId: ctx.observation.id,
    engine: result.via,
    runtime: result.via === LOCAL_ADAPTER_ID ? "on-device" : "server",
    model: result.model,
    status,
    category: insight.category,
    commonName: insight.commonName,
    scientificName: insight.scientificName,
    confidence: insight.confidence,
    confidenceLabel: label,
    visualFeatures: insight.visualFeatures,
    uncertainty: insight.uncertainty.slice(0, 400),
    safetyWarning: mergedWarning(insight, warningParts),
    curiosityPrompt: insight.curiosityPrompt,
    suggestedNextAction: insight.suggestedNextAction,
    latencyMs: result.latencyMs,
    unavailableReason: null,
    createdAt: nowIso(),
  };

  return {
    analysis,
    curiosityAction: curiosityActionFromInsight(insight, ctx.observation.category),
    suggestedMission: missionFromInsight(ctx, insight),
    unavailability: null,
  };
}

function unavailableOutcome(
  ctx: AnalysisContext,
  result: Extract<AdapterAnalysisResult, { kind: "unavailable" }>,
  adapterId: string | null
): AnalysisOutcome {
  const runtime: AIAnalysis["runtime"] =
    adapterId === LOCAL_ADAPTER_ID
      ? "on-device"
      : adapterId === SERVER_ADAPTER_ID
        ? "server"
        : "none";
  const categoryWarning = CATEGORY_SAFETY_WARNINGS[ctx.observation.category] ?? null;
  const analysis: AIAnalysis = {
    id: uuid(),
    observationId: ctx.observation.id,
    engine:
      adapterId === LOCAL_ADAPTER_ID || adapterId === SERVER_ADAPTER_ID ? adapterId : "unavailable",
    runtime,
    model: null,
    status: "unavailable",
    category: "unknown",
    commonName: null,
    scientificName: null,
    confidence: 0,
    confidenceLabel: "unknown",
    visualFeatures: [],
    uncertainty: "",
    safetyWarning: categoryWarning,
    curiosityPrompt: null,
    suggestedNextAction: null,
    latencyMs: result.latencyMs,
    unavailableReason: result.reason.slice(0, 400),
    createdAt: nowIso(),
  };
  return {
    analysis,
    curiosityAction: null,
    suggestedMission: null,
    unavailability: { noRuntime: result.noRuntime, adapterId },
  };
}

/**
 * Run the full pipeline for one observation. Never throws — every failure
 * path is a typed outcome, because analysis must not break the expedition loop.
 */
export async function analyzeObservation(ctx: AnalysisContext): Promise<AnalysisOutcome> {
  const order = selectAnalysisOrder(ctx.preferences);
  let lastNoRuntime: {
    result: Extract<AdapterAnalysisResult, { kind: "unavailable" }>;
    adapterId: string;
  } | null = null;

  for (const kind of order) {
    const adapterId = kind === "local" ? LOCAL_ADAPTER_ID : SERVER_ADAPTER_ID;
    let result: AdapterAnalysisResult;
    try {
      if (kind === "local") {
        const adapter = new LocalGemmaAdapter();
        result = await adapter.analyze(
          {
            observationId: ctx.observation.id,
            note: ctx.observation.note,
            category: ctx.observation.category,
            expeditionMode: ctx.expedition.mode,
            environment: ctx.expedition.environment,
            hasImage: Boolean(ctx.imageDataUrl),
          },
          ctx.imageDataUrl ?? null
        );
      } else {
        const adapter = new ServerGemmaAdapter();
        // Image bytes are never forwarded to the server adapter — by contract.
        result = await adapter.analyze({
          observationId: ctx.observation.id,
          note: ctx.observation.note,
          category: ctx.observation.category,
          expeditionMode: ctx.expedition.mode,
          environment: ctx.expedition.environment,
          hasImage: Boolean(ctx.imageDataUrl),
        });
      }
    } catch {
      result = {
        kind: "unavailable",
        reason: "The analysis adapter failed unexpectedly.",
        latencyMs: null,
        noRuntime: true,
      };
    }

    if (result.kind === "ok") return okOutcome(ctx, result);
    if (!result.noRuntime) {
      // A runtime answered and failed — surface that honestly instead of
      // silently trying a different engine.
      return unavailableOutcome(ctx, result, adapterId);
    }
    lastNoRuntime = { result, adapterId };
  }

  if (lastNoRuntime) {
    return unavailableOutcome(ctx, lastNoRuntime.result, lastNoRuntime.adapterId);
  }
  return unavailableOutcome(
    ctx,
    {
      kind: "unavailable",
      reason: "No analysis runtime is available.",
      latencyMs: null,
      noRuntime: true,
    },
    null
  );
}
