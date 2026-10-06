"use client";

/**
 * Post-expedition score view. Every number is read from the stored
 * deterministic score — the breakdown, notes and GPS caveat are shown so the
 * user can explain exactly where the points came from.
 */
import * as React from "react";
import { Info, MapPinOff } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScoreRing } from "@/components/score-ring";
import { GRASS_COMPONENT_META, GRASS_RANK_META, GRASS_SCORE_MAX } from "@/lib/scoring/grass-score";
import type { Expedition, GrassScore } from "@/lib/domain/types";

export function ScoreSummary({
  expedition,
  score,
  dayScore,
  children,
}: {
  expedition: Expedition;
  score: GrassScore;
  dayScore: GrassScore | null;
  children?: React.ReactNode;
}) {
  const rank = GRASS_RANK_META[score.rank];
  const showDay = dayScore !== null && dayScore.id !== score.id;

  return (
    <div className="space-y-4">
      <Card className="card-strata">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">Expedition complete</Badge>
            {score.scope === "expedition" ? <Badge variant="muted">Expedition score</Badge> : null}
          </div>
          <CardTitle className="mt-2 font-display text-xl">{expedition.title}</CardTitle>
          <CardDescription>
            {rank.plant} {rank.label} — {rank.blurb}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
          <ScoreRing score={score.score} label="expedition" />
          <div className="w-full flex-1 space-y-3">
            {showDay ? (
              <div className="rounded-xl border bg-muted/40 p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">
                    Today&apos;s total (all expeditions)
                  </span>
                  <span className="font-display text-xl font-semibold tabular-nums">
                    {dayScore.score}
                    <span className="text-xs font-normal text-muted-foreground">
                      /{GRASS_SCORE_MAX}
                    </span>
                  </span>
                </div>
                <Progress
                  value={dayScore.score}
                  max={GRASS_SCORE_MAX}
                  label="Today's combined Grass Score"
                  className="mt-2"
                />
              </div>
            ) : null}
            <div className="space-y-2">
              {GRASS_COMPONENT_META.slice(0, 4).map(({ key, label, max }) => {
                const value = score.components[key];
                return (
                  <div key={key}>
                    <div className="mb-1 flex items-baseline justify-between text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="tabular-nums">
                        {Math.round(value)}
                        <span className="text-muted-foreground">/{max}</span>
                      </span>
                    </div>
                    <Progress value={value} max={max} label={label} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
        {!score.gpsAvailable ? (
          <CardContent className="pt-0">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPinOff className="h-3.5 w-3.5" aria-hidden />
              GPS was off, so distance wasn&apos;t counted — everything else still scored.
            </p>
          </CardContent>
        ) : null}
        {score.notes.length > 0 ? (
          <CardContent className="pt-0">
            <details className="group">
              <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <Info className="h-3.5 w-3.5" aria-hidden />
                Why these numbers
              </summary>
              <ul className="mt-2 space-y-1 pl-5 text-xs text-muted-foreground">
                {score.notes.map((note) => (
                  <li key={note} className="list-disc text-pretty">
                    {note}
                  </li>
                ))}
              </ul>
            </details>
          </CardContent>
        ) : null}
      </Card>

      {children}
    </div>
  );
}
