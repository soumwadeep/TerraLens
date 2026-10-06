"use client";

/**
 * Pocket mode — the "put your phone away" screen (spec §17).
 *
 * Lives outside the app shell on purpose: full-screen, no tab bar, no feed.
 * The tracker runs at the app root, so the number here is the honest
 * wall-clock time of the expedition, interpolated between 5 s ticks.
 */
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Footprints, Leaf, NotebookPen, Sparkles, Volume2, VolumeX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CaptureSheet } from "@/features/expedition/capture-sheet";
import { CuriositySheet } from "@/features/expedition/curiosity-sheet";
import { MISSION_TYPE_META } from "@/lib/domain/labels";
import type { CuriosityAction } from "@/lib/domain/types";
import { useOnboardingGuard } from "@/lib/hooks/use-onboarding-guard";
import { speakText, stopSpeaking } from "@/lib/media/tts";
import { missionProgress, nextFocusMission } from "@/lib/missions/engine";
import { useAppStore } from "@/lib/state/app-store";
import { useExpeditionStore } from "@/lib/state/expedition-store";
import { formatClock, formatDistance } from "@/lib/utils";

export default function PocketModePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const ready = useOnboardingGuard();

  const viewing = useExpeditionStore((s) => s.viewing);
  const active = useExpeditionStore((s) => s.active);
  const missions = useExpeditionStore((s) => s.missions);
  const busy = useExpeditionStore((s) => s.busy);
  const ensureLoaded = useExpeditionStore((s) => s.ensureLoaded);

  const expedition = viewing?.id === id ? viewing : active?.id === id ? active : null;

  const [loadState, setLoadState] = React.useState<"loading" | "ready" | "missing">("loading");
  const [captureOpen, setCaptureOpen] = React.useState(false);
  const [curiosity, setCuriosity] = React.useState<CuriosityAction | null>(null);
  const [curiosityOpen, setCuriosityOpen] = React.useState(false);

  // Voice guidance (spec §17, §32). Reads only the on-screen focus mission.
  const preferences = useAppStore((s) => s.preferences);
  const voicePrefs = preferences?.voice;
  const [speaking, setSpeaking] = React.useState(false);
  const [voiceNote, setVoiceNote] = React.useState<string | null>(null);
  // Sequence guard: results of a superseded utterance never touch the UI.
  const speakSeqRef = React.useRef(0);

  React.useEffect(() => () => stopSpeaking(), []);

  React.useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      const loaded = await ensureLoaded(id);
      if (cancelled) return;
      setLoadState(loaded ? "ready" : "missing");
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, id, ensureLoaded]);

  const alreadyLoaded = viewing?.id === id || active?.id === id;
  const effectiveState = loadState === "loading" && alreadyLoaded ? "ready" : loadState;

  // --- Live clocks -----------------------------------------------------------
  // The tracker patches stats every 5 s; interpolate the outside clock locally
  // so the number moves every second without inventing anything: it is the
  // same wall clock, sampled in between ticks.
  const stats = expedition?.stats;
  const [outside, setOutside] = React.useState(stats?.elapsedSeconds ?? 0);
  const syncRef = React.useRef({
    at: Date.now(),
    elapsed: stats?.elapsedSeconds ?? 0,
  });

  React.useEffect(() => {
    if (!stats) return;
    syncRef.current = { at: Date.now(), elapsed: stats.elapsedSeconds };
    setOutside(stats.elapsedSeconds);
  }, [stats]);

  React.useEffect(() => {
    if (expedition?.status !== "ACTIVE") return;
    const handle = window.setInterval(() => {
      const { at, elapsed } = syncRef.current;
      setOutside(elapsed + Math.floor((Date.now() - at) / 1000));
    }, 1000);
    return () => window.clearInterval(handle);
  }, [expedition?.status, expedition?.id]);

  const progress = React.useMemo(() => missionProgress(missions), [missions]);
  const focus = React.useMemo(
    () => (expedition?.status === "ACTIVE" ? nextFocusMission(missions) : null),
    [missions, expedition?.status]
  );

  if (!ready || effectiveState === "loading") {
    return (
      <main className="pocket-screen" aria-busy="true">
        <Leaf className="h-8 w-8 animate-pulse text-forest" aria-hidden />
      </main>
    );
  }

  if (effectiveState === "missing" || !expedition) {
    return (
      <main className="pocket-screen">
        <div className="w-full max-w-sm space-y-4">
          <h1 className="font-display text-2xl font-semibold">This walk is out of reach</h1>
          <p className="text-pretty text-sm text-muted-foreground">
            We couldn&apos;t find that expedition on this device. It may have been started somewhere
            else.
          </p>
          <Button asChild variant="outline">
            <Link href="/home">
              <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
              Back to today
            </Link>
          </Button>
        </div>
      </main>
    );
  }

  const backHref = `/expeditions/${expedition.id}`;
  const cautionWarnings =
    focus?.safetyMetadata.level === "caution" ? focus.safetyMetadata.warnings : [];

  return (
    <main className="pocket-screen safe-top safe-bottom">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="gap-1.5 bg-background/60">
            <Footprints className="h-3 w-3" aria-hidden />
            Pocket mode
          </Badge>
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            I&apos;m back
          </Link>
        </div>

        {expedition.status === "ACTIVE" ? (
          <>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Outside for
              </p>
              <p
                className="font-display text-6xl font-semibold tabular-nums tracking-tight"
                aria-live="off"
              >
                {formatClock(outside)}
              </p>
              <div className="flex items-center justify-center gap-3 pt-1 text-sm text-muted-foreground">
                <span>Phone away {formatClock(stats?.pocketSeconds ?? 0)}</span>
                <span aria-hidden>·</span>
                <span>
                  {stats?.distanceMeters === null || stats?.distanceMeters === undefined
                    ? "GPS off"
                    : formatDistance(stats.distanceMeters)}
                </span>
              </div>
            </div>

            <section aria-label="One thing to try" className="space-y-3">
              {focus ? (
                <div className="rounded-2xl border border-forest/25 bg-background/70 p-5 text-left shadow-sm backdrop-blur">
                  <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-forest">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    One idea, then eyes up
                  </div>
                  <h1 className="mt-2 text-pretty font-display text-xl font-semibold leading-snug">
                    {focus.title}
                  </h1>
                  <p className="mt-1.5 text-pretty text-sm text-muted-foreground">
                    {focus.instruction}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {MISSION_TYPE_META[focus.type].label} · ~{focus.estimatedMinutes} min
                  </p>
                  {cautionWarnings.length > 0 ? (
                    <ul className="mt-3 space-y-1 text-pretty rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
                      {cautionWarnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  ) : null}
                  {voicePrefs?.enabled ? (
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2.5 text-muted-foreground"
                        aria-pressed={speaking}
                        onClick={() => {
                          if (speaking) {
                            speakSeqRef.current += 1;
                            stopSpeaking();
                            setSpeaking(false);
                            setVoiceNote(null);
                            return;
                          }
                          const seq = ++speakSeqRef.current;
                          setSpeaking(true);
                          setVoiceNote(null);
                          void speakText(`${focus.title}. ${focus.instruction}`, voicePrefs)
                            .then((result) => {
                              if (speakSeqRef.current !== seq) return;
                              setSpeaking(false);
                              if (!result.spoken && result.reason) setVoiceNote(result.reason);
                              else if (result.fellBackToBrowser)
                                setVoiceNote(
                                  "Read with the device voice — the cloud voice didn't answer."
                                );
                            })
                            .catch(() => {
                              if (speakSeqRef.current !== seq) return;
                              setSpeaking(false);
                              setVoiceNote("The voice couldn't speak.");
                            });
                        }}
                      >
                        {speaking ? (
                          <VolumeX className="mr-1.5 h-4 w-4" aria-hidden />
                        ) : (
                          <Volume2 className="mr-1.5 h-4 w-4" aria-hidden />
                        )}
                        {speaking ? "Stop" : "Read it aloud"}
                      </Button>
                      {voiceNote ? (
                        <span className="text-xs text-muted-foreground">{voiceNote}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-2xl border border-border/60 bg-background/70 p-5 backdrop-blur">
                  <p className="font-medium">The board is clear.</p>
                  <p className="mt-1 text-pretty text-sm text-muted-foreground">
                    Wander freely — or follow whatever catches your eye next.
                  </p>
                </div>
              )}

              {progress.total > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    {progress.completed} of {progress.total} missions done
                  </p>
                  <Progress
                    value={progress.completed}
                    max={Math.max(1, progress.total)}
                    label={`${progress.completed} of ${progress.total} missions done`}
                  />
                </div>
              ) : null}
            </section>

            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setCaptureOpen(true)}
                disabled={busy}
              >
                <NotebookPen className="mr-1.5 h-4 w-4" aria-hidden />
                Capture a thought
              </Button>
              <p className="text-pretty text-xs text-muted-foreground">
                Notes stay on this device. Missions are suggestions, never dares.
              </p>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <h1 className="font-display text-3xl font-semibold">
              {expedition.status === "COMPLETED" ? "Nicely walked." : "This walk was let go."}
            </h1>
            <p className="text-pretty text-sm text-muted-foreground">
              {expedition.status === "COMPLETED"
                ? "The tally is ready whenever you want to look."
                : "Nothing is lost — everything you logged is still in your journal."}
            </p>
            <Button asChild>
              <Link href={backHref}>
                {expedition.status === "COMPLETED" ? "See the tally" : "Open the journal entry"}
              </Link>
            </Button>
          </div>
        )}
      </div>

      <CaptureSheet
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        initialTab="note"
        onCaptured={(result) => {
          if (result.curiosityAction) {
            setCuriosity(result.curiosityAction);
            setCuriosityOpen(true);
          }
        }}
      />
      <CuriositySheet
        action={curiosity}
        open={curiosityOpen}
        onOpenChange={setCuriosityOpen}
        expeditionId={expedition.id}
      />
    </main>
  );
}
