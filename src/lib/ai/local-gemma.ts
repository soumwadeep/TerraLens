/**
 * On-device Gemma adapter (spec §24–§27).
 *
 * Talks to whatever OpenAI-compatible runtime the user runs locally
 * (Ollama, LM Studio, llama.cpp server, vLLM…). Because it is on-device:
 *  - image bytes MAY be sent (they never leave the machine),
 *  - results work with zero internet connectivity,
 *  - "unreachable" is a normal, honest state — not an error to hide.
 */
import { getPublicConfig } from "@/lib/config";
import {
  LOCAL_ADAPTER_ID,
  LOCAL_DEFAULT_BASE_URL,
  buildAnalysisMessages,
  insightHasSubstance,
  parseModelInsight,
  type AdapterAnalysisResult,
  type AdapterProbe,
  type AIModelAdapter,
  type AnalysisRequest,
  type ChatMessage,
} from "@/lib/ai/adapter";

const PROBE_TIMEOUT_MS = 4000;

function baseUrl(): string {
  return getPublicConfig().localAI.url ?? LOCAL_DEFAULT_BASE_URL;
}

function modelName(): string {
  return getPublicConfig().localAI.model;
}

interface ModelsResponse {
  data?: Array<{ id?: unknown }>;
}

export class LocalGemmaAdapter implements AIModelAdapter {
  readonly id = LOCAL_ADAPTER_ID;
  readonly kind = "on-device" as const;

  modelId(): string | null {
    return modelName() || null;
  }

  /** Explicit configuration exists only when the user set NEXT_PUBLIC_LOCAL_AI_URL. */
  configured(): boolean {
    return getPublicConfig().localAI.url !== null;
  }

  /**
   * Real health check: ask the runtime which models it serves. The model being
   * *listed* is what distinguishes READY from MODEL-MISSING.
   */
  async probe(): Promise<AdapterProbe> {
    const startedAt = Date.now();
    const url = `${baseUrl()}/models`;
    const at = new Date().toISOString();
    try {
      const res = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        cache: "no-store",
      });
      const latencyMs = Date.now() - startedAt;
      if (!res.ok) {
        return {
          adapterId: this.id,
          at,
          state: "unreachable",
          detail: `Runtime answered HTTP ${res.status} at ${safeOrigin(url)}.`,
          models: [],
          latencyMs,
        };
      }
      const body = (await res.json()) as ModelsResponse;
      const models = (body.data ?? [])
        .map((m) => (typeof m.id === "string" ? m.id : null))
        .filter((m): m is string => m !== null)
        .slice(0, 50);
      const wanted = modelName();
      const hasModel = models.some((m) => m === wanted || m.split(":")[0] === wanted.split(":")[0]);
      return {
        adapterId: this.id,
        at,
        state: hasModel ? "ready" : "model-missing",
        detail: hasModel
          ? `On-device runtime at ${safeOrigin(url)} is serving ${wanted}.`
          : `Runtime at ${safeOrigin(url)} is up, but ${wanted} is not loaded.`,
        models,
        latencyMs,
      };
    } catch {
      return {
        adapterId: this.id,
        at,
        state: "unreachable",
        detail: `No on-device runtime answered at ${safeOrigin(url)}.`,
        models: [],
        latencyMs: null,
      };
    }
  }

  async analyze(
    request: AnalysisRequest,
    imageDataUrl?: string | null
  ): Promise<AdapterAnalysisResult> {
    const url = `${baseUrl()}/chat/completions`;
    const wanted = modelName();
    const startedAt = Date.now();

    const messages = buildAnalysisMessages(request);
    const payloadMessages = imageDataUrl ? withImage(messages, imageDataUrl) : messages;

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: wanted,
          messages: payloadMessages,
          temperature: 0.2,
          max_tokens: 800,
          stream: false,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(60_000),
        cache: "no-store",
      });
    } catch {
      return {
        kind: "unavailable",
        reason: `No on-device runtime answered at ${safeOrigin(url)}.`,
        latencyMs: null,
        noRuntime: true,
      };
    }

    const latencyMs = Date.now() - startedAt;
    if (!res.ok) {
      return {
        kind: "unavailable",
        reason: `On-device runtime responded HTTP ${res.status}.`,
        latencyMs,
        noRuntime: false,
      };
    }

    let content: string;
    try {
      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const raw = body.choices?.[0]?.message?.content;
      if (typeof raw !== "string" || raw.trim().length === 0) {
        return {
          kind: "unavailable",
          reason: "On-device model returned an empty response.",
          latencyMs,
          noRuntime: false,
        };
      }
      content = raw;
    } catch {
      return {
        kind: "unavailable",
        reason: "On-device model returned unparseable transport JSON.",
        latencyMs,
        noRuntime: false,
      };
    }

    const insight = parseModelInsight(content);
    if (!insight) {
      return {
        kind: "unavailable",
        reason: "On-device model answered, but the response did not match the required shape.",
        latencyMs,
        noRuntime: false,
      };
    }
    if (!insightHasSubstance(insight)) {
      return {
        kind: "unavailable",
        reason: "On-device model returned an empty analysis.",
        latencyMs,
        noRuntime: false,
      };
    }

    return { kind: "ok", insight, model: wanted, latencyMs, via: this.id };
  }
}

/** Ollama-style vision content: text part + image_url data URL. */
function withImage(
  messages: ChatMessage[],
  imageDataUrl: string
): Array<{ role: string; content: unknown }> {
  return messages.map((m, index) =>
    index === messages.length - 1 && m.role === "user"
      ? {
          role: m.role,
          content: [
            { type: "text", text: m.content },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        }
      : { role: m.role, content: m.content }
  );
}

/** Origin only — never render full URLs with query/key material in diagnostics. */
function safeOrigin(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "the configured endpoint";
  }
}
