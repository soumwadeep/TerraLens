/**
 * TerraLens domain model (master spec §40).
 *
 * Every entity:
 *  - has a stable UUID generated locally (offline-first),
 *  - carries createdAt/updatedAt,
 *  - carries SyncStatus so offline-created entities can synchronize,
 *  - carries `origin` so DEMO fixtures can never masquerade as live data.
 *
 * All schemas are Zod so every persistence boundary (IndexedDB, API, LLM
 * output) is validated at runtime.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const IsoDateTime = z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
  message: "invalid ISO datetime",
});

export const SyncStatusSchema = z.enum([
  "local-only", // never touched the network yet
  "queued", // a sync operation is waiting
  "syncing",
  "synced",
  "failed",
  "conflict",
]);
export type SyncStatus = z.infer<typeof SyncStatusSchema>;

/** Demo entity provenance. Production paths must never create origin:"demo". */
export const OriginSchema = z.enum(["live", "demo"]);
export type Origin = z.infer<typeof OriginSchema>;

export const ObservationCategorySchema = z.enum([
  "plant",
  "flower",
  "tree",
  "bird",
  "insect",
  "animal",
  "fungus",
  "rock",
  "landscape",
  "sound",
  "texture",
  "weather",
  "other",
  "unknown",
]);
export type ObservationCategory = z.infer<typeof ObservationCategorySchema>;

export const ExpoModeSchema = z.enum([
  "nature",
  "birding",
  "photography",
  "mindful",
  "science",
  "family",
  "fitness",
  "surprise",
]);
export type ExpeditionMode = z.infer<typeof ExpoModeSchema>;

export const EnvironmentSchema = z.enum([
  "park",
  "garden",
  "forest",
  "neighbourhood",
  "campus",
  "countryside",
  "unknown",
]);
export type Environment = z.infer<typeof EnvironmentSchema>;

export const InterestSchema = z.enum([
  "plants",
  "birds",
  "photography",
  "walking",
  "science",
  "sounds",
  "mindfulness",
  "everything",
]);
export type Interest = z.infer<typeof InterestSchema>;

export const PrivacyModeSchema = z.enum(["LOCAL_ONLY", "HYBRID", "CLOUD_ENHANCED"]);
export type PrivacyMode = z.infer<typeof PrivacyModeSchema>;

export const AIRuntimePreferenceSchema = z.enum(["AUTO", "LOCAL", "CLOUD"]);
export type AIRuntimePreference = z.infer<typeof AIRuntimePreferenceSchema>;

export const LocationModeSchema = z.enum(["NONE", "APPROXIMATE", "PRECISE"]);
export type LocationMode = z.infer<typeof LocationModeSchema>;

// ---------------------------------------------------------------------------
// User & preferences
// ---------------------------------------------------------------------------

export const UserSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["guest", "account"]),
  email: z.string().nullish(),
  displayName: z.string().max(80).nullish(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type User = z.infer<typeof UserSchema>;

export const VoicePreferencesSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(["browser", "elevenlabs"]).default("browser"),
  voiceId: z.string().nullish(),
  speed: z.number().min(0.5).max(2).default(1),
  volumeGuidance: z.boolean().default(true),
});
export type VoicePreferences = z.infer<typeof VoicePreferencesSchema>;

export const AccessibilityPreferencesSchema = z.object({
  reducedMotion: z.boolean().default(false),
  highContrast: z.boolean().default(false),
  largeText: z.boolean().default(false),
  captions: z.boolean().default(true),
  largeTouchTargets: z.boolean().default(false),
});
export type AccessibilityPreferences = z.infer<typeof AccessibilityPreferencesSchema>;

export const MemoryPreferencesSchema = z.object({
  /** Keep a private, on-device journal of completed walks. */
  enabled: z.boolean().default(true),
  /** Explicit opt-in before any memory text leaves the device. */
  shareWithServer: z.boolean().default(false),
});
export type MemoryPreferences = z.infer<typeof MemoryPreferencesSchema>;

