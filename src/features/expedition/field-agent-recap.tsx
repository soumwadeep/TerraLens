"use client";

/**
 * Field agent recap card (spec §24, §34, §49) — the welcome-back note on a
 * completed expedition.
 *
 * Honesty contract:
 *  - The deterministic recap is computed on-device FIRST, from the same real
 *    numbers. It is shown whenever the AI path did not produce a recap, and it
 *    is always labeled as a computed summary — never as an AI write-up.
 *  - The context packet is text-only and deliberately narrow: stats, mission
 *    titles, observation categories — no photos, no notes, no coordinates.
 *    The story the user wrote is included only when privacy is not LOCAL_ONLY.
 *  - LOCAL_ONLY privacy skips the server entirely: the card stays on-device.
 *  - The server may queue the run as a durable Temporal workflow; while it
 *    runs, this card polls for the stored result and keeps the computed
 *    summary on screen — it never fakes progress or text.
 */
import * as React from "react";
import { CloudCog, RefreshCw, SearchCheck, Sparkles, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deterministicRecap, type FieldRecap, type RecapContext } from "@/lib/ai/recap";
import { useAppStore } from "@/lib/state/app-store";
import type { Expedition, GrassScore, Mission, Observation } from "@/lib/domain/types";

type CardState =
  | { kind: "checking" }
  | { kind: "none" }
  | { kind: "asking" }
  | { kind: "queued"; workflowId: string; polls: number }
  | { kind: "recap"; recap: FieldRecap; engine: "mastra" | "deterministic"; model: string | null }
  | { kind: "unavailable"; reason: string };

const POLL_EVERY_MS = 3500;
const MAX_POLLS = 12;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildContext(
  expedition: Expedition,
  missions: Mission[],
  observations: Observation[],
  score: GrassScore | null,
  includeStory: boolean
): RecapContext {
  return {
    expeditionId: expedition.id,
    title: expedition.title,
    mode: expedition.mode,
    environment: expedition.environment,
    durationMinutes: expedition.durationMinutes,
    stats: {
      outdoorSeconds: Math.max(0, expedition.stats.elapsedSeconds - expedition.stats.pocketSeconds),
      pocketSeconds: expedition.stats.pocketSeconds,
      screenActiveSeconds: expedition.stats.screenActiveSeconds,
      distanceMeters: expedition.stats.distanceMeters,
      interruptions: expedition.stats.interruptions,
    },
    missions: missions.slice(0, 20).map((m) => ({
      type: m.type,
      title: m.title,
      status: m.status,
    })),
    observations: observations.slice(0, 30).map((o) => ({
      category: o.category,
      commonName: o.userCorrection?.commonName ?? o.analysis?.commonName ?? null,
      confidence: o.analysis?.confidence ?? 0,
      tags: o.tags,
    })),
    score: score ? { score: score.score, rank: score.rank } : null,
    story: includeStory && expedition.story ? expedition.story.slice(0, 2000) : null,
  };
}

