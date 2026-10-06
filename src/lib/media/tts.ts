"use client";

/**
 * Voice output (spec §17, §32) — client-side, honest by construction.
 *
 * Provider order is explicit, never silent:
 *  - "elevenlabs" tries the server proxy first; when the proxy is not
 *    configured or cannot answer, it falls back to the browser's built-in
 *    speech AND SAYS SO in the result (fellBackToBrowser), so the UI can be
 *    truthful about which voice actually spoke.
 *  - "browser" never calls the server at all.
 *
 * Nothing is sent anywhere except the short guidance text the user asked to
 * hear — never notes, story text, or photos.
 */
import type { VoicePreferences } from "@/lib/domain/types";

export interface VoiceSpeakResult {
  spoken: boolean;
  provider: "browser" | "elevenlabs";
  fellBackToBrowser: boolean;
  reason: string | null;
}

type CloudAttempt = { state: "ok" } | { state: "cancelled" } | { state: "failed"; reason: string };
type BrowserAttempt = { ok: boolean; cancelled: boolean; reason: string | null };

const SYNTH_TIMEOUT_MS = 45_000;

let currentAudio: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;
let cancelPlayback: (() => void) | null = null;
let cancelBrowserSpeech: (() => void) | null = null;

export function browserVoiceAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Cancel whatever is currently speaking (browser or ElevenLabs audio). */
export function stopSpeaking(): void {
  // Resolve pending waits first: a cancelled utterance or a paused Audio
  // element may never fire "ended"/"error" on its own.
  const browserCancel = cancelBrowserSpeech;
  cancelBrowserSpeech = null;
  browserCancel?.();
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  const playbackCancel = cancelPlayback;
  cancelPlayback = null;
  playbackCancel?.();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

function speakWithBrowser(text: string, speed: number): Promise<BrowserAttempt> {
  return new Promise((resolve) => {
    if (!browserVoiceAvailable()) {
      resolve({ ok: false, cancelled: false, reason: "This browser has no speech synthesis." });
      return;
    }
    let settled = false;
    let timer: number | null = null;
    const finish = (ok: boolean, cancelled: boolean, reason: string | null) => {
      if (settled) return;
      settled = true;
      cancelBrowserSpeech = null;
      if (timer !== null) window.clearTimeout(timer);
      resolve({ ok, cancelled, reason });
    };
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = Math.min(2, Math.max(0.5, speed));
      utterance.onend = () => finish(true, false, null);
      utterance.onerror = () => finish(false, false, "The browser voice failed.");
      cancelBrowserSpeech = () => finish(false, true, null);
      // Safety valve: some engines (notably headless Chrome) never fire
      // speech events. A stuck "Stop" button would be worse than an early
      // reset, so stop waiting after a generous content-length estimate.
      timer = window.setTimeout(
        () => finish(false, false, null),
        Math.min(120_000, 6_000 + text.length * 110)
      );
      window.speechSynthesis.speak(utterance);
    } catch {
      finish(false, false, "The browser voice failed.");
    }
  });
}

async function speakWithElevenLabs(text: string): Promise<CloudAttempt> {
  let res: Response;
  try {
    res = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(SYNTH_TIMEOUT_MS),
    });
  } catch {
    return { state: "failed", reason: "The voice service could not be reached." };
  }
  if (!res.ok) {
    let reason = `The voice service answered HTTP ${res.status}.`;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === "string") reason = body.error;
    } catch {
      /* keep the generic reason */
    }
    return { state: "failed", reason };
  }
  try {
    const blob = await res.blob();
    if (blob.size === 0) {
      return { state: "failed", reason: "The voice service returned an empty clip." };
    }
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    currentObjectUrl = url;
    const outcome = await new Promise<"ended" | "cancelled" | "error">((resolve) => {
      let settled = false;
      const finish = (o: "ended" | "cancelled" | "error") => {
        if (settled) return;
        settled = true;
        resolve(o);
      };
      cancelPlayback = () => finish("cancelled");
      audio.onended = () => finish("ended");
      audio.onerror = () => finish("error");
      void audio.play().catch(() => finish("error"));
    });
    cancelPlayback = null;
    stopSpeaking();
    if (outcome === "ended") return { state: "ok" };
    if (outcome === "cancelled") return { state: "cancelled" };
    return { state: "failed", reason: "The audio could not be played." };
  } catch {
    cancelPlayback = null;
    stopSpeaking();
    return { state: "failed", reason: "The audio could not be played." };
  }
}

/**
 * Speak `text` according to the user's voice preferences. Resolves when
 * speaking finishes (or earlier with `spoken: false` and a reason — including
 * when the user stopped it, in which case the reason is null).
 */
export async function speakText(text: string, prefs: VoicePreferences): Promise<VoiceSpeakResult> {
  stopSpeaking();
  const trimmed = text.trim().slice(0, 1000);
  if (trimmed.length === 0) {
    return {
      spoken: false,
      provider: "browser",
      fellBackToBrowser: false,
      reason: "Nothing to read.",
    };
  }

  if (prefs.provider === "elevenlabs") {
    const cloud = await speakWithElevenLabs(trimmed);
    if (cloud.state === "ok") {
      return { spoken: true, provider: "elevenlabs", fellBackToBrowser: false, reason: null };
    }
    if (cloud.state === "cancelled") {
      return { spoken: false, provider: "elevenlabs", fellBackToBrowser: false, reason: null };
    }
    const fallback = await speakWithBrowser(trimmed, prefs.speed);
    return {
      spoken: fallback.ok,
      provider: "browser",
      fellBackToBrowser: true,
      reason: fallback.reason ?? (fallback.cancelled ? null : cloud.reason),
    };
  }

  const browser = await speakWithBrowser(trimmed, prefs.speed);
  return {
    spoken: browser.ok,
    provider: "browser",
    fellBackToBrowser: false,
    reason: browser.reason,
  };
}
