"use client";

/**
 * Expedition detail — the whole loop in one place: live honest stats, the
 * mission board, capture, curiosity follow-ups, pocket mode, wrap-up, and the
 * completed score view. Nothing on this page is decorative make-believe.
 */
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Camera,
  Footprints,
  MapPin,
  NotebookPen,
  SearchX,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/app-shell";
import { ShareCardButton } from "@/components/share-card-button";
import { CaptureSheet } from "@/features/expedition/capture-sheet";
import { CuriositySheet } from "@/features/expedition/curiosity-sheet";
import { FieldAgentRecap } from "@/features/expedition/field-agent-recap";
import { LiveStats } from "@/features/expedition/live-stats";
import { MissionCard } from "@/features/expedition/mission-card";
import { ObservationCard } from "@/features/expedition/observation-card";
import { ScoreSummary } from "@/features/expedition/score-summary";
import { WrapUpSheet } from "@/features/expedition/wrap-up-sheet";
import { ENVIRONMENT_META, MODE_META } from "@/lib/domain/labels";
import { useOnboardingGuard } from "@/lib/hooks/use-onboarding-guard";
import { useExpeditionStore } from "@/lib/state/expedition-store";
import { relativeTime } from "@/lib/utils";
import type { CuriosityAction } from "@/lib/domain/types";

