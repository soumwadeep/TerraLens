/**
 * Deployment integration registry (spec §48, §49) — server-only.
 *
 * The honesty contract lives here, in one place:
 *  - `configured` is a configuration fact (env values + feature flag).
 *  - `state: "ready"` is a claim about the live world, made only after a
 *    passing health check (or, for the Tinker workspace, a recorded real run).
 *  - Everything else is named exactly:
 *      not-configured — the config fact is missing; the integration is off
 *      unverified     — configured, but no live check exists from here
 *      not-run        — built, but the proving step has not been performed
 *      degraded       — answered, but with an observed limitation
 *      unreachable    — configured, but the live check failed
 *
 * Live checks are per-integration and cached briefly (TTL below) so a page
 * refresh never turns into a probe storm. Facts-only readers never touch the
 * network. /lab/models renders this; GET /api/integrations serves it.
 */
import { getPublicConfig, getServerConfig } from "@/lib/config";
import { getTinkerStatus } from "@/lib/ai/tinker";
import { probeModelEndpoint } from "@/lib/server/field-agent";
import { predictionConfigured, probePrediction } from "@/lib/server/prediction";
import { elevenlabsConfigured, probeElevenLabs } from "@/lib/server/elevenlabs";
import { sentryFacts } from "@/lib/telemetry";
import { backboardConfigured, probeBackboard } from "@/lib/server/backboard";
import { probeTiger, tigerConfigured } from "@/lib/server/tiger";
import { probeSerpApi, serpapiConfigured } from "@/lib/server/serpapi";
import { probeTaskQueue, temporalConfigured } from "@/lib/server/temporal-client";
import { getMongoDb, MongoUnavailableError, mongoConfigured } from "@/lib/server/mongodb";
import { sessionsConfigured } from "@/lib/server/session";

export type IntegrationState =
  "ready" | "degraded" | "not-run" | "unverified" | "not-configured" | "unreachable";

export interface IntegrationStatus {
  id: string;
  name: string;
  /** What the integration actually does inside TerraLens. */
  role: string;
  configured: boolean;
  state: IntegrationState;
  /** One honest sentence about the current state. */
  detail: string;
  /** When the live check ran; null = fact-only (never probed or not probed yet). */
  checkedAt: string | null;
  /** Small extra facts — never secrets, never raw DSNs or keys. */
  facts: Record<string, string | number | boolean | null>;
}

type StatusBody = Omit<IntegrationStatus, "id" | "name" | "role">;

interface RegistryEntry {
  id: string;
  facts: () => Promise<IntegrationStatus>;
  /** Runs only when `configured` is true; every probe is per-integration. */
  live?: () => Promise<StatusBody>;
}

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; status: IntegrationStatus }>();

// ---------------------------------------------------------------------------
// Entry builders
// ---------------------------------------------------------------------------

function entry(def: {
  id: string;
  name: string;
  role: string;
  facts: () => Promise<StatusBody>;
  live?: () => Promise<StatusBody>;
}): RegistryEntry {
  const { id, name, role } = def;
  const live = def.live;
  return {
    id,
    facts: async () => ({ id, name, role, ...(await def.facts()) }),
    live: live ? async () => ({ id, name, role, ...(await live()) }) : undefined,
  };
}

const now = () => new Date().toISOString();

