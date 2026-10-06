/**
 * Media capture helpers (spec §20–§23).
 *
 * Photos are downscaled on-device before storage (bandwidth + privacy +
 * IndexedDB quota). Audio is recorded with MediaRecorder and kept as an
 * opaque blob — no transcription happens here, and nothing leaves the device
 * until an explicit sync decision (spec §5).
 */
const MAX_PHOTO_EDGE = 1800;
const JPEG_QUALITY = 0.85;

export interface ProcessedPhoto {
  blob: Blob;
  mimeType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  sha256: string | null;
}

export interface RecordedAudio {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  sizeBytes: number;
  sha256: string | null;
}

export async function sha256Hex(blob: Blob): Promise<string | null> {
  try {
    if (typeof crypto === "undefined" || !crypto.subtle) return null;
    const buffer = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/**
 * Base64 data URL for the on-device vision model. Bounded: oversized blobs
 * return null instead of shipping a giant payload to the local runtime.
 * Chunked conversion keeps the call stack safe on large photos.
 */
export async function blobToDataUrl(blob: Blob, maxBytes = 2_500_000): Promise<string | null> {
  if (blob.size === 0 || blob.size > maxBytes) return null;
  try {
    const buffer = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < buffer.length; i += CHUNK) {
      binary += String.fromCharCode(...buffer.subarray(i, i + CHUNK));
    }
    const mime = blob.type || "image/jpeg";
    return `data:${mime};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

/**
 * Downscale + recompress a captured photo. Falls back to the original file
 * when the browser cannot decode it (e.g. some HEIC paths) — never silently
 * drops the capture, never claims dimensions it doesn't know.
 */
export async function processPhotoFile(file: File): Promise<ProcessedPhoto> {
  const sha256 = await sha256Hex(file);
  try {
    const bitmap = await createImageBitmap(file);
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longEdge > MAX_PHOTO_EDGE ? MAX_PHOTO_EDGE / longEdge : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) throw new Error("photo encode failed");
    return {
      blob,
      mimeType: "image/jpeg",
      width,
      height,
      sizeBytes: blob.size,
      sha256,
    };
  } catch {
    return {
      blob: file,
      mimeType: file.type || "application/octet-stream",
      width: null,
      height: null,
      sizeBytes: file.size,
      sha256,
    };
  }
}

function pickAudioMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

export function isAudioCaptureSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export interface AudioLevelMeter {
  /** Current RMS level, 0..1 — drives the live waveform. */
  read(): number;
  dispose(): void;
}

/**
 * Small MediaRecorder wrapper with a live RMS meter. `stop()` resolves with
 * the finished blob; calling it twice is safe.
 */
export class AudioRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private meter: AudioLevelMeter | null = null;
  private stopping: Promise<RecordedAudio> | null = null;
  readonly mimeType: string;

  constructor() {
    this.mimeType = pickAudioMime();
  }

  async start(): Promise<void> {
    if (!isAudioCaptureSupported()) {
      throw new Error("Audio recording is not supported in this browser.");
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.chunks = [];
    this.recorder = this.mimeType
      ? new MediaRecorder(this.stream, { mimeType: this.mimeType })
      : new MediaRecorder(this.stream);
    this.recorder.addEventListener("dataavailable", (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    });
    this.recorder.start(500);
    this.startedAt = Date.now();
    this.meter = this.createMeter(this.stream);
  }

  level(): number {
    return this.meter?.read() ?? 0;
  }

  stop(): Promise<RecordedAudio> {
    if (this.stopping) return this.stopping;
    this.stopping = new Promise<RecordedAudio>((resolve, reject) => {
      const recorder = this.recorder;
      if (!recorder) {
        reject(new Error("Recorder was not started."));
        return;
      }
      recorder.addEventListener(
        "stop",
        () => {
          const durationMs = Date.now() - this.startedAt;
          const mimeType = recorder.mimeType || this.mimeType || "audio/webm";
          const blob = new Blob(this.chunks, { type: mimeType });
          this.teardown();
          void sha256Hex(blob).then((sha256) =>
            resolve({ blob, mimeType, durationMs, sizeBytes: blob.size, sha256 })
          );
        },
        { once: true }
      );
      recorder.addEventListener("error", () => {
        this.teardown();
        reject(new Error("Recording failed."));
      });
      recorder.stop();
    });
    return this.stopping;
  }

  cancel(): void {
    try {
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    } catch {
      // already stopped
    }
    this.teardown();
  }

  private teardown(): void {
    this.meter?.dispose();
    this.meter = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }

  private createMeter(stream: MediaStream): AudioLevelMeter {
    type AudioCtxCtor = new () => AudioContext;
    const Ctor: AudioCtxCtor | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioCtxCtor }).webkitAudioContext;
    if (!Ctor) {
      return { read: () => 0, dispose: () => undefined };
    }
    const ctx = new Ctor();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    return {
      read: () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i]! - 128) / 128;
          sum += v * v;
        }
        return Math.min(1, Math.sqrt(sum / data.length) * 3);
      },
      dispose: () => {
        void ctx.close().catch(() => undefined);
      },
    };
  }
}

/** Haversine distance in meters — used by the GPS distance accumulator. */
export function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
