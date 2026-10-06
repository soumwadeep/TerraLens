"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Brain,
  Footprints,
  Gauge,
  Leaf,
  LoaderCircle,
  Lock,
  ScrollText,
  ShieldCheck,
  Telescope,
  Unlock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { analyzeObservation, type AnalysisOutcome } from "@/lib/ai/analysis";
import { generateCuriosityAction } from "@/lib/curiosity/engine";
import type { CuriosityAction, Interest, Mission, MissionStatus } from "@/lib/domain/types";
import {
  generateMissions,
  missionProgress,
  transitionMission,
  unlockNextMission,
} from "@/lib/missions/engine";
import {
  computeGrassScore,
  GRASS_COMPONENT_META,
  GRASS_RANK_META,
  grassInputs,
} from "@/lib/scoring/grass-score";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// DEMO DATA — fixtures only. Fixed ids, preset inputs, zero persistence.
// Every engine below is the production module the real app imports.
// ---------------------------------------------------------------------------

const DEMO_EXPEDITION = {
  id: "d3a00000-0000-4000-8000-000000000001",
  title: "Demo · Dawn patrol at the pond",
  mode: "nature",
  environment: "park",
  durationMinutes: 30,
  interests: ["plants", "birds"] as Interest[],
} as const;

const DEMO_OBSERVATION = {
  id: "d3a00000-0000-4000-8000-000000000002",
  category: "plant",
  note: "A dewdrop sits on a leaf by the pond edge — the leaf looks like it is holding it on purpose.",
} as const;

const MISSION_STATUS_META: Record<
  MissionStatus,
  { label: string; variant: "default" | "success" | "muted" | "warning" }
> = {
  AVAILABLE: { label: "Next up", variant: "default" },
  ACTIVE: { label: "Active", variant: "default" },
  COMPLETED: { label: "Done", variant: "success" },
  LOCKED: { label: "Locked", variant: "muted" },
  SKIPPED: { label: "Skipped", variant: "warning" },
  EXPIRED: { label: "Expired", variant: "muted" },
};

function DemoTag() {
  return (
    <Badge variant="muted" className="font-mono text-[10px] uppercase tracking-wide">
      Demo data
    </Badge>
  );
}

