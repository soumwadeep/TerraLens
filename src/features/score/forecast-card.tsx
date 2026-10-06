"use client";

/**
 * Forecast — the TabPFN boundary made visible (spec §28).
 *
 * Features are gathered from this device's own record (counts and calendar
 * only — no notes, no coordinates, no photos) and posted to the deployment's
 * prediction service. The card only ever shows probabilities the trained
 * model produced; when the service is absent, untrained, paused, or the
 * record too thin, it says so instead of guessing.
 */
import * as React from "react";
import { CloudSun, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  expeditionRepository,
  grassScoreRepository,
  observationRepository,
} from "@/lib/db/repositories";
import { usePreferences } from "@/lib/state/app-store";
import { cn } from "@/lib/utils";

const MIN_FEATURES = 4;

interface ForecastOutput {
  key: string;
  label: string;
  probability: number | null;
  window: string | null;
}

type ForecastState =
  | { kind: "loading" }
  | { kind: "local-only" }
  | { kind: "not-configured" }
  | { kind: "insufficient-data"; message: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "ok"; outputs: ForecastOutput[]; modelVersion: string | null; featureCount: number };

/** Aggregate counts + calendar — the only things this feature ever sends. */
async function gatherFeatures(): Promise<Record<string, number>> {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const [observations, expeditions, scores] = await Promise.all([
    observationRepository.all(),
    expeditionRepository.all(),
    grassScoreRepository.all(),
  ]);

  const recentObs = observations.filter((o) => new Date(o.createdAt) >= sevenDaysAgo);
  const countCategory = (category: string) =>
    recentObs.filter((o) => o.category === category).length;
  const walks = expeditions.filter(
    (e) => e.endedAt !== null && new Date(e.endedAt) >= sevenDaysAgo
  ).length;
  const recentScores = scores.filter((s) => new Date(s.computedAt) >= thirtyDaysAgo);

  const features: Record<string, number> = {
    obs_count_7d: recentObs.length,
    walks_last_7d: walks,
    hour_of_day: now.getHours(),
    month: now.getMonth() + 1,
    insect_count_7d: countCategory("insect"),
    bird_count_7d: countCategory("bird"),
    flower_count_7d: countCategory("flower"),
  };
  if (recentScores.length > 0) {
    features.avg_score_30d = Math.round(
      recentScores.reduce((sum, s) => sum + s.score, 0) / recentScores.length
    );
  }
  return features;
}

function parseOutputs(raw: unknown): ForecastOutput[] | null {
  if (typeof raw !== "object" || raw === null) return null;
  const list = (raw as { outputs?: unknown }).outputs;
  if (!Array.isArray(list)) return null;
  const outputs: ForecastOutput[] = [];
  for (const entry of list) {
    if (typeof entry !== "object" || entry === null) continue;
    const rec = entry as Record<string, unknown>;
    if (typeof rec.key !== "string") continue;
    outputs.push({
      key: rec.key,
      label: typeof rec.label === "string" ? rec.label : rec.key,
      probability:
        typeof rec.probability === "number" && rec.probability >= 0 && rec.probability <= 1
          ? rec.probability
          : null,
      window: typeof rec.window === "string" ? rec.window : null,
    });
  }
  return outputs.length > 0 ? outputs : null;
}