export default function ExpeditionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const ready = useOnboardingGuard();

  const viewing = useExpeditionStore((s) => s.viewing);
  const missions = useExpeditionStore((s) => s.missions);
  const observations = useExpeditionStore((s) => s.observations);
  const endResult = useExpeditionStore((s) => s.endResult);
  const busy = useExpeditionStore((s) => s.busy);
  const ensureLoaded = useExpeditionStore((s) => s.ensureLoaded);
  const unloadViewing = useExpeditionStore((s) => s.unloadViewing);
  const activateMission = useExpeditionStore((s) => s.activateMission);
  const completeMission = useExpeditionStore((s) => s.completeMission);
  const skipMission = useExpeditionStore((s) => s.skipMission);
  const retryMission = useExpeditionStore((s) => s.retryMission);

  const [loadState, setLoadState] = React.useState<"loading" | "ready" | "missing">("loading");
  const [captureOpen, setCaptureOpen] = React.useState(false);
  const [captureMissionId, setCaptureMissionId] = React.useState<string | null>(null);
  const [curiosity, setCuriosity] = React.useState<CuriosityAction | null>(null);
  const [curiosityOpen, setCuriosityOpen] = React.useState(false);
  const [wrapOpen, setWrapOpen] = React.useState(false);

  React.useEffect(() => {
    if (!ready || !id) return;
    let cancelled = false;
    setLoadState("loading");
    void (async () => {
      const found = await ensureLoaded(id);
      if (!cancelled) setLoadState(found ? "ready" : "missing");
    })();
    return () => {
      cancelled = true;
      unloadViewing();
    };
  }, [ready, id, ensureLoaded, unloadViewing]);

  if (!ready || loadState === "loading") {
    return (
      <div>
        <Skeleton className="mb-4 h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (loadState === "missing" || !viewing) {
    return (
      <div className="animate-fade-up">
        <PageHeader title="Expedition not found" />
        <Card>
          <CardContent className="flex flex-col items-center gap-4 px-4 py-10 text-center">
            <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-pretty text-sm text-muted-foreground">
              We can&apos;t find that expedition on this device. It may have been created in another
              browser or removed.
            </p>
            <Button asChild variant="outline">
              <Link href="/home">Back to Today</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const expedition = viewing;
  const modeMeta = MODE_META[expedition.mode];
  const sortedMissions = [...missions].sort((a, b) => a.orderIndex - b.orderIndex);

  // Actual wall-clock time outside when the expedition really ran, otherwise
  // the planned duration — the share card labels which one it is.
  const outsideMinutes =
    expedition.startedAt && expedition.endedAt
      ? Math.max(
          1,
          Math.round((Date.parse(expedition.endedAt) - Date.parse(expedition.startedAt)) / 60000)
        )
      : null;

  function openCapture(missionId: string | null) {
    setCaptureMissionId(missionId);
    setCaptureOpen(true);
  }

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        title={`${modeMeta.emoji} ${expedition.title}`}
        description={
          expedition.status === "ACTIVE"
            ? expedition.startedAt
              ? `Started ${relativeTime(expedition.startedAt)} · ${expedition.durationMinutes} min planned`
              : `${expedition.durationMinutes} min planned`
            : expedition.endedAt
              ? `Finished ${relativeTime(expedition.endedAt)}`
              : undefined
        }
        action={
          expedition.status === "ACTIVE" ? (
            <Badge variant="success" className="gap-1">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-current" />
              Live
            </Badge>
          ) : expedition.status === "COMPLETED" ? (
            <Badge variant="outline">Completed</Badge>
          ) : (
            <Badge variant="muted">Abandoned</Badge>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          {expedition.environment === "unknown"
            ? "Somewhere outside"
            : ENVIRONMENT_META[expedition.environment].label}
        </span>
        <span aria-hidden>·</span>
        <span>{modeMeta.label}</span>
      </div>

      {expedition.status === "ACTIVE" ? (
        <>
          <LiveStats
            expedition={expedition}
            missions={missions}
            observationCount={observations.length}
          />

          {/* Touch Grass — the core instruction of the whole app. */}
          <Card className="card-strata border-forest/40">
            <CardContent className="flex flex-col items-center gap-3 p-5 text-center sm:flex-row sm:text-left">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-forest/10">
                <Footprints className="h-6 w-6 text-forest" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-medium">Put your phone away</p>
                <p className="mt-0.5 text-pretty text-sm text-muted-foreground">
                  Pocket mode dims everything and shows one idea at a time — check in when you get
                  back.
                </p>
              </div>
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href={`/pocket/${expedition.id}`}>
                  Pocket mode <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => openCapture(null)}>
              <Camera className="mr-1.5 h-4 w-4" aria-hidden />
              Capture anything
            </Button>
            <Button variant="outline" onClick={() => setWrapOpen(true)} disabled={busy}>
              <NotebookPen className="mr-1.5 h-4 w-4" aria-hidden />
              Wrap up
            </Button>
          </div>

          <section aria-labelledby="board-heading">
            <h2 id="board-heading" className="mb-2 text-sm font-semibold">
              Mission board
            </h2>
            <div className="space-y-2.5">
              {sortedMissions.map((mission) => (
                <MissionCard
                  key={mission.id}
                  mission={mission}
                  busy={busy}
                  onActivate={(mid) => void activateMission(mid)}
                  onCapture={(mid) => openCapture(mid)}
                  onComplete={(mid) => void completeMission(mid)}
                  onSkip={(mid) => void skipMission(mid)}
                  onRetry={(mid) => void retryMission(mid)}
                />
              ))}
              {sortedMissions.length === 0 ? (
                <Card>
                  <CardContent className="p-4 text-sm text-muted-foreground">
                    No missions on this board — capture something and one will appear.
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </section>
        </>
      ) : null}

      {expedition.status === "COMPLETED" && endResult ? (
        <ScoreSummary expedition={expedition} score={endResult.score} dayScore={endResult.dayScore}>
          <ShareCardButton
            score={endResult.score.score}
            missions={missions.filter((m) => m.status === "COMPLETED").length}
            observations={observations.length}
            minutes={outsideMinutes ?? expedition.durationMinutes}
            minutesLabel={outsideMinutes === null ? "planned" : "outside"}
            dateKey={endResult.score.dateKey}
          />
          <div className="flex flex-wrap gap-2">
            <Button asChild className="flex-1">
              <Link href="/journal">
                <BookOpen className="mr-1.5 h-4 w-4" aria-hidden />
                Back to journal
              </Link>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link href="/expeditions/new">Start another</Link>
            </Button>
          </div>
        </ScoreSummary>
      ) : null}

      {expedition.status === "COMPLETED" && !endResult ? (
        <Card>
          <CardContent className="text-pretty p-4 text-sm text-muted-foreground">
            This expedition is complete, but its score isn&apos;t stored on this device.
          </CardContent>
        </Card>
      ) : null}

      {expedition.status === "COMPLETED" ? (
        <FieldAgentRecap
          expedition={endResult?.expedition ?? expedition}
          missions={missions}
          observations={observations}
          score={endResult?.score ?? null}
        />
      ) : null}

      {expedition.status === "ABANDONED" ? (
        <Card>
          <CardContent className="text-pretty p-4 text-sm text-muted-foreground">
            This expedition was left unfinished, so it earned no score. The time you spent outside
            still counted as yours.
          </CardContent>
        </Card>
      ) : null}

      {expedition.story ? (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Your story
            </p>
            <p className="mt-2 text-pretty text-sm">{expedition.story}</p>
          </CardContent>
        </Card>
      ) : null}

      <section aria-labelledby="findings-heading">
        <h2 id="findings-heading" className="mb-2 text-sm font-semibold">
          What you found{" "}
          <span className="font-normal text-muted-foreground">({observations.length})</span>
        </h2>
        {observations.length === 0 ? (
          <Card>
            <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
              <X className="h-4 w-4 shrink-0" aria-hidden />
              Nothing captured yet — the first observation is usually the best one.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {[...observations]
              .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
              .map((observation) => (
                <ObservationCard key={observation.id} observation={observation} />
              ))}
          </div>
        )}
      </section>

      <CaptureSheet
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        missionId={captureMissionId}
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

      {expedition.status === "ACTIVE" ? (
        <WrapUpSheet
          open={wrapOpen}
          onOpenChange={setWrapOpen}
          expedition={expedition}
          missions={missions}
          observationCount={observations.length}
          onEnded={() => {
            router.replace(`/expeditions/${expedition.id}`);
          }}
        />
      ) : null}
    </div>
  );
}