function StepCard({
  n,
  title,
  caption,
  children,
}: {
  n: string;
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 font-mono text-sm font-semibold text-forest" aria-hidden>
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
          {caption ? <p className="mt-1 text-sm text-muted-foreground">{caption}</p> : null}
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b py-2 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

export function DemoRunner() {
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [curiosity, setCuriosity] = useState<CuriosityAction | null>(null);
  const [aiOutcome, setAiOutcome] = useState<AnalysisOutcome | null>(null);
  const [aiPending, setAiPending] = useState(false);

  const board = missions !== null;
  const completedCount = missions?.filter((m) => m.status === "COMPLETED").length ?? 0;
  const firstCompleted = completedCount > 0;
  const progress = missions ? missionProgress(missions) : null;

  function buildBoard() {
    setMissions(
      generateMissions({
        expedition: DEMO_EXPEDITION,
        interests: DEMO_EXPEDITION.interests,
      })
    );
  }

  function completeFirst() {
    if (!missions) return;
    const next = missions.map((m) =>
      m.status === "AVAILABLE" && m.orderIndex === 0
        ? transitionMission(m, "COMPLETED", { observationId: DEMO_OBSERVATION.id })
        : m
    );
    setMissions(unlockNextMission(next));
  }

  function runCuriosity() {
    if (!missions) return;
    setCuriosity(
      generateCuriosityAction({
        observation: DEMO_OBSERVATION,
        expedition: {
          mode: DEMO_EXPEDITION.mode,
          environment: DEMO_EXPEDITION.environment,
          title: DEMO_EXPEDITION.title,
        },
        recentCategories: [],
        completedMissionTypes: missions.filter((m) => m.status === "COMPLETED").map((m) => m.type),
        accessibility: {
          reducedMotion: false,
          highContrast: false,
          largeText: false,
          captions: true,
          largeTouchTargets: false,
        },
        minutesRemaining: 20,
      })
    );
  }

  async function runAnalysis() {
    if (!missions) return;
    setAiPending(true);
    const outcome = await analyzeObservation({
      observation: DEMO_OBSERVATION,
      expedition: {
        id: DEMO_EXPEDITION.id,
        mode: DEMO_EXPEDITION.mode,
        environment: DEMO_EXPEDITION.environment,
      },
      preferences: { aiRuntimePreference: "AUTO", privacyMode: "HYBRID" },
      imageDataUrl: null,
      boardTitles: missions.map((m) => m.title),
      boardCount: missions.length,
      nextOrderIndex: missions.length,
    });
    setAiOutcome(outcome);
    setAiPending(false);
  }

  const scoreInputs = grassInputs({
    outdoorSeconds: 30 * 60,
    pocketSeconds: 10 * 60,
    screenActiveSeconds: 90,
    distanceMeters: null,
    missionsCompleted: 1,
    missionsSkipped: 0,
    observationCount: 2,
    uniqueCategories: 2,
    uniqueTags: 3,
    newDiscoveries: 3,
    streakDays: 1,
    environment: "park",
  });
  const score = computeGrassScore(scoreInputs);

  const aiSummary = aiOutcome
    ? aiOutcome.unavailability
      ? "no runtime answered — you saw the typed unavailable state"
      : `answered for real by the ${aiOutcome.analysis.runtime} runtime`
    : "";

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="sunlight" className="font-mono text-[11px] uppercase tracking-wide">
          Demo mode
        </Badge>
        <Badge variant="outline">nothing is saved</Badge>
      </div>
      <h1 className="mt-4 text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Walk the loop once, on clearly marked demo data.
      </h1>
      <p className="mt-3 max-w-2xl text-pretty text-muted-foreground">
        The mission generator, curiosity engine, AI analysis pipeline and Grass Score below are the
        production modules the real app imports — run here on fixture inputs, in your browser. Where
        a live runtime has to answer, you will see its actual response, including an honest
        ”unavailable” state when nothing answers.
      </p>

      <div className="mt-6 rounded-2xl border border-dashed border-forest/40 bg-forest/5 p-4 text-sm">
        <p className="font-semibold">DEMO DATA — structurally isolated.</p>
        <p className="mt-1 text-muted-foreground">
          Fixture ids, a preset observation, preset timers; no IndexedDB writes, no sync-queue
          entries, no analytics events. The only real network call is the AI step, which asks this
          deployment&apos;s own runtimes.{" "}
          <Link href="/lab" className="underline underline-offset-4 hover:text-foreground">
            The honesty contract
          </Link>{" "}
          explains exactly what that means.
        </p>
      </div>

      <div className="mt-8 space-y-5">
        {/* 01 — Expedition fixture */}
        <StepCard
          n="01"
          title="The expedition (fixture)"
          caption="A real expedition is created by you in onboarding. This one exists only as a local constant in this page."
        >
          <div className="flex items-start gap-3 rounded-xl border bg-background p-4">
            <Footprints className="mt-0.5 h-5 w-5 shrink-0 text-forest" aria-hidden />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{DEMO_EXPEDITION.title}</span>
                <DemoTag />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="secondary">nature</Badge>
                <Badge variant="secondary">park</Badge>
                <Badge variant="secondary">30 minutes</Badge>
                <Badge variant="secondary">plants · birds</Badge>
              </div>
            </div>
          </div>
          {!board ? (
            <Button className="mt-4" onClick={buildBoard}>
              Generate the mission board
              <ArrowRight aria-hidden />
            </Button>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Board generated below — from this fixture id, so it is the same board every time.
            </p>
          )}
        </StepCard>

        {/* 02 — Mission board */}
        {board && missions ? (
          <StepCard
            n="02"
            title="The mission board (real generator)"
            caption="src/lib/missions/engine.ts — seeded from the expedition id, safety-scanned, and identical online or offline. First mission available, the rest locked so it is one clear ask at a time."
          >
            <ul className="space-y-2">
              {missions.map((m) => {
                const meta = MISSION_STATUS_META[m.status];
                return (
                  <li
                    key={m.id}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background px-4 py-3",
                      m.status === "COMPLETED" && "opacity-60"
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{m.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.type.toLowerCase().replaceAll("_", " ")} · ~{m.estimatedMinutes} min
                      </p>
                    </div>
                    <span className="flex items-center gap-1.5">
                      {m.status === "LOCKED" ? (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      ) : null}
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </span>
                  </li>
                );
              })}
            </ul>
            {progress ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {progress.completed} of {progress.total} complete
                {firstCompleted ? " — the next mission unlocked itself." : ""}
              </p>
            ) : null}
            {!firstCompleted ? (
              <Button className="mt-4" onClick={completeFirst}>
                <Unlock aria-hidden />
                Complete the first mission
              </Button>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                That transition ran through the real state machine (
                <span className="font-mono text-xs">transitionMission</span> +{" "}
                <span className="font-mono text-xs">unlockNextMission</span>), in memory only.
              </p>
            )}
          </StepCard>
        ) : null}

        {/* 03 — Curiosity Engine */}
        {board && firstCompleted ? (
          <StepCard
            n="03"
            title="Curiosity Engine (real rules path)"
            caption="The observation is a fixture; the action is generated live by src/lib/curiosity/engine.ts — the same offline-capable engine the app uses, with the same output schema as the AI path."
          >
            <div className="flex items-start gap-3 rounded-xl border bg-background p-4">
              <Leaf className="mt-0.5 h-5 w-5 shrink-0 text-forest" aria-hidden />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">plant</Badge>
                  <DemoTag />
                </div>
                <p className="mt-2 text-sm">{DEMO_OBSERVATION.note}</p>
              </div>
            </div>

            {!curiosity ? (
              <Button className="mt-4" onClick={runCuriosity}>
                Run the curiosity engine
                <ArrowRight aria-hidden />
              </Button>
            ) : (
              <div aria-live="polite" className="mt-4 rounded-xl border bg-background p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="sky">{curiosity.category}</Badge>
                  <Badge variant="outline">~{curiosity.estimatedMinutes} min</Badge>
                  <Badge variant={curiosity.requiresScreen ? "warning" : "success"}>
                    {curiosity.requiresScreen ? "Needs the screen" : "No screen needed"}
                  </Badge>
                  <Badge variant="muted">rules engine · offline-capable</Badge>
                </div>
                <p className="mt-3 text-sm italic text-muted-foreground">
                  &ldquo;{curiosity.shortInsight}&rdquo;
                </p>
                <p className="mt-2 font-medium">{curiosity.physicalAction}</p>
                {curiosity.nextMission ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Would become mission:{" "}
                    <span className="font-medium text-foreground">{curiosity.nextMission}</span>
                  </p>
                ) : null}
              </div>
            )}
          </StepCard>
        ) : null}

        {/* 04 — AI path */}
        {curiosity ? (
          <StepCard
            n="04"
            title="The AI path (real pipeline)"
            caption="analyzeObservation() picks adapters from your privacy mode and runtime preference. This demo runs AUTO + HYBRID: on-device first, then this deployment's server. Image bytes are never sent anywhere in this step — there are none."
          >
            {!aiOutcome ? (
              <Button className="mt-0" onClick={runAnalysis} disabled={aiPending}>
                {aiPending ? (
                  <>
                    <LoaderCircle className="animate-spin" aria-hidden />
                    Asking the runtimes…
                  </>
                ) : (
                  <>
                    <Brain aria-hidden />
                    Run the analysis pipeline
                  </>
                )}
              </Button>
            ) : (
              <div aria-live="polite" className="rounded-xl border bg-background p-4">
                {aiOutcome.unavailability ? (
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-forest" aria-hidden />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="muted">unavailable</Badge>
                        <DemoTag />
                      </div>
                      <p className="mt-2 text-sm font-medium">
                        No runtime answered — this is the typed state the app shows instead of
                        inventing an identification.
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {aiOutcome.analysis.unavailableReason}
                        {aiOutcome.unavailability.noRuntime
                          ? " Some devices simply have no local model and no server reachable; the expedition loop carries on without analysis."
                          : ""}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={aiOutcome.analysis.status === "ok" ? "success" : "warning"}>
                        {aiOutcome.analysis.status === "ok" ? "analysed" : "low confidence"}
                      </Badge>
                      <Badge variant="outline">{aiOutcome.analysis.runtime}</Badge>
                      <Badge variant="muted">{aiOutcome.analysis.engine}</Badge>
                      <DemoTag />
                    </div>
                    <dl className="mt-3">
                      <Row label="Identification claimed">
                        {aiOutcome.analysis.commonName ?? "none — the model declined to name it"}
                        {aiOutcome.analysis.scientificName ? (
                          <span className="text-muted-foreground">
                            {" "}
                            ({aiOutcome.analysis.scientificName})
                          </span>
                        ) : null}
                      </Row>
                      <Row label="Confidence">
                        {aiOutcome.analysis.confidenceLabel} ·{" "}
                        {Math.round(aiOutcome.analysis.confidence * 100)}%
                      </Row>
                      <Row label="Visual details">
                        {aiOutcome.analysis.visualFeatures.length > 0
                          ? aiOutcome.analysis.visualFeatures.join(", ")
                          : "none"}
                      </Row>
                      <Row label="Curiosity prompt">
                        {aiOutcome.analysis.curiosityPrompt ?? "none returned"}
                      </Row>
                      <Row label="Latency">{aiOutcome.analysis.latencyMs ?? "—"} ms</Row>
                      <Row label="Safety note">
                        {aiOutcome.analysis.safetyWarning ?? "nothing flagged"}
                      </Row>
                      <Row label="Would the board change?">
                        {aiOutcome.suggestedMission
                          ? `a candidate mission passed the safety review: “${aiOutcome.suggestedMission.title}”`
                          : aiOutcome.curiosityAction
                            ? "a curiosity action was proposed (goes through the rules you saw)"
                            : "no new mission proposed"}
                      </Row>
                    </dl>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Whatever that says is what the runtimes really returned just now — rerun it
                      any time; with the local server running on your device, the engine column
                      changes to on-device.
                    </p>
                  </div>
                )}
              </div>
            )}
          </StepCard>
        ) : null}

        {/* 05 — Grass Score */}
        {aiOutcome ? (
          <StepCard
            n="05"
            title="The Grass Score (real arithmetic)"
            caption="Deterministic arithmetic from src/lib/scoring/grass-score.ts — no model involved, unit-tested, and it never requires GPS. The inputs are the fixture numbers listed beside it."
          >
            <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
              <div className="rounded-2xl border bg-background p-5 text-center sm:w-44">
                <p className="font-display text-5xl font-semibold tabular-nums">{score.score}</p>
                <p className="mt-1 text-sm text-muted-foreground">out of 1000</p>
                <p className="mt-3 text-lg">
                  {GRASS_RANK_META[score.rank].plant}{" "}
                  <span className="font-semibold">{GRASS_RANK_META[score.rank].label}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {GRASS_RANK_META[score.rank].blurb}
                </p>
              </div>
              <div>
                <ul className="space-y-2.5">
                  {GRASS_COMPONENT_META.map((c) => {
                    const value = score.components[c.key];
                    const pct = Math.round((value / c.max) * 100);
                    return (
                      <li key={c.key}>
                        <div className="flex items-baseline justify-between gap-3 text-xs">
                          <span className="font-medium">{c.label}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {value} / {c.max}
                          </span>
                        </div>
                        <div
                          className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                          role="img"
                          aria-label={`${c.label}: ${value} of ${c.max} points`}
                        >
                          <div
                            className="h-full rounded-full bg-forest"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Fixture inputs</p>
                  <p className="mt-1">
                    30 min outdoors · 10 min phone-away · 1 mission · 2 observations (2 categories,
                    3 tags) · 3 new discoveries · 1-day streak · GPS off — distance contributes an
                    honest zero, and the score is complete without it.
                  </p>
                </div>
                {score.notes.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                    {score.notes.map((note) => (
                      <li key={note}>· {note}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </StepCard>
        ) : null}

        {/* 06 — Recap + CTAs */}
        {aiOutcome ? (
          <StepCard
            n="06"
            title="What just happened (and what did not)"
            caption="The short version, so you can hold the demo to it."
          >
            <ul className="space-y-1.5 text-sm">
              <li className="flex gap-2">
                <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
                Missions came from the same seeded generator the app ships — board identical on
                every device that opens this page.
              </li>
              <li className="flex gap-2">
                <Leaf className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
                The curiosity action came from the authored offline engine, schema-identical to the
                AI path.
              </li>
              <li className="flex gap-2">
                <Brain className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
                The AI step hit the real pipeline: {aiSummary}.
              </li>
              <li className="flex gap-2">
                <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
                The score is arithmetic: {score.score} in this fixture, every point traceable to a
                component.
              </li>
              <li className="flex gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
                Nothing was saved: your journal is untouched, the sync queue is empty, no share card
                was made.
              </li>
            </ul>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Button asChild>
                <Link href="/home">
                  Start a real expedition
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/judge">
                  <Telescope aria-hidden />
                  Inspect the machinery
                </Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              In the real app, demo-origin rows are a typed{" "}
              <span className="font-mono">origin: &quot;demo&quot;</span> the sync engine refuses to
              send — fixture data cannot leak into your record or the cloud. Prefer reading to
              clicking?{" "}
              <Link href="/lab" className="underline underline-offset-4 hover:text-foreground">
                The lab
              </Link>{" "}
              documents every engine and its live state.
            </p>
          </StepCard>
        ) : null}
      </div>
    </div>
  );
}
