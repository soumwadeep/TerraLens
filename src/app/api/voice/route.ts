/**
 * Voice proxy (spec §32, §49) — server-only.
 *
 * The ElevenLabs key NEVER reaches the browser: the client sends short text
 * (mission guidance only — never notes, story text, or photos), this route
 * synthesizes it server-side and streams the audio back. When the key is
 * absent or ElevenLabs fails, the response is a typed unavailable and the
 * client falls back to the browser's SpeechSynthesis — voice degrades, it
 * never breaks.
 *
 * Nothing here is logged: no text, no audio. Only counts and HTTP statuses.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getServerConfig } from "@/lib/config";
import { captureServerError } from "@/lib/telemetry";
import { nowIso } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Guidance text is short by contract; this is a hard cap, not a suggestion. */
const MAX_TEXT_CHARS = 1000;
const SYNTH_TIMEOUT_MS = 30_000;

export async function GET() {
  const cfg = getServerConfig();
  return NextResponse.json({
    elevenlabs: {
      configured: Boolean(cfg.elevenlabs.apiKey),
      enabled: cfg.flags.elevenlabs,
    },
    voiceId: cfg.elevenlabs.voiceId,
    model: cfg.elevenlabs.model,
    maxTextChars: MAX_TEXT_CHARS,
    at: nowIso(),
  });
}

const PostBodySchema = z.object({
  text: z.string().trim().min(1).max(MAX_TEXT_CHARS),
  voiceId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{6,40}$/)
    .optional(),
});

export async function POST(request: NextRequest) {
  const cfg = getServerConfig();
  if (!cfg.flags.elevenlabs || !cfg.elevenlabs.apiKey) {
    return NextResponse.json(
      {
        available: false,
        error:
          "ElevenLabs is not configured for this deployment. The browser voice can still speak.",
      },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: `Text must be 1–${MAX_TEXT_CHARS} characters.`,
        issues: parsed.error.issues.slice(0, 3),
      },
      { status: 400 }
    );
  }

  const voiceId = parsed.data.voiceId ?? cfg.elevenlabs.voiceId;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": cfg.elevenlabs.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: parsed.data.text,
        model_id: cfg.elevenlabs.model,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(SYNTH_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    captureServerError("voice.synthesize", error, { timeout: timedOut });
    console.warn(
      `[voice] ElevenLabs request failed (${timedOut ? "timeout" : "transport"}, ${parsed.data.text.length} chars)`
    );
    return NextResponse.json(
      {
        available: false,
        error: timedOut
          ? "ElevenLabs did not answer in time. The browser voice can still speak."
          : "ElevenLabs could not be reached. The browser voice can still speak.",
      },
      { status: 502 }
    );
  }

  if (!upstream.ok || !upstream.body) {
    console.warn(
      `[voice] ElevenLabs answered HTTP ${upstream.status} (${parsed.data.text.length} chars)`
    );
    return NextResponse.json(
      {
        available: false,
        error: `ElevenLabs answered HTTP ${upstream.status}. The browser voice can still speak.`,
      },
      { status: 502 }
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