const ENTRIES: RegistryEntry[] = [
  entry({
    id: "server-ai",
    name: "Field Agent (server AI)",
    role: "Mastra recap agent over an OpenAI-compatible model endpoint",
    facts: async () => {
      const cfg = getServerConfig();
      const configured = cfg.flags.serverAI;
      return {
        configured,
        state: configured ? "unverified" : "not-configured",
        detail: configured
          ? "The endpoint is configured; run the live check to prove it answers."
          : "GEMMA_BASE_URL is not set (or ENABLE_SERVER_AI is off).",
        checkedAt: null,
        facts: {
          endpointConfigured: cfg.gemma.baseUrl !== null,
          model: cfg.gemma.model,
          fieldAgentEnabled: cfg.fieldAgentEnabled,
          timeoutMs: cfg.gemma.timeoutMs,
        },
      };
    },
    live: async () => {
      const cfg = getServerConfig();
      const probe = await probeModelEndpoint();
      const state: IntegrationState = !probe.reachable
        ? "unreachable"
        : probe.httpStatus === 200
          ? "ready"
          : "degraded";
      return {
        configured: true,
        state,
        detail: probe.detail,
        checkedAt: now(),
        facts: {
          model: cfg.gemma.model,
          httpStatus: probe.httpStatus,
          fieldAgentEnabled: cfg.fieldAgentEnabled,
        },
      };
    },
  }),

  entry({
    id: "local-ai",
    name: "On-device AI (local model pack)",
    role: "In-browser inference path for offline devices",
    // No live check from the server: the local server runs on the visitor's
    // device. The AI Pack card in Settings probes it in the browser.
    facts: async () => {
      const pub = getPublicConfig();
      const configured = pub.localAI.url !== null;
      return {
        configured,
        state: configured ? "unverified" : "not-configured",
        detail: configured
          ? "Probed in the browser by the AI Pack card — a device may simply not be running the local server."
          : "NEXT_PUBLIC_LOCAL_AI_URL is not set — AI runs against the server endpoint or the rules-only fallback.",
        checkedAt: null,
        facts: {
          url: pub.localAI.url,
          model: pub.localAI.model,
          packBytes: pub.localModelPack.bytes,
          packVersion: pub.localModelPack.version,
        },
      };
    },
  }),

  entry({
    id: "tinker",
    name: "Tinker (curiosity fine-tune)",
    role: "LoRA recipe for the curiosity adapter + honest evaluation",
    // Local workspace read (not a network call): the recorded evaluation run
    // is itself the proof — "ready" requires a completed real run.
    facts: async () => {
      const cfg = getServerConfig();
      const status = await getTinkerStatus();
      const dataset = status.dataset;
      const evaluation = status.evaluation;
      const baseFacts = {
        seedRows: dataset.seedRows,
        trainRows: dataset.trainRows,
        exportPresent: dataset.exportPresent,
        adapterName: cfg.tinker.adapterName,
        baseModel: cfg.tinker.baseModel,
        tinkerKeyPresent: cfg.tinker.apiKey !== null,
        evalVersion: evaluation.version,
      };
      if (!status.workspacePresent) {
        return {
          configured: false,
          state: "not-configured",
          detail: "The ai/tinker workspace is missing from this checkout.",
          checkedAt: null,
          facts: baseFacts,
        };
      }
      if (evaluation.status === "completed") {
        return {
          configured: true,
          state: "ready",
          detail: `Evaluation recorded — ${evaluation.model} over ${evaluation.datasetSize} examples${
            evaluation.runAt ? ` (${evaluation.runAt})` : ""
          }.`,
          checkedAt: evaluation.runAt,
          facts: { ...baseFacts, evalStatus: evaluation.status },
        };
      }
      if (evaluation.status === "failed") {
        return {
          configured: true,
          state: "degraded",
          detail: evaluation.notes,
          checkedAt: null,
          facts: { ...baseFacts, evalStatus: evaluation.status },
        };
      }
      return {
        configured: true,
        state: "not-run",
        detail:
          "The workspace and dataset are present, but no evaluation is recorded — fine-tune on Tinker's platform, then run `pnpm tinker:evaluate` against the served checkpoint.",
        checkedAt: null,
        facts: { ...baseFacts, evalStatus: evaluation.status },
      };
    },
  }),

  entry({
    id: "tabpfn",
    name: "TabPFN (prediction boundary)",
    role: "Bird/insect/flower/rain likelihoods from the prediction service",
    facts: async () => {
      const cfg = getServerConfig();
      const configured = predictionConfigured();
      return {
        configured,
        state: configured ? "unverified" : "not-configured",
        detail: configured
          ? "The prediction service URL is set; run the live check to prove it answers."
          : "PREDICTION_SERVICE_URL is not set (or ENABLE_TABPFN is off).",
        checkedAt: null,
        facts: { serviceKeyPresent: cfg.prediction.serviceKey !== null },
      };
    },
    live: async () => {
      const probe = await probePrediction();
      const state: IntegrationState =
        probe.state === "ready"
          ? "ready"
          : probe.state === "model-missing"
            ? "degraded"
            : probe.state === "not-configured"
              ? "not-configured"
              : "unreachable";
      return {
        configured: true,
        state,
        detail: probe.detail,
        checkedAt: probe.at,
        facts: {
          trained: probe.trained,
          modelVersion: probe.modelVersion,
          latencyMs: probe.latencyMs,
        },
      };
    },
  }),

  entry({
    id: "elevenlabs",
    name: "ElevenLabs (voice)",
    role: "Text-to-speech for the voice guide — key stays server-side",
    facts: async () => {
      const cfg = getServerConfig();
      const configured = elevenlabsConfigured();
      return {
        configured,
        state: configured ? "unverified" : "not-configured",
        detail: configured
          ? "The API key is set; run the live check to prove ElevenLabs accepts it."
          : "ELEVENLABS_API_KEY is not set (or ENABLE_ELEVENLABS is off) — the browser voice still speaks.",
        checkedAt: null,
        facts: { voiceId: cfg.elevenlabs.voiceId, model: cfg.elevenlabs.model },
      };
    },
    live: async () => {
      const probe = await probeElevenLabs();
      const state: IntegrationState =
        probe.state === "ready"
          ? "ready"
          : probe.state === "unauthorized"
            ? "degraded"
            : probe.state === "not-configured"
              ? "not-configured"
              : "unreachable";
      return {
        configured: true,
        state,
        detail: probe.detail,
        checkedAt: probe.at,
        facts: { tier: probe.tier, latencyMs: probe.latencyMs },
      };
    },
  }),

  entry({
    id: "backboard",
    name: "Backboard (memory)",
    role: "Long-term assistant memory across expeditions",
    facts: async () => {
      const cfg = getServerConfig();
      const configured = backboardConfigured();
      return {
        configured,
        state: configured ? "unverified" : "not-configured",
        detail: configured
          ? "The API URL and key are set; run the live check to prove memories answer."
          : "BACKBOARD_API_KEY is not set (or ENABLE_BACKBOARD is off).",
        checkedAt: null,
        facts: {
          assistantIdPresent: cfg.backboard.assistantId !== null,
        },
      };
    },
    live: async () => {
      const probe = await probeBackboard();
      const state: IntegrationState =
        probe.state === "ready"
          ? "ready"
          : probe.state === "not-configured"
            ? "not-configured"
            : probe.state === "unreachable"
              ? "unreachable"
              : "degraded";
      return {
        configured: true,
        state,
        detail: probe.detail,
        checkedAt: probe.at,
        facts: { memoryCount: probe.totalCount, latencyMs: probe.latencyMs },
      };
    },
  }),

  entry({
    id: "tiger",
    name: "Tiger Data (knowledge)",
    role: "Postgres + pgvector knowledge base for nature context",
    facts: async () => {
      const configured = tigerConfigured();
      return {
        configured,
        state: configured ? "unverified" : "not-configured",
        detail: configured
          ? "TIGER_DATABASE_URL is set; run the live check to prove the knowledge table answers."
          : "TIGER_DATABASE_URL is not set (or ENABLE_TIGER is off).",
        checkedAt: null,
        facts: {},
      };
    },
    live: async () => {
      const probe = await probeTiger();
      const state: IntegrationState =
        probe.state === "ready"
          ? "ready"
          : probe.state === "not-configured"
            ? "not-configured"
            : probe.state === "schema-missing"
              ? "degraded"
              : "unreachable";
      return {
        configured: true,
        state,
        detail: probe.detail,
        checkedAt: now(),
        facts: { records: probe.records, pgvector: probe.pgvector },
      };
    },
  }),

  entry({
    id: "serpapi",
    name: "SerpApi (online context)",
    role: "Species/place context when the network exists",
    facts: async () => {
      const configured = serpapiConfigured();
      return {
        configured,
        state: configured ? "unverified" : "not-configured",
        detail: configured
          ? "The API key is set; run the live check to prove the account answers."
          : "SERPAPI_API_KEY is not set (or ENABLE_SERPAPI is off).",
        checkedAt: null,
        facts: {},
      };
    },
    live: async () => {
      const probe = await probeSerpApi();
      const state: IntegrationState =
        probe.state === "ready"
          ? "ready"
          : probe.state === "not-configured"
            ? "not-configured"
            : probe.state === "unreachable"
              ? "unreachable"
              : "degraded";
      return {
        configured: true,
        state,
        detail: probe.detail,
        checkedAt: probe.at,
        facts: { searchesLeft: probe.searchesLeft, latencyMs: probe.latencyMs },
      };
    },
  }),

  entry({
    id: "temporal",
    name: "Temporal (workflows)",
    role: "Durable expedition recap workflows (workers/temporal)",
    facts: async () => {
      const cfg = getServerConfig();
      const configured = temporalConfigured();
      return {
        configured,
        state: configured ? "unverified" : "not-configured",
        detail: configured
          ? "The cluster address is set; run the live check to see whether a worker is polling."
          : "TEMPORAL_ADDRESS is not set (or ENABLE_TEMPORAL is off).",
        checkedAt: null,
        facts: {
          namespace: cfg.temporal.namespace,
          taskQueue: cfg.temporal.taskQueue,
          tls: cfg.temporal.tls,
        },
      };
    },
    live: async () => {
      const cfg = getServerConfig();
      const probe = await probeTaskQueue();
      const state: IntegrationState = probe.reachable && probe.pollers > 0 ? "ready" : "degraded";
      return {
        configured: true,
        state,
        detail: probe.detail,
        checkedAt: now(),
        facts: {
          pollers: probe.pollers,
          namespace: cfg.temporal.namespace,
          taskQueue: cfg.temporal.taskQueue,
        },
      };
    },
  }),

  entry({
    id: "mongodb",
    name: "MongoDB Atlas (cloud sync)",
    role: "Storage for accounts, sync, recaps, and agent traces",
    facts: async () => {
      const cfg = getServerConfig();
      const configured = mongoConfigured();
      const authReady = sessionsConfigured();
      if (!configured) {
        return {
          configured: false,
          state: "not-configured",
          detail: "MONGODB_URI is not set (or ENABLE_MONGODB is off) — the app stays local-only.",
          checkedAt: null,
          facts: { dbName: cfg.mongo.dbName, authConfigured: authReady },
        };
      }
      return {
        configured: true,
        state: authReady ? "unverified" : "degraded",
        detail: authReady
          ? "The Atlas URI is set; run the live check to prove the cluster answers."
          : "The Atlas URI is set, but AUTH_SECRET is missing — cloud accounts and sync are disabled until it is provided.",
        checkedAt: null,
        facts: { dbName: cfg.mongo.dbName, authConfigured: authReady },
      };
    },
    live: async () => {
      const cfg = getServerConfig();
      const authReady = sessionsConfigured();
      const db = await getMongoDb();
      if (!db) {
        return {
          configured: false,
          state: "not-configured",
          detail: "MONGODB_URI is not set (or ENABLE_MONGODB is off) — the app stays local-only.",
          checkedAt: now(),
          facts: { dbName: cfg.mongo.dbName, authConfigured: authReady },
        };
      }
      await db.command({ ping: 1 });
      return {
        configured: true,
        state: authReady ? "ready" : "degraded",
        detail: authReady
          ? "Atlas answered a ping."
          : "Atlas answered a ping, but AUTH_SECRET is missing — cloud accounts remain disabled.",
        checkedAt: now(),
        facts: { dbName: cfg.mongo.dbName, authConfigured: authReady },
      };
    },
  }),

  entry({
    id: "sentry",
    name: "Sentry (observability)",
    role: "Redacted error and agent-trace telemetry",
    // Fact-only: proving delivery would mean sending a test event into the
    // user's Sentry org, which this registry deliberately never does.
    facts: async () => {
      const s = sentryFacts();
      if (!s.configured) {
        return {
          configured: false,
          state: "not-configured",
          detail:
            "NEXT_PUBLIC_SENTRY_DSN is not set — the in-app telemetry ring buffer is the only observability.",
          checkedAt: null,
          facts: { org: s.org, project: s.project },
        };
      }
      if (s.state === "unavailable") {
        return {
          configured: true,
          state: "degraded",
          detail:
            "Sentry failed to initialize at boot — the in-app telemetry ring buffer still fills.",
          checkedAt: null,
          facts: { org: s.org, project: s.project },
        };
      }
      return {
        configured: true,
        state: "unverified",
        detail:
          "The DSN is set and the SDK initialized with redaction; delivery is not claimed because this registry never sends a test event.",
        checkedAt: null,
        facts: { org: s.org, project: s.project },
      };
    },
  }),
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function statusFor(entry: RegistryEntry, live: boolean): Promise<IntegrationStatus> {
  const cached = cache.get(entry.id);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.status;

  if (!live || !entry.live) return entry.facts();

  const base = await entry.facts();
  if (!base.configured) return base;

  let status: IntegrationStatus;
  try {
    const body = await entry.live();
    status = { id: entry.id, name: base.name, role: base.role, ...body };
  } catch (error) {
    const message =
      error instanceof MongoUnavailableError
        ? error.message
        : error instanceof Error
          ? `The live check failed: ${error.message}`
          : "The live check failed.";
    status = { ...base, state: "unreachable", detail: message, checkedAt: now() };
  }
  cache.set(entry.id, { at: Date.now(), status });
  return status;
}

/**
 * Facts-only by default — no network calls. With `{ live: true }`, each
 * configured integration also runs its own health check (cached ~60 s).
 */
export async function getIntegrationStatuses(
  options: { live?: boolean } = {}
): Promise<IntegrationStatus[]> {
  const live = options.live === true;
  return Promise.all(ENTRIES.map((item) => statusFor(item, live)));
}
