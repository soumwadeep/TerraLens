"use client";

/**
 * Today — the home surface. Answers one question: "what should I do right now?"
 * Active expedition first; otherwise one clear invitation to go outside.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, CloudOff, Flame, MapPin, Plus, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreRing } from "@/components/score-ring";
import { PageHeader } from "@/components/layout/app-shell";
import { expeditionRepository, grassScoreRepository } from "@/lib/db/repositories";
import { ENVIRONMENT_META, MODE_META } from "@/lib/domain/labels";
import { useAppStore } from "@/lib/state/app-store";
import { computeStreakDays, GRASS_RANK_META } from "@/lib/scoring/grass-score";
import { dateKey, relativeTime } from "@/lib/utils";
import type { Expedition, GrassScore } from "@/lib/domain/types";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

interface TodayData {
  active: Expedition | null;
  todayScores: GrassScore[];
  bestToday: GrassScore | null;
  streakDays: number;
  totalExpeditions: number;
}

async function loadToday(): Promise<TodayData> {
  const today = dateKey();
  const [active, todayScores, allScores, allExpeditions] = await Promise.all([
    expeditionRepository.active(),
    grassScoreRepository.byDateKey(today),
    grassScoreRepository.all(),
    expeditionRepository.all(),
  ]);
  const bestToday =
    todayScores.find((s) => s.scope === "day") ??
    todayScores.reduce<GrassScore | null>(
      (best, s) => (best === null || s.score > best.score ? s : best),
      null
    );
  const uniqueDays = Array.from(new Set(allScores.map((s) => s.dateKey)));
  return {
    active,
    todayScores,
    bestToday,
    streakDays: computeStreakDays(uniqueDays, today),
    totalExpeditions: allExpeditions.filter((e) => e.status === "COMPLETED").length,
  };
}

export function TodayView() {
  const router = useRouter();
  const hydrated = useAppStore((s) => s.hydrated);
  const user = useAppStore((s) => s.user);
  const preferences = useAppStore((s) => s.preferences);
  const storageAvailable = useAppStore((s) => s.storageAvailable);
  const [data, setData] = React.useState<TodayData | null>(null);
  const [storageChecked, setStorageChecked] = React.useState(false);

  // First run goes through onboarding before anything else.
  React.useEffect(() => {
    if (hydrated && preferences && !preferences.onboardingComplete) {
      router.replace("/onboarding");
    }
  }, [hydrated, preferences, router]);

  const refresh = React.useCallback(async () => {
    if (!storageAvailable) return;
    const next = await loadToday();
    setData(next);
  }, [storageAvailable]);

  React.useEffect(() => {
    if (!hydrated) return;
    void refresh();
  }, [hydrated, refresh]);

  React.useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  // First paint after hydration may still not have read storage; show skeletons.
  React.useEffect(() => {
    if (hydrated) setStorageChecked(true);
  }, [hydrated]);

  const name = user?.displayName?.trim() || "Explorer";

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={`${greeting()}, ${name}`}
        description="One small step outside beats a perfect plan indoors."
      />

      {!storageAvailable ? (
        <Card className="mb-4 border-warning/50 bg-warning/5">
          <CardContent className="flex items-start gap-3 p-4 pt-4">
            <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
            <div className="text-sm">
              <p className="font-medium">Private browsing detected</p>
              <p className="mt-1 text-pretty text-muted-foreground">
                Local storage is unavailable, so expeditions can&apos;t be saved on this device.
                Everything else still works — data just won&apos;t survive a refresh.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Active expedition — the strongest possible call to action. */}
      {data?.active ? (
        <Card className="card-strata mb-4 border-forest/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <Badge variant="success" className="gap-1">
                <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-current" />
                Active now
              </Badge>
              <span className="text-xs text-muted-foreground">
                started {data.active.startedAt ? relativeTime(data.active.startedAt) : "—"}
              </span>
            </div>
            <CardTitle className="mt-2 font-display text-xl">
              {MODE_META[data.active.mode].emoji} {data.active.title}
            </CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              <span>{MODE_META[data.active.mode].label} expedition</span>
              {data.active.environment !== "unknown" ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  {ENVIRONMENT_META[data.active.environment].label}
                </span>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="lg" className="w-full">
              <Link href={`/expeditions/${data.active.id}`}>
                Continue expedition <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="card-strata mb-4">
          <CardContent className="flex flex-col items-center gap-4 px-4 py-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-forest/10">
              <Sun className="h-7 w-7 text-forest" aria-hidden />
            </div>
            <div>
              <p className="font-display text-lg font-medium">
                Nothing scheduled. Go find something.
              </p>
              <p className="mt-1 text-pretty text-sm text-muted-foreground">
                Pick a mood, a duration and a place — TerraLens handles the rest, then tells you to
                put your phone away.
              </p>
            </div>
            <Button asChild size="lg" className="w-full max-w-xs">
              <Link href="/expeditions/new">
                <Plus className="mr-2 h-4 w-4" aria-hidden />
                Start an expedition
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Today's score */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Today&apos;s Grass Score</CardTitle>
            <CardDescription>
              {data?.bestToday
                ? `Measured ${relativeTime(data.bestToday.computedAt)}`
                : "Not measured yet — go outside to earn it."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            {!storageChecked ? (
              <Skeleton className="h-[148px] w-[148px] rounded-full" />
            ) : data?.bestToday ? (
              <>
                <ScoreRing score={data.bestToday.score} size={132} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {GRASS_RANK_META[data.bestToday.rank].plant}{" "}
                    {GRASS_RANK_META[data.bestToday.rank].label}
                  </p>
                  <p className="mt-1 text-pretty text-xs text-muted-foreground">
                    {GRASS_RANK_META[data.bestToday.rank].blurb}
                  </p>
                </div>
              </>
            ) : (
              <div className="flex h-[132px] w-full items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                Score appears after your first expedition today
              </div>
            )}
          </CardContent>
        </Card>

        {/* Streak + totals */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Your rhythm</CardTitle>
            <CardDescription>Consistency is the whole game.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border bg-muted/40 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Flame className="h-3.5 w-3.5 text-sunlight" aria-hidden />
                Streak
              </div>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
                {data ? data.streakDays : "—"}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  {data?.streakDays === 1 ? "day" : "days"}
                </span>
              </p>
            </div>
            <div className="rounded-xl border bg-muted/40 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                Expeditions
              </div>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
                {data ? data.totalExpeditions : "—"}
                <span className="ml-1 text-sm font-normal text-muted-foreground">done</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="mt-6 text-pretty text-center text-xs text-muted-foreground">
        Screens are for planning and reviewing. The exploring part happens without us.
      </p>
    </div>
  );
}
