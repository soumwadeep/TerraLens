/**
 * Centralized configuration. `process.env` is read HERE and nowhere else.
 *
 * Principles (see master spec §48, §78, §49):
 *  - Optional integrations must never prevent the app from booting.
 *  - "Configured" is derived from configuration; "READY" additionally requires
 *    a passing health check (src/lib/integrations/registry.ts).
 *  - Never expose secrets to the client: only NEXT_PUBLIC_* values are
 *    client-visible, and none of them can hold a secret.
 */
import { z } from "zod";

const FlagSchema = z
  .enum(["0", "1", ""])
  .optional()
  .transform((v) => v !== "0"); // default ON; explicit "0" disables even if credentials exist

function envFlag(name: string, raw: NodeJS.ProcessEnv): boolean {
  return FlagSchema.parse(raw[name]);
}

function optionalUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.toString().replace(/\/$/, "");
  } catch {
    // Render's `fromService property: host` yields a bare host
    // ("terralens-prediction.onrender.com") — normalize to https.
    if (/^[a-z0-9.-]+(:\d+)?(\/.*)?$/i.test(value)) {
      try {
        return new URL(`https://${value}`).toString().replace(/\/$/, "");
      } catch {
        return null;
      }
    }
    return null;
  }
}

export interface ServerConfig {
  appUrl: string | null;
  gemma: {
    baseUrl: string | null;
    model: string;
    /** Optional embedding model for Tiger Data vector search; unset → text search only. */
    embeddingModel: string | null;
    apiKey: string | null;
    timeoutMs: number;
  };
  fieldAgentEnabled: boolean;
  tinker: {
    apiKey: string | null;
    baseModel: string;
    adapterName: string;
  };
  mongo: {
    uri: string | null;
    dbName: string;
  };
  tiger: {
    url: string | null;
  };
  temporal: {
    address: string | null;
    namespace: string;
    taskQueue: string;
    apiKey: string | null;
    tls: boolean;
  };
  elevenlabs: {
    apiKey: string | null;
    voiceId: string;
    model: string;
  };
  serpapi: {
    apiKey: string | null;
  };
  prediction: {
    serviceUrl: string | null;
    serviceKey: string | null;
  };
  backboard: {
    apiUrl: string | null;
    apiKey: string | null;
    assistantId: string | null;
  };
  sentry: {
    dsn: string | null;
    org: string | null;
    project: string | null;
    authToken: string | null;
  };
  auth: {
    secret: string | null;
    sessionDays: number;
  };
  flags: {
    serverAI: boolean;
    elevenlabs: boolean;
    tabpfn: boolean;
    backboard: boolean;
    serpapi: boolean;
    tiger: boolean;
    temporal: boolean;
    mongodb: boolean;
  };
}

let cachedServerConfig: ServerConfig | null = null;

export function getServerConfig(): ServerConfig {
  if (cachedServerConfig) return cachedServerConfig;
  const raw = process.env;

  // Fail-safe parsing: a malformed optional value degrades to "not configured"
  // instead of crashing boot.
  const gemmaBase = optionalUrl(raw.GEMMA_BASE_URL);
  const timeout = Number.parseInt(raw.GEMMA_TIMEOUT_MS ?? "45000", 10);

  cachedServerConfig = {
    appUrl: optionalUrl(raw.NEXT_PUBLIC_APP_URL),
    gemma: {
      baseUrl: gemmaBase,
      model: raw.GEMMA_MODEL?.trim() || "gemma3:4b",
      embeddingModel: raw.GEMMA_EMBEDDING_MODEL?.trim() || null,
      apiKey: raw.GEMMA_API_KEY?.trim() || null,
      timeoutMs: Number.isFinite(timeout) && timeout > 1000 ? timeout : 45000,
    },
    fieldAgentEnabled: raw.FIELD_AGENT_ENABLED !== "0",
    tinker: {
      apiKey: raw.TINKER_API_KEY?.trim() || null,
      baseModel: raw.TINKER_BASE_MODEL?.trim() || "meta-llama/Llama-3.1-8B",
      adapterName: raw.TINKER_ADAPTER_NAME?.trim() || "terralens-curiosity-v1",
    },
    mongo: {
      uri: raw.MONGODB_URI?.trim() || null,
      dbName: raw.MONGODB_DB?.trim() || "terralens",
    },
    tiger: {
      url: raw.TIGER_DATABASE_URL?.trim() || null,
    },
    temporal: {
      address: raw.TEMPORAL_ADDRESS?.trim() || null,
      namespace: raw.TEMPORAL_NAMESPACE?.trim() || "default",
      taskQueue: raw.TEMPORAL_TASK_QUEUE?.trim() || "terralens-expeditions",
      apiKey: raw.TEMPORAL_API_KEY?.trim() || null,
      tls: raw.TEMPORAL_TLS === "1",
    },
    elevenlabs: {
      apiKey: raw.ELEVENLABS_API_KEY?.trim() || null,
      voiceId: raw.ELEVENLABS_VOICE_ID?.trim() || "JBFqnCBsd6RMkjVDRZzb",
      model: raw.ELEVENLABS_MODEL?.trim() || "eleven_multilingual_v2",
    },
    serpapi: {
      apiKey: raw.SERPAPI_API_KEY?.trim() || null,
    },
    prediction: {
      serviceUrl: optionalUrl(raw.PREDICTION_SERVICE_URL),
      serviceKey: raw.PREDICTION_SERVICE_KEY?.trim() || null,
    },
    backboard: {
      // Default to the hosted API when a key is present but no URL is set.
      apiUrl:
        optionalUrl(raw.BACKBOARD_API_URL) ??
        (raw.BACKBOARD_API_KEY?.trim() ? "https://app.backboard.io/api" : null),
      apiKey: raw.BACKBOARD_API_KEY?.trim() || null,
      assistantId: raw.BACKBOARD_ASSISTANT_ID?.trim() || null,
    },
    sentry: {
      dsn: raw.NEXT_PUBLIC_SENTRY_DSN?.trim() || null,
      org: raw.SENTRY_ORG?.trim() || null,
      project: raw.SENTRY_PROJECT?.trim() || null,
      authToken: raw.SENTRY_AUTH_TOKEN?.trim() || null,
    },
    auth: {
      secret: raw.AUTH_SECRET?.trim() || null,
      sessionDays: Number.parseInt(raw.AUTH_SESSION_DAYS ?? "30", 10) || 30,
    },
    flags: {
      serverAI: envFlag("ENABLE_SERVER_AI", raw) && Boolean(gemmaBase),
      elevenlabs: envFlag("ENABLE_ELEVENLABS", raw) && Boolean(raw.ELEVENLABS_API_KEY?.trim()),
      tabpfn: envFlag("ENABLE_TABPFN", raw) && Boolean(raw.PREDICTION_SERVICE_URL?.trim()),
      backboard: envFlag("ENABLE_BACKBOARD", raw) && Boolean(raw.BACKBOARD_API_URL?.trim()),
      serpapi: envFlag("ENABLE_SERPAPI", raw) && Boolean(raw.SERPAPI_API_KEY?.trim()),
      tiger: envFlag("ENABLE_TIGER", raw) && Boolean(raw.TIGER_DATABASE_URL?.trim()),
      temporal: envFlag("ENABLE_TEMPORAL", raw) && Boolean(raw.TEMPORAL_ADDRESS?.trim()),
      mongodb: envFlag("ENABLE_MONGODB", raw) && Boolean(raw.MONGODB_URI?.trim()),
    },
  };
  return cachedServerConfig;
}