export function FieldAgentRecap({
  expedition,
  missions,
  observations,
  score,
}: {
  expedition: Expedition;
  missions: Mission[];
  observations: Observation[];
  score: GrassScore | null;
}) {
  const userId = useAppStore((s) => s.user?.id ?? null);
  const privacyMode = useAppStore((s) => s.preferences?.privacyMode ?? "HYBRID");
  const localOnly = privacyMode === "LOCAL_ONLY";

  const context = React.useMemo(
    () => buildContext(expedition, missions, observations, score, !localOnly),
    [expedition, missions, observations, score, localOnly]
  );

  const localRecap = React.useMemo<FieldRecap | null>(() => {
    try {
      return deterministicRecap(context);
    } catch {
      return null;
    }
  }, [context]);

  const [state, setState] = React.useState<CardState>({ kind: "checking" });
  const cancelledRef = React.useRef(false);
  React.useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  // LOCAL_ONLY: no server call at all — the card is the computed summary.
  React.useEffect(() => {
    if (localOnly) setState({ kind: "none" });
  }, [localOnly]);

  // Look for an already-stored recap once the card mounts.
  React.useEffect(() => {
    if (localOnly || !userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/field-agent?userId=${encodeURIComponent(userId)}&expeditionId=${encodeURIComponent(expedition.id)}`,
          { cache: "no-store", signal: AbortSignal.timeout(8000) }
        );
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "none" });
          return;
        }
        const body = (await res.json().catch(() => null)) as {
          stored?: { recap?: FieldRecap; engine?: string; model?: string | null } | null;
        } | null;
        const stored = body?.stored ?? null;
        if (stored?.recap) {
          setState({
            kind: "recap",
            recap: stored.recap,
            engine: stored.engine === "mastra" ? "mastra" : "deterministic",
            model: stored.model ?? null,
          });
        } else {
          setState({ kind: "none" });
        }
      } catch {
        if (!cancelled) setState({ kind: "none" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [localOnly, userId, expedition.id]);

  const fetchStored = React.useCallback(async (): Promise<CardState | null> => {
    if (!userId) return null;
    try {
      const res = await fetch(
        `/api/field-agent?userId=${encodeURIComponent(userId)}&expeditionId=${encodeURIComponent(expedition.id)}`,
        { cache: "no-store", signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) return null;
      const body = (await res.json().catch(() => null)) as {
        stored?: { recap?: FieldRecap; engine?: string; model?: string | null } | null;
      } | null;
      const stored = body?.stored ?? null;
      if (!stored?.recap) return null;
      return {
        kind: "recap",
        recap: stored.recap,
        engine: stored.engine === "mastra" ? "mastra" : "deterministic",
        model: stored.model ?? null,
      };
    } catch {
      return null;
    }
  }, [userId, expedition.id]);

  const ask = React.useCallback(async () => {
    if (!userId || localOnly || !localRecap) return;
    setState({ kind: "asking" });
    try {
      const res = await fetch("/api/field-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          expeditionId: expedition.id,
          context,
          fallback: localRecap,
          origin: "client",
        }),
        signal: AbortSignal.timeout(180_000),
      });
      if (cancelledRef.current) return;
      if (!res.ok) {
        setState({
          kind: "unavailable",
          reason: `The request was rejected (HTTP ${res.status}).`,
        });
        return;
      }
      const body = (await res.json().catch(() => null)) as
        | { queued: true; workflowId: string }
        | {
            queued: false;
            available: true;
            recap: FieldRecap;
            model: string | null;
          }
        | { queued: false; available: false; reason: string }
        | null;

      if (body && body.queued === true) {
        setState({ kind: "queued", workflowId: body.workflowId, polls: 0 });
        for (let i = 0; i < MAX_POLLS; i += 1) {
          await wait(POLL_EVERY_MS);
          if (cancelledRef.current) return;
          setState({ kind: "queued", workflowId: body.workflowId, polls: i + 1 });
          const stored = await fetchStored();
          if (cancelledRef.current) return;
          if (stored) {
            setState(stored);
            return;
          }
        }
        setState({
          kind: "unavailable",
          reason:
            "The durable workflow is still running. The computed summary below is ready now; check back in a minute for the agent's note.",
        });
        return;
      }
      if (body && body.queued === false && body.available === true) {
        setState({ kind: "recap", recap: body.recap, engine: "mastra", model: body.model });
        return;
      }
      if (body && body.queued === false && body.available === false) {
        setState({ kind: "unavailable", reason: body.reason });
        return;
      }
      setState({ kind: "unavailable", reason: "The field agent route answered unexpectedly." });
    } catch {
      if (!cancelledRef.current) {
        setState({
          kind: "unavailable",
          reason: "The field agent could not be reached from this device.",
        });
      }
    }
  }, [userId, localOnly, localRecap, context, expedition.id, fetchStored]);

  const noteCount = observations.filter((o) => o.type === "note").length;

  return (
    <Card className="card-strata border-moss/30">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {state.kind === "recap" && state.engine === "mastra" ? (
            <Badge variant="success" className="gap-1">
              <Sparkles className="h-3 w-3" aria-hidden />
              AI field agent
            </Badge>
          ) : (
            <Badge variant="muted" className="gap-1">
              <SearchCheck className="h-3 w-3" aria-hidden />
              Computed summary
            </Badge>
          )}
          {state.kind === "recap" && state.model ? (
            <span className="text-xs text-muted-foreground">{state.model}</span>
          ) : null}
        </div>
        <CardTitle className="mt-1 font-display text-lg">
          {state.kind === "recap" ? state.recap.headline : "Welcome back"}
        </CardTitle>
        <CardDescription>
          {state.kind === "recap" && state.engine === "mastra"
            ? "Written from this expedition's numbers and your own words — nothing invented."
            : "Built only from this expedition's real numbers — no AI ran for this one."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {state.kind === "checking" || state.kind === "asking" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Timer className="h-4 w-4 animate-pulse" aria-hidden />
            {state.kind === "asking"
              ? "The field agent is reading your expedition…"
              : "Checking for your welcome-back note…"}
          </p>
        ) : null}

        {state.kind === "none" ? (
          <>
            <p className="text-pretty text-sm text-muted-foreground">
              {localOnly
                ? "Privacy is set to on-device only, so no request leaves this device. This summary is computed here, from the same numbers the score uses."
                : "One tap sends a text-only summary of this expedition — times, mission titles, observation categories. No photos, no notes, no location. The field agent writes a welcome-back note; a copy is stored with your account when available."}
            </p>
            {!localOnly ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void ask()} disabled={!userId || !localRecap}>
                  <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />
                  Write my recap
                </Button>
                <span className="text-xs text-muted-foreground">
                  {noteCount > 0
                    ? `${observations.length} observation${observations.length === 1 ? "" : "s"} on the sheet — notes themselves stay home.`
                    : "You can do this later; nothing is lost."}
                </span>
              </div>
            ) : null}
          </>
        ) : null}

        {state.kind === "queued" ? (
          <p className="flex items-start gap-2 text-pretty text-sm text-muted-foreground">
            <CloudCog className="mt-0.5 h-4 w-4 shrink-0 animate-pulse" aria-hidden />
            Queued as a durable workflow ({state.workflowId.slice(0, 24)}…) — it finishes even if
            you close this tab. Checking for the result… ({state.polls}/{MAX_POLLS})
          </p>
        ) : null}

        {state.kind === "unavailable" ? (
          <div className="space-y-2">
            <p className="text-pretty text-sm text-muted-foreground">
              The AI field agent didn&apos;t answer this time: {state.reason}
            </p>
            <Button size="sm" variant="outline" onClick={() => void ask()} disabled={!userId}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Try again
            </Button>
          </div>
        ) : null}

        {/* The recap body: the AI's when it exists, the computed one otherwise. */}
        {state.kind === "recap" ? (
          <div className="space-y-3">
            <p className="text-pretty text-sm">{state.recap.recap}</p>
            {state.recap.highlights.length > 0 ? (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {state.recap.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-moss" aria-hidden />
                    <span className="text-pretty">{h}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {state.recap.nextSuggestion ? (
              <p className="text-pretty rounded-lg border bg-muted/40 p-3 text-sm">
                Next time: {state.recap.nextSuggestion}
              </p>
            ) : null}
            {state.recap.encouragement ? (
              <p className="text-pretty text-sm italic text-muted-foreground">
                {state.recap.encouragement}
              </p>
            ) : null}
            {state.engine === "deterministic" ? (
              <Button size="sm" variant="outline" onClick={() => void ask()} disabled={!userId}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Ask the AI field agent
              </Button>
            ) : null}
          </div>
        ) : null}

        {state.kind !== "recap" &&
        state.kind !== "none" &&
        state.kind !== "checking" &&
        localRecap ? (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Computed summary (ready now)
            </p>
            <p className="text-pretty text-sm">{localRecap.recap}</p>
          </div>
        ) : null}

        {state.kind === "none" && localRecap && localOnly ? (
          <div className="space-y-2">
            <p className="text-pretty text-sm">{localRecap.recap}</p>
            {localRecap.highlights.length > 0 ? (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {localRecap.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-moss" aria-hidden />
                    <span className="text-pretty">{h}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