export const UserPreferencesSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  interests: z.array(InterestSchema).default([]),
  privacyMode: PrivacyModeSchema.default("HYBRID"),
  aiRuntimePreference: AIRuntimePreferenceSchema.default("AUTO"),
  locationMode: LocationModeSchema.default("NONE"),
  defaultEnvironment: EnvironmentSchema.default("unknown"),
  voice: VoicePreferencesSchema.default(() => VoicePreferencesSchema.parse({})),
  accessibility: AccessibilityPreferencesSchema.default(() =>
    AccessibilityPreferencesSchema.parse({})
  ),
  memory: MemoryPreferencesSchema.default(() => MemoryPreferencesSchema.parse({})),
  onboardingComplete: z.boolean().default(false),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

// ---------------------------------------------------------------------------
// Expedition
// ---------------------------------------------------------------------------

export const ExpeditionStatusSchema = z.enum([
  "PLANNED",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "ABANDONED",
]);
export type ExpeditionStatus = z.infer<typeof ExpeditionStatusSchema>;

export const ExpeditionStatsSchema = z.object({
  /** Seconds from expedition start to end while it was running. */
  elapsedSeconds: z.number().min(0).default(0),
  /** Estimated seconds where the app was in background/pocket (visibility API). */
  pocketSeconds: z.number().min(0).default(0),
  /** Seconds where the user was actively interacting (visibility visible + input). */
  screenActiveSeconds: z.number().min(0).default(0),
  /** Meters walked when geolocation permission is available. Null otherwise. */
  distanceMeters: z.number().min(0).nullable().default(null),
  /** Last moment the counters were updated — gaps after this are pocket time. */
  lastStatsAt: IsoDateTime.nullable().default(null),
  /** App-switch count during the expedition (anti-gaming input). */
  interruptions: z.number().int().min(0).default(0),
});
export type ExpeditionStats = z.infer<typeof ExpeditionStatsSchema>;

export const ExpeditionSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  title: z.string().min(1).max(120),
  durationMinutes: z.number().int().min(1).max(480),
  mode: ExpoModeSchema,
  environment: EnvironmentSchema.default("unknown"),
  status: ExpeditionStatusSchema.default("PLANNED"),
  startedAt: IsoDateTime.nullable().default(null),
  endedAt: IsoDateTime.nullable().default(null),
  /** Local calendar day key YYYY-MM-DD used for daily scoring. */
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stats: ExpeditionStatsSchema.default(() => ExpeditionStatsSchema.parse({})),
  story: z.string().max(4000).nullable().default(null),
  grassScoreId: z.uuid().nullable().default(null),
  syncStatus: SyncStatusSchema.default("local-only"),
  origin: OriginSchema.default("live"),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Expedition = z.infer<typeof ExpeditionSchema>;

// ---------------------------------------------------------------------------
// Mission
// ---------------------------------------------------------------------------

export const MissionTypeSchema = z.enum([
  "FIND",
  "LISTEN",
  "COMPARE",
  "WALK",
  "OBSERVE",
  "PHOTOGRAPH",
  "RECORD_AUDIO",
  "REFLECT",
  "COUNT",
  "NOTICE_CHANGE",
  "FOLLOW_CLUE",
]);
export type MissionType = z.infer<typeof MissionTypeSchema>;

export const MissionStatusSchema = z.enum([
  "LOCKED",
  "AVAILABLE",
  "ACTIVE",
  "COMPLETED",
  "SKIPPED",
  "EXPIRED",
]);
export type MissionStatus = z.infer<typeof MissionStatusSchema>;

export const SafetyLevelSchema = z.enum(["safe", "caution", "blocked"]);
export type SafetyLevel = z.infer<typeof SafetyLevelSchema>;

export const SafetyMetadataSchema = z.object({
  level: SafetyLevelSchema.default("safe"),
  warnings: z.array(z.string()).default([]),
  /** Which layer approved this mission: deterministic rules and/or the safety agent. */
  reviewedBy: z.enum(["rules", "safety-agent", "rules+safety-agent", "human"]).default("rules"),
});
export type SafetyMetadata = z.infer<typeof SafetyMetadataSchema>;