/** Config that is safe to inline into the client bundle (NEXT_PUBLIC_* only). */
export interface PublicConfig {
  appUrl: string | null;
  localAI: {
    url: string | null;
    model: string;
  };
  localModelPack: {
    url: string | null;
    bytes: number | null;
    version: string | null;
  };
  sentryDsn: string | null;
}

export function getPublicConfig(): PublicConfig {
  const bytes = Number.parseInt(process.env.NEXT_PUBLIC_LOCAL_MODEL_PACK_BYTES ?? "", 10);
  return {
    appUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || null,
    localAI: {
      url: optionalUrl(process.env.NEXT_PUBLIC_LOCAL_AI_URL),
      model: process.env.NEXT_PUBLIC_LOCAL_AI_MODEL?.trim() || "gemma3:4b",
    },
    localModelPack: {
      url: optionalUrl(process.env.NEXT_PUBLIC_LOCAL_MODEL_PACK_URL),
      bytes: Number.isFinite(bytes) && bytes > 0 ? bytes : null,
      version: process.env.NEXT_PUBLIC_LOCAL_MODEL_PACK_VERSION?.trim() || null,
    },
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || null,
  };
}

/**
 * Validate required pairings at startup (called from instrumentation.ts).
 * Returns human-readable warnings — never throws, because a missing optional
 * credential must not prevent local boot.
 */
export function validateConfig(env: NodeJS.ProcessEnv = process.env): string[] {
  const warnings: string[] = [];
  if (env.MONGODB_URI && !env.AUTH_SECRET) {
    warnings.push(
      "MONGODB_URI is set but AUTH_SECRET is missing — cloud accounts are disabled until AUTH_SECRET is provided."
    );
  }
  if (env.TEMPORAL_API_KEY && !env.TEMPORAL_ADDRESS) {
    warnings.push(
      "TEMPORAL_API_KEY is set but TEMPORAL_ADDRESS is missing — Temporal is disabled."
    );
  }
  if (env.GEMMA_API_KEY && !env.GEMMA_BASE_URL) {
    warnings.push("GEMMA_API_KEY is set but GEMMA_BASE_URL is missing — server AI is disabled.");
  }
  if (env.PREDICTION_SERVICE_KEY && !env.PREDICTION_SERVICE_URL) {
    warnings.push("PREDICTION_SERVICE_KEY is set but PREDICTION_SERVICE_URL is missing.");
  }
  if (env.AUTH_SECRET && env.AUTH_SECRET.length < 32) {
    warnings.push("AUTH_SECRET should be at least 32 characters.");
  }
  if (env.NEXT_PUBLIC_LOCAL_MODEL_PACK_URL && !env.NEXT_PUBLIC_LOCAL_MODEL_PACK_BYTES) {
    warnings.push(
      "NEXT_PUBLIC_LOCAL_MODEL_PACK_URL is set without NEXT_PUBLIC_LOCAL_MODEL_PACK_BYTES — the AI pack size will show as unknown."
    );
  }
  return warnings;
}

export const APP_NAME = "TerraLens";
export const APP_TAGLINE = "AI that sends you outside.";
export const APP_DESCRIPTION =
  "An offline-first AI field companion that helps you notice more, explore farther, and spend less time looking at your screen.";
