"use client";

/**
 * Capture sheet — photo, sound or note. Media never leaves the device by
 * default; location attribution follows the user's LocationMode preference and
 * is simply absent when unavailable (never fabricated).
 */
import * as React from "react";
import { Camera, ImagePlus, Mic, Square, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn, formatBytes, formatClock } from "@/lib/utils";
import { CAPTURE_CATEGORIES, CATEGORY_META } from "@/lib/domain/labels";
import { useAppStore } from "@/lib/state/app-store";
import { useExpeditionStore, type CaptureObservationResult } from "@/lib/state/expedition-store";
import {
  AudioRecorder,
  isAudioCaptureSupported,
  processPhotoFile,
  type ProcessedPhoto,
  type RecordedAudio,
} from "@/lib/media/capture";
import { currentGeoCoords, toApproxLocation } from "@/lib/media/geo";
import type { ApproxLocation, ObservationCategory } from "@/lib/domain/types";

type CaptureTab = "photo" | "sound" | "note";

const LOCATION_HINT: Record<"NONE" | "APPROXIMATE" | "PRECISE", string> = {
  NONE: "Location: off",
  APPROXIMATE: "Location: approximate (~100 m)",
  PRECISE: "Location: precise",
};

export function CaptureSheet({
  open,
  onOpenChange,
  missionId,
  initialTab = "photo",
  onCaptured,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missionId?: string | null;
  initialTab?: CaptureTab;
  onCaptured?: (result: CaptureObservationResult) => void;
}) {
  const { toast } = useToast();
  const captureObservation = useExpeditionStore((s) => s.captureObservation);
  const locationMode = useAppStore((s) => s.preferences?.locationMode ?? "NONE");
  const audioSupported = React.useMemo(() => isAudioCaptureSupported(), []);

  const [tab, setTab] = React.useState<CaptureTab>("photo");
  const [category, setCategory] = React.useState<ObservationCategory>("unknown");
  const [note, setNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const [processed, setProcessed] = React.useState<ProcessedPhoto | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = React.useState(false);

  const [recording, setRecording] = React.useState(false);
  const [level, setLevel] = React.useState(0);
  const [recSeconds, setRecSeconds] = React.useState(0);
  const [audio, setAudio] = React.useState<RecordedAudio | null>(null);
  const recorderRef = React.useRef<AudioRecorder | null>(null);
  const rafRef = React.useRef<number | null>(null);

  const stopMeter = React.useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const resetAll = React.useCallback(() => {
    stopMeter();
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setRecording(false);
    setLevel(0);
    setRecSeconds(0);
    setAudio(null);
    setProcessed(null);
    setPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    setNote("");
    setSubmitting(false);
    setPhotoBusy(false);
  }, [stopMeter]);

  React.useEffect(() => {
    if (!open) resetAll();
  }, [open, resetAll]);

  React.useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  React.useEffect(() => () => stopMeter(), [stopMeter]);

  // Category defaults track the active tab until the user picks one.
  React.useEffect(() => {
    setCategory(tab === "sound" ? "sound" : "unknown");
  }, [tab]);

  async function onPickPhoto(file: File | null) {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const result = await processPhotoFile(file);
      setProcessed(result);
      setPreviewUrl((url) => {
        if (url) URL.revokeObjectURL(url);
        return URL.createObjectURL(result.blob);
      });
    } catch {
      toast({ title: "Couldn't read that photo", variant: "error" });
    } finally {
      setPhotoBusy(false);
    }
  }

  async function startRecording() {
    try {
      const recorder = new AudioRecorder();
      await recorder.start();
      recorderRef.current = recorder;
      setAudio(null);
      setRecording(true);
      setRecSeconds(0);
      const startedAt = Date.now();
      const loop = () => {
        const active = recorderRef.current;
        if (!active) return;
        setLevel(active.level());
        setRecSeconds(Math.floor((Date.now() - startedAt) / 1000));
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch {
      toast({
        title: "Microphone unavailable",
        description: "Check browser permissions and try again.",
        variant: "error",
      });
    }
  }

  async function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    stopMeter();
    setRecording(false);
    setLevel(0);
    try {
      const recorded = await recorder.stop();
      recorderRef.current = null;
      setAudio(recorded);
    } catch {
      recorderRef.current = null;
      toast({ title: "Recording failed", variant: "error" });
    }
  }

  const canSubmit =
    tab === "photo"
      ? processed !== null
      : tab === "sound"
        ? audio !== null
        : note.trim().length >= 3;

  async function submit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      let location: ApproxLocation | null = null;
      if (locationMode !== "NONE") {
        const coords = await currentGeoCoords();
        if (coords) location = toApproxLocation(coords, locationMode);
      }
      const result = await captureObservation({
        type: tab === "photo" ? "photo" : tab === "sound" ? "audio" : "note",
        category,
        note,
        missionId: missionId ?? null,
        photo: tab === "photo" ? processed : null,
        audio: tab === "sound" ? audio : null,
        location,
      });
      if (!result) {
        toast({
          title: "Couldn't save that",
          description: "The expedition may have ended — try again from the board.",
          variant: "warning",
        });
        return;
      }
      toast({
        title: "Observation saved",
        description:
          result.addedMissions.length > 0
            ? "The board adapted — a follow-up appeared."
            : "It stays on this device until you choose to share it.",
        variant: "success",
      });
      onCaptured?.(result);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Capture what you found"
      description="Evidence is stored on-device. Analysis comes next — nothing is invented."
      dismissible={!recording && !submitting}
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as CaptureTab)}>
        <TabsList aria-label="Capture type" className="w-full">
          <TabsTrigger value="photo" className="flex-1">
            <Camera className="h-4 w-4" aria-hidden /> Photo
          </TabsTrigger>
          <TabsTrigger value="sound" className="flex-1" disabled={!audioSupported}>
            <Mic className="h-4 w-4" aria-hidden /> Sound
          </TabsTrigger>
          <TabsTrigger value="note" className="flex-1">
            <StickyNote className="h-4 w-4" aria-hidden /> Note
          </TabsTrigger>
        </TabsList>

        <TabsContent value="photo" className="space-y-3">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview
            <img
              src={previewUrl}
              alt="Captured photo preview"
              className="max-h-56 w-full rounded-xl border object-cover"
            />
          ) : (
            <label
              className={cn(
                "flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors hover:border-forest/50 hover:bg-forest/5",
                photoBusy && "pointer-events-none opacity-60"
              )}
            >
              <ImagePlus className="h-7 w-7 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium">
                {photoBusy ? "Preparing photo…" : "Take or choose a photo"}
              </span>
              <span className="text-xs text-muted-foreground">
                Downscaled on-device to keep storage light
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => void onPickPhoto(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
          {processed ? (
            <p className="text-xs text-muted-foreground">
              {processed.width && processed.height
                ? `${processed.width}×${processed.height} · `
                : ""}
              {formatBytes(processed.sizeBytes)}
              {previewUrl ? (
                <label className="ml-2 cursor-pointer font-medium text-forest underline-offset-2 hover:underline">
                  Retake
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(e) => void onPickPhoto(e.target.files?.[0] ?? null)}
                  />
                </label>
              ) : null}
            </p>
          ) : null}
        </TabsContent>

        <TabsContent value="sound" className="space-y-3">
          {!audioSupported ? (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              This browser can&apos;t record audio. The note and photo tabs still work.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border bg-muted/30 p-5">
              <div className="flex h-10 items-end gap-1" aria-hidden>
                {Array.from({ length: 20 }).map((_, i) => {
                  const scale = 0.25 + 0.75 * Math.abs(Math.sin(i * 1.7));
                  const h = recording ? Math.max(8, Math.round(level * 100 * scale)) : 8;
                  return (
                    <span
                      key={i}
                      className={cn(
                        "w-1.5 rounded-full transition-[height] duration-100",
                        recording ? "bg-forest" : "bg-muted-foreground/30"
                      )}
                      style={{ height: `${Math.max(8, Math.min(40, h))}px` }}
                    />
                  );
                })}
              </div>
              <p className="font-display text-2xl font-semibold tabular-nums">
                {formatClock(recSeconds)}
              </p>
              {recording ? (
                <Button variant="destructive" onClick={() => void stopRecording()}>
                  <Square className="mr-1.5 h-4 w-4" aria-hidden />
                  Stop recording
                </Button>
              ) : (
                <Button onClick={() => void startRecording()} disabled={audio !== null}>
                  <Mic className="mr-1.5 h-4 w-4" aria-hidden />
                  {audio ? "Recorded" : "Start recording"}
                </Button>
              )}
              {audio ? (
                <p className="text-xs text-muted-foreground">
                  {formatClock(Math.round(audio.durationMs / 1000))} captured ·{" "}
                  {formatBytes(audio.sizeBytes)}
                </p>
              ) : (
                <p className="text-pretty text-xs text-muted-foreground">
                  Sound stays on this device. No transcription happens without your say-so.
                </p>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="note" className="space-y-3">
          <p className="text-pretty text-sm text-muted-foreground">
            Look at something properly, then write it down while it&apos;s fresh.
          </p>
        </TabsContent>
      </Tabs>

      <div className="mt-4 space-y-2">
        <Label htmlFor="capture-note">Your note (optional)</Label>
        <Textarea
          id="capture-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            tab === "photo"
              ? "What caught your eye? Colour, shape, movement…"
              : tab === "sound"
                ? "What does it sound like? Where is it coming from?"
                : "Describe what you noticed."
          }
          maxLength={4000}
          rows={3}
        />
      </div>

      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-medium">Tag it</legend>
        <div className="flex flex-wrap gap-1.5">
          {CAPTURE_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn(
                "inline-flex min-h-8 items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                category === c
                  ? "border-forest bg-forest/10 text-forest"
                  : "border-input text-muted-foreground hover:border-forest/40 hover:text-foreground"
              )}
            >
              <span aria-hidden>{CATEGORY_META[c].emoji}</span>
              {CATEGORY_META[c].label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
        <Button onClick={() => void submit()} disabled={!canSubmit || submitting || recording}>
          {submitting ? "Saving…" : tab === "note" ? "Save note" : "Save observation"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => onOpenChange(false)}
          disabled={recording || submitting}
        >
          Cancel
        </Button>
      </div>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        {LOCATION_HINT[locationMode]} · stored locally, shared only with your consent
      </p>
    </Dialog>
  );
}