export const MissionSchema = z.object({
  id: z.uuid(),
  expeditionId: z.uuid(),
  type: MissionTypeSchema,
  title: z.string().min(1).max(140),
  instruction: z.string().min(1).max(600),
  whyItMatters: z.string().max(400).default(""),
  estimatedMinutes: z.number().min(1).max(120).default(5),
  status: MissionStatusSchema.default("AVAILABLE"),
  orderIndex: z.number().int().min(0).default(0),
  createdAt: IsoDateTime,
  completedAt: IsoDateTime.nullable().default(null),
  observationIds: z.array(z.uuid()).default([]),
  generatedBy: z.enum(["rules", "gemma", "curiosity-adapter", "demo"]).default("rules"),
  offlineCapable: z.boolean().default(true),
  safetyMetadata: SafetyMetadataSchema.default(() => SafetyMetadataSchema.parse({})),
  syncStatus: SyncStatusSchema.default("local-only"),
  origin: OriginSchema.default("live"),
  updatedAt: IsoDateTime,
});
export type Mission = z.infer<typeof MissionSchema>;

// ---------------------------------------------------------------------------
// Observation & media
// ---------------------------------------------------------------------------

export const ObservationTypeSchema = z.enum(["photo", "audio", "note"]);
export type ObservationType = z.infer<typeof ObservationTypeSchema>;

export const ObservationPrivacySchema = z.enum([
  "local-only", // media and analysis never leave the device
  "metadata-shared", // structured metadata syncs; media stays local
  "media-shared", // media uploaded with explicit consent
]);
export type ObservationPrivacy = z.infer<typeof ObservationPrivacySchema>;

export const ApproxLocationSchema = z.object({
  mode: z.enum(["APPROXIMATE", "PRECISE"]),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).nullable().default(null),
});
export type ApproxLocation = z.infer<typeof ApproxLocationSchema>;

export const AIAnalysisSchema = z.object({
  id: z.uuid(),
  observationId: z.uuid(),
  /** Which engine produced this — never mislabel a remote call as local. */
  engine: z.enum(["gemma-local", "gemma-server", "demo-fixture", "unavailable"]),
  runtime: z.enum(["on-device", "server", "demo", "none"]),
  model: z.string().nullable().default(null),
  status: z.enum(["ok", "low-confidence", "unavailable"]),
  category: ObservationCategorySchema.default("unknown"),
  commonName: z.string().nullable().default(null),
  scientificName: z.string().nullable().default(null),
  /** 0..1 — deliberately allowed to be low. The AI may say "I don't know." */
  confidence: z.number().min(0).max(1).default(0),
  confidenceLabel: z.enum(["high", "medium", "low", "unknown"]).default("unknown"),
  visualFeatures: z.array(z.string()).default([]),
  uncertainty: z.string().max(400).default(""),
  safetyWarning: z.string().max(500).nullable().default(null),
  curiosityPrompt: z.string().max(600).nullable().default(null),
  suggestedNextAction: z.string().max(400).nullable().default(null),
  latencyMs: z.number().min(0).nullable().default(null),
  unavailableReason: z.string().max(400).nullable().default(null),
  createdAt: IsoDateTime,
});
export type AIAnalysis = z.infer<typeof AIAnalysisSchema>;

