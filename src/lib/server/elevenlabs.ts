/**
 * ElevenLabs adapter (spec §6c, §48) — server-only.
 *
 * The API key NEVER reaches the browser (the voice route proxies TTS). This
 * module only adds the live health check the integration registry needs:
 * `GET /v1/user` proves the key is accepted without spending a character.
 */
import { getServerConfig } from "@/lib/config";

const PROBE_TIMEOUT_MS = 8_000;

export type ElevenLabsFailureState = "not-configured" | "unauthorized" | "unreachable";

export interface ElevenLabsProbe {
  configured: boolean;
  state: "ready" | ElevenLabsFailureState;
  detail: string;
  tier: string | null;
  latencyMs: number | null;
  at: string;
}

export function elevenlabsConfigured(): boolean {
  const cfg = getServerConfig();
  return cfg.flags.elevenlabs && Boolean(cfg.elevenlabs.apiKey);
}

/** Live check: GET /v1/user — proves the key without spending TTS characters. */
export async function probeElevenLabs(): Promise<ElevenLabsProbe> {
  const at = new Date().toISOString();
  const cfg = getServerConfig();
  if (!elevenlabsConfigured() || !cfg.elevenlabs.apiKey) {
    return {
      configured: false,
      state: "not-configured",
      detail: "ELEVENLABS_API_KEY is not set (or ENABLE_ELEVENLABS is off).",
      tier: null,
      latencyMs: null,
      at,
    };
  }

  const startedAt = Date.now();
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user", {
      headers: { "xi-api-key": cfg.elevenlabs.apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - startedAt;

    if (res.status === 401 || res.status === 403) {
      return {
        configured: true,
        state: "unauthorized",
        detail: `ElevenLabs rejected the API key (HTTP ${res.status}).`,
        tier: null,
        latencyMs,
        at,
      };
    }
    if (!res.ok) {
      return {
        configured: true,
        state: "unreachable",
        detail: `ElevenLabs answered HTTP ${res.status}.`,
        tier: null,
        latencyMs,
        at,
      };
    }

    let tier: string | null = null;
    try {
      const body = (await res.json()) as { subscription?: { tier?: unknown } };
      if (typeof body.subscription?.tier === "string") tier = body.subscription.tier;
    } catch {
      /* tier is decorative — the key check already passed */
    }
    return {
      configured: true,
      state: "ready",
      detail: tier ? `The key was accepted (${tier} tier).` : "The key was accepted.",
      tier,
      latencyMs,
      at,
    };
  } catch {
    return {
      configured: true,
      state: "unreachable",
      detail: "ElevenLabs did not answer.",
      tier: null,
      latencyMs: null,
      at,
    };
  }
}
