"use client";

/**
 * Journal — everything you've done outside, newest first.
 * Day-grouped expedition cards with score and observation counts, plus a
 * field collection of the most recent findings.
 */
import * as React from "react";
import Link from "next/link";
import { ChevronRight, Leaf, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/app-shell";
import { ObservationCard } from "@/features/expedition/observation-card";
import {
  expeditionRepository,
  grassScoreRepository,
  observationRepository,
} from "@/lib/db/repositories";
import { MODE_META } from "@/lib/domain/labels";
import { GRASS_RANK_META } from "@/lib/scoring/grass-score";
import type { Expedition, GrassScore, Observation } from "@/lib/domain/types";

const FIELD_COLLECTION_LIMIT = 8;

interface JournalEntry {
  expedition: Expedition;
  score: GrassScore | null;
  observationCount: number;
}

function formatDay(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const today = new Date();
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (isToday) return "Today";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function JournalPage() {
  const [entries, setEntries] = React.useState<JournalEntry[] | null>(null);
  const [fieldCollection, setFieldCollection] = React.useState<Observation[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [expeditions, observations] = await Promise.all([
          expeditionRepository.all(),
          observationRepository.all(),
        ]);
        const scores = await Promise.all(
          expeditions.map((e) => grassScoreRepository.byExpedition(e.id))
        );
        const next: JournalEntry[] = expeditions
          .filter((e) => e.status !== "PLANNED" || e.startedAt !== null)
          .map((expedition, i) => ({
            expedition,
            score: scores[i] ?? null,
            observationCount: observations.filter((o) => o.expeditionId === expedition.id).length,
          }));
        const recent = [...observations]
          .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
          .slice(0, FIELD_COLLECTION_LIMIT);
        if (!cancelled) {
          setEntries(next);
          setFieldCollection(recent);
        }
      } catch {
        if (!cancelled) {
          setEntries([]);
          setFieldCollection([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (entries === null) {
    return (
      <div>
        <PageHeader title="Journal" description="Your time outside, remembered." />
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  // Group by local day.
  const groups = new Map<string, JournalEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.expedition.dateKey) ?? [];
    list.push(entry);
    groups.set(entry.expedition.dateKey, list);
  }
  const dayKeys = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Journal"
        description="Your time outside, remembered."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/expeditions/new">
              <NotebookPen className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              New
            </Link>
          </Button>
        }
      />

      {fieldCollection.length > 0 ? (
        <section aria-label="Field collection" className="mb-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Field collection
          </h2>
          <div className="space-y-2">
            {fieldCollection.map((observation) => (
              <Link
                key={observation.id}
                href={`/expeditions/${observation.expeditionId}`}
                className="block rounded-2xl transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ObservationCard observation={observation} />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 px-4 py-10 text-center">
            <Leaf className="h-8 w-8 text-fern" aria-hidden />
            <div>
              <p className="font-display text-lg font-medium">Nothing logged yet</p>
              <p className="mt-1 text-pretty text-sm text-muted-foreground">
                Finish your first expedition and it lands here — with its score, evidence and story.
              </p>
            </div>
            <Button asChild>
              <Link href="/expeditions/new">Start an expedition</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {dayKeys.map((dayKey) => (
            <section key={dayKey} aria-label={dayKey}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {formatDay(dayKey)}
              </h2>
              <div className="space-y-2.5">
                {(groups.get(dayKey) ?? []).map(({ expedition, score, observationCount }) => (
                  <Link
                    key={expedition.id}
                    href={`/expeditions/${expedition.id}`}
                    className="block rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl" aria-hidden>
                        {MODE_META[expedition.mode].emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{expedition.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{MODE_META[expedition.mode].label}</span>
                          <span aria-hidden>·</span>
                          <span>{expedition.durationMinutes} min planned</span>
                          <span aria-hidden>·</span>
                          <span>
                            {observationCount}{" "}
                            {observationCount === 1 ? "observation" : "observations"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {expedition.status === "ACTIVE" ? (
                          <Badge variant="success">Active</Badge>
                        ) : expedition.status === "PLANNED" ? (
                          <Badge variant="muted">Planned</Badge>
                        ) : null}
                        {score ? (
                          <Badge variant="outline" className="gap-1 tabular-nums">
                            <Leaf className="h-3 w-3 text-forest" aria-hidden />
                            {Math.round(score.score)}
                          </Badge>
                        ) : null}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                      </div>
                    </div>
                    {score ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {GRASS_RANK_META[score.rank].plant} {GRASS_RANK_META[score.rank].label}
                      </p>
                    ) : null}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