export const ObservationSchema = z.object({
  id: z.uuid(),
  expeditionId: z.uuid(),
  missionId: z.uuid().nullable().default(null),
  userId: z.uuid(),
  type: ObservationTypeSchema,
  capturedAt: IsoDateTime,
  note: z.string().max(4000).default(""),
  /** Free-form tags derived from analysis or user input (used for diversity scoring). */
  tags: z.array(z.string().max(60)).max(30).default([]),
  category: ObservationCategorySchema.default("unknown"),
  mediaIds: z.array(z.uuid()).default([]),
  analysis: AIAnalysisSchema.nullable().default(null),
  userCorrection: z
    .object({
      commonName: z.string().max(120).nullable().default(null),
      category: ObservationCategorySchema.nullable().default(null),
      note: z.string().max(500).nullable().default(null),
      correctedAt: IsoDateTime,
    })
    .nullable()
    .default(null),
  privacy: ObservationPrivacySchema.default("local-only"),
  location: ApproxLocationSchema.nullable().default(null),
  syncStatus: SyncStatusSchema.default("local-only"),
  origin: OriginSchema.default("live"),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Observation = z.infer<typeof ObservationSchema>;

export const MediaAssetSchema = z.object({
  id: z.uuid(),
  observationId: z.uuid(),
  kind: z.enum(["photo", "audio"]),
  mimeType: z.string().min(1),
  sizeBytes: z.number().min(0),
  durationMs: z.number().min(0).nullable().default(null),
  width: z.number().int().min(0).nullable().default(null),
  height: z.number().int().min(0).nullable().default(null),
  /** IndexedDB blob store key. */
  blobKey: z.string().min(1),
  /** Optional SHA-256 for integrity; computed lazily where supported. */
  sha256: z.string().nullable().default(null),
  storage: z.enum(["indexeddb", "cloud"]).default("indexeddb"),
  uploadedAt: IsoDateTime.nullable().default(null),
  createdAt: IsoDateTime,
});
export type MediaAsset = z.infer<typeof MediaAssetSchema>;

// ---------------------------------------------------------------------------
// Grass Score
// ---------------------------------------------------------------------------

export const GrassRankSchema = z.enum([
  "seedling",
  "sprout",
  "explorer",
  "trailblazer",
  "naturalist",
  "wildmind",
]);
export type GrassRank = z.infer<typeof GrassRankSchema>;

export const GrassScoreComponentsSchema = z.object({
  outdoorDuration: z.number().min(0).max(250),
  pocketTime: z.number().min(0).max(200),
  missionCompletion: z.number().min(0).max(200),
  observationDiversity: z.number().min(0).max(150),
  distance: z.number().min(0).max(100),
  discoveryNovelty: z.number().min(0).max(50),
  streak: z.number().min(0).max(50),
});
export type GrassScoreComponents = z.infer<typeof GrassScoreComponentsSchema>;

export const GrassScoreInputsSchema = z.object({
  outdoorSeconds: z.number().min(0),
  pocketSeconds: z.number().min(0),
  screenActiveSeconds: z.number().min(0),
  distanceMeters: z.number().min(0).nullable(),
  missionsCompleted: z.number().min(0),
  missionsSkipped: z.number().min(0),
  observationCount: z.number().min(0),
  uniqueCategories: z.number().min(0),
  uniqueTags: z.number().min(0),
  newDiscoveries: z.number().min(0), // observations whose category/tag never seen for this user
  streakDays: z.number().min(0),
  environment: EnvironmentSchema,
  interruptionHeavy: z.boolean().default(false), // e.g. very short bursts — anti-gaming
});
export type GrassScoreInputs = z.infer<typeof GrassScoreInputsSchema>;

export const GrassScoreSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  expeditionId: z.uuid().nullable().default(null),
  scope: z.enum(["expedition", "day", "week"]).default("expedition"),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  score: z.number().min(0).max(1000),
  rank: GrassRankSchema,
  components: GrassScoreComponentsSchema,
  /** Transparent detail: every component plus anti-gaming adjustments. */
  notes: z.array(z.string()).max(20).default([]),
  gpsAvailable: z.boolean().default(false),
  computedAt: IsoDateTime,
  origin: OriginSchema.default("live"),
});
export type GrassScore = z.infer<typeof GrassScoreSchema>;

export const GrassScoreEventTypeSchema = z.enum([
  "observation",
  "mission",
  "pocket",
  "expedition",
  "streak",
  "diversity",
  "challenge",
]);
export type GrassScoreEventType = z.infer<typeof GrassScoreEventTypeSchema>;

export const GrassScoreEventSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  expeditionId: z.uuid().nullable().default(null),
  type: GrassScoreEventTypeSchema,
  points: z.number(),
  detail: z.string().max(300),
  createdAt: IsoDateTime,
  origin: OriginSchema.default("live"),
});
export type GrassScoreEvent = z.infer<typeof GrassScoreEventSchema>;

// ---------------------------------------------------------------------------
// Sync engine
// ---------------------------------------------------------------------------