export function ForecastCard() {
  const preferences = usePreferences();
  const [state, setState] = React.useState<ForecastState>({ kind: "loading" });
  const privacyMode = preferences?.privacyMode ?? null;

  React.useEffect(() => {
    if (privacyMode === null) return;
    if (privacyMode === "LOCAL_ONLY") {
      setState({ kind: "local-only" });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const facts = (await fetch("/api/prediction", { cache: "no-store" }).then((r) =>
          r.json()
        )) as {
          configured?: boolean;
        };
        if (cancelled) return;
        if (!facts.configured) {
          setState({ kind: "not-configured" });
          return;
        }

        const features = await gatherFeatures();
        if (cancelled) return;
        const numericCount = Object.values(features).filter(
          (v) => typeof v === "number" && Number.isFinite(v)
        ).length;
        if (numericCount < MIN_FEATURES) {
          setState({
            kind: "insufficient-data",
            message: `A forecast needs at least ${MIN_FEATURES} numeric signals from your field record; there are ${numericCount}.`,
          });
          return;
        }

        const res = (await fetch("/api/prediction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ features, horizonDate: null }),
        }).then((r) => r.json())) as Record<string, unknown>;
        if (cancelled) return;

        if (res.kind === "unavailable") {
          if (res.state === "insufficient-data") {
            setState({
              kind: "insufficient-data",
              message: typeof res.reason === "string" ? res.reason : "Not enough data yet.",
            });
            return;
          }
          setState({
            kind: "unavailable",
            reason:
              typeof res.reason === "string"
                ? res.reason
                : "The prediction service did not answer.",
          });
          return;
        }

        const prediction = res.kind === "ok" ? (res.prediction as Record<string, unknown>) : null;
        if (prediction !== null && prediction.status === "insufficient-data") {
          setState({
            kind: "insufficient-data",
            message:
              typeof prediction.message === "string" ? prediction.message : "Not enough data yet.",
          });
          return;
        }
        if (prediction !== null && prediction.status === "ok") {
          const outputs = parseOutputs(prediction);
          if (outputs !== null) {
            setState({
              kind: "ok",
              outputs,
              modelVersion:
                typeof prediction.modelVersion === "string" ? prediction.modelVersion : null,
              featureCount: numericCount,
            });
            return;
          }
        }
        setState({
          kind: "unavailable",
          reason: "The prediction service returned an unexpected answer.",
        });
      } catch {
        if (!cancelled) {
          setState({ kind: "unavailable", reason: "The prediction service did not answer." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [privacyMode]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CloudSun className="h-4 w-4 text-sky" aria-hidden />
          Forecast
          {state.kind === "ok" ? <Badge variant="sky">TabPFN</Badge> : null}
        </CardTitle>
        <CardDescription>
          {state.kind === "ok"
            ? "From your field record — probabilities come from the trained model, never from the language model."
            : "What your record suggests for the next few hours — when a trained model is available."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.kind === "loading" ? <Skeleton className="h-20 w-full" /> : null}

        {state.kind === "local-only" ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Forecast is paused in LOCAL ONLY mode — nothing leaves this device.
          </p>
        ) : null}

        {state.kind === "not-configured" ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            The prediction service isn&apos;t configured for this deployment, so there is no
            forecast. Nothing is invented to fill the gap.
          </p>
        ) : null}

        {state.kind === "insufficient-data" ? (
          <p className="text-sm text-muted-foreground">Not enough data yet. {state.message}</p>
        ) : null}

        {state.kind === "unavailable" ? (
          <p className="text-sm text-muted-foreground">{state.reason}</p>
        ) : null}

        {state.kind === "ok" ? (
          <div className="space-y-3">
            <ul className="space-y-2.5">
              {state.outputs.map((o) => (
                <li key={o.key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm">{o.label}</span>
                    <span className="text-sm font-medium tabular-nums">
                      {o.probability === null ? "—" : `${Math.round(o.probability * 100)}%`}
                    </span>
                  </div>
                  {o.window ? <p className="text-xs text-muted-foreground">{o.window}</p> : null}
                  <div
                    className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                    role="presentation"
                  >
                    <div
                      className={cn(
                        "h-full rounded-full bg-sky transition-[width] duration-700",
                        o.probability === null && "opacity-0"
                      )}
                      style={{
                        width:
                          o.probability === null
                            ? "0%"
                            : `${Math.max(2, Math.round(o.probability * 100))}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                {state.featureCount} aggregate signals from this device
                {state.modelVersion ? ` · model ${state.modelVersion}` : ""}. A forecast is a
                probability, not a promise — go outside anyway.
              </span>
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