export const SyncOperationNameSchema = z.enum(["CREATE", "UPDATE", "DELETE", "UPLOAD_MEDIA"]);
export type SyncOperationName = z.infer<typeof SyncOperationNameSchema>;

export const SyncOperationStatusSchema = z.enum([
  "QUEUED",
  "SYNCING",
  "SYNCED",
  "FAILED",
  "CONFLICT",
]);
export type SyncOperationStatus = z.infer<typeof SyncOperationStatusSchema>;

export const SYNC_ENTITY_TYPES = [
  "expedition",
  "mission",
  "observation",
  "media",
  "grassScore",
  "preferences",
] as const;
export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];

export const SyncOperationSchema = z.object({
  id: z.uuid(),
  entityId: z.uuid(),
  entityType: z.enum(SYNC_ENTITY_TYPES),
  operation: SyncOperationNameSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
  createdAt: IsoDateTime,
  attempts: z.number().int().min(0).default(0),
  lastAttempt: IsoDateTime.nullable().default(null),
  nextAttemptAt: IsoDateTime.nullable().default(null),
  status: SyncOperationStatusSchema.default("QUEUED"),
  lastError: z.string().max(500).nullable().default(null),
  origin: OriginSchema.default("live"),
});
export type SyncOperation = z.infer<typeof SyncOperationSchema>;

export const SyncEventSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  expeditionId: z.uuid().nullable().default(null),
  kind: z.enum(["sync-start", "sync-complete", "sync-failed", "conflict", "reconnect"]),
  detail: z.string().max(500),
  operations: z.number().int().min(0).default(0),
  createdAt: IsoDateTime,
});
export type SyncEvent = z.infer<typeof SyncEventSchema>;

// ---------------------------------------------------------------------------
// Prediction (TabPFN) — never LLM-fabricated
// ---------------------------------------------------------------------------

export const PredictionStatusSchema = z.enum([
  "ok",
  "insufficient-data",
  "not-configured",
  "unavailable",
]);
export type PredictionStatus = z.infer<typeof PredictionStatusSchema>;

export const PredictionSchema = z.object({
  id: z.uuid(),
  userId: z.uuid().nullable().default(null),
  status: PredictionStatusSchema,
  source: z.enum(["tabpfn-service", "insufficient-data", "not-configured"]),
  horizonDate: z.string().nullable().default(null),
  features: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).default({}),
  /** Named probability outputs only when the model actually produced them. */
  outputs: z
    .array(
      z.object({
        key: z.enum([
          "bird_activity",
          "insect_activity",
          "flower_likelihood",
          "rain_interruption",
          "best_window",
        ]),
        label: z.string(),
        probability: z.number().min(0).max(1).nullable(),
        window: z.string().nullable().default(null),
      })
    )
    .default([]),
  modelVersion: z.string().nullable().default(null),
  message: z.string().max(300).default(""),
  createdAt: IsoDateTime,
});
export type Prediction = z.infer<typeof PredictionSchema>;

// ---------------------------------------------------------------------------
// Nature knowledge (Tiger Data / pgvector)
// ---------------------------------------------------------------------------

export const KnowledgeRecordSchema = z.object({
  id: z.uuid(),
  slug: z.string().min(1).max(120),
  commonName: z.string().min(1).max(120),
  scientificName: z.string().max(160).nullable().default(null),
  category: ObservationCategorySchema,
  traits: z.array(z.string().max(120)).default([]),
  habitat: z.string().max(500).default(""),
  ecology: z.string().max(800).default(""),
  seasonality: z.array(z.string().max(120)).default([]),
  safeFacts: z.array(z.string().max(300)).default([]),
  region: z.string().max(120).nullable().default(null),
  source: z.enum(["bundled-seed", "tiger-database"]).default("bundled-seed"),
  similarity: z.number().nullable().default(null),
  createdAt: IsoDateTime,
});
export type KnowledgeRecord = z.infer<typeof KnowledgeRecordSchema>;

// ---------------------------------------------------------------------------
// Model evaluation (Tinker) — real values only
// ---------------------------------------------------------------------------

export const EvaluationMetricsSchema = z.object({
  outdoorActionRate: z.number().min(0).max(1),
  screenDependencyRate: z.number().min(0).max(1),
  avgResponseLength: z.number().min(0),
  safetyCompliance: z.number().min(0).max(1),
  missionRelevance: z.number().min(0).max(1),
  actionDiversity: z.number().min(0).max(1),
});
export type EvaluationMetrics = z.infer<typeof EvaluationMetricsSchema>;

export const ModelEvaluationSchema = z.object({
  id: z.string().min(1),
  adapterName: z.string().min(1),
  model: z.string().min(1),
  version: z.string().nullable().default(null),
  dataset: z.string().min(1),
  datasetSize: z.number().int().min(0),
  status: z.enum(["not-run", "completed", "failed"]),
  metrics: EvaluationMetricsSchema.nullable().default(null),
  runAt: IsoDateTime.nullable().default(null),
  notes: z.string().max(1000).default(""),
});
export type ModelEvaluation = z.infer<typeof ModelEvaluationSchema>;

// ---------------------------------------------------------------------------
// Agent trace metadata (Sentry-friendly, content-free)
// ---------------------------------------------------------------------------

export const AgentSpanSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  startedAt: IsoDateTime,
  durationMs: z.number().min(0),
  status: z.enum(["ok", "error", "skipped"]),
  /** NEVER raw user content — only whitelisted scalar attributes. */
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});
export type AgentSpan = z.infer<typeof AgentSpanSchema>;

export const AgentTraceSchema = z.object({
  id: z.uuid(), // correlation ID
  name: z.string().min(1).max(120),
  startedAt: IsoDateTime,
  durationMs: z.number().min(0),
  status: z.enum(["ok", "error"]),
  spans: z.array(AgentSpanSchema).default([]),
  origin: OriginSchema.default("live"),
});
export type AgentTrace = z.infer<typeof AgentTraceSchema>;

// ---------------------------------------------------------------------------
// Curiosity Engine output (spec §8)
// ---------------------------------------------------------------------------

export const CuriosityActionCategorySchema = z.enum([
  "LOOK",
  "LISTEN",
  "WALK",
  "COMPARE",
  "SEARCH",
  "WAIT",
  "NOTICE",
  "SMELL_SAFE",
  "PHOTOGRAPH",
  "RECORD",
  "REFLECT",
]);
export type CuriosityActionCategory = z.infer<typeof CuriosityActionCategorySchema>;

export const CuriosityActionSchema = z.object({
  shortInsight: z.string().min(1).max(400),
  physicalAction: z.string().min(1).max(600),
  nextMission: z.string().max(500).nullable().default(null),
  estimatedMinutes: z.number().min(1).max(60).default(5),
  /** The engine strongly prefers false. True only when the action genuinely needs the screen. */
  requiresScreen: z.boolean().default(false),
  safetyLevel: SafetyLevelSchema.default("safe"),
  category: CuriosityActionCategorySchema,
  generatedBy: z.enum(["rules", "gemma", "curiosity-adapter"]),
});
export type CuriosityAction = z.infer<typeof CuriosityActionSchema>;

// ---------------------------------------------------------------------------
// Long-term memory (spec §33) — local-first, server mirror is opt-in
// ---------------------------------------------------------------------------

export const MemoryKindSchema = z.enum(["expedition", "observation", "preference"]);
export type MemoryKind = z.infer<typeof MemoryKindSchema>;

export const MemoryRecordSchema = z.object({
  /** UUID when saved locally; server ids are prefixed "bb_" to stay distinct. */
  id: z.string().min(1).max(80),
  userId: z.uuid(),
  kind: MemoryKindSchema,
  title: z.string().min(1).max(140),
  body: z.string().min(1).max(1200),
  tags: z.array(z.string().min(1).max(40)).max(16).default([]),
  expeditionId: z.uuid().nullable().default(null),
  /** "local": device only. "synced": also mirrored to the memory server. */
  syncState: z.enum(["local", "synced"]).default("local"),
  createdAt: IsoDateTime,
  origin: OriginSchema.default("live"),
});
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;
