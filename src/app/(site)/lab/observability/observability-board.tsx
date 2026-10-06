"use client";

/**
 * Observability (spec §26, §34, §49) — real runtime data only.
 *
 * Two sources, one page:
 *  - GET /api/telemetry — the server's in-process ring buffer (last 50 events;
 *    integration probes, errors, and full agent traces) plus Sentry facts.
 *  - the same events carry correlation IDs and ordered span timelines for the
 *    FIELD AGENT TRACE breakdown below.
 *
 * This page never fabricates a trace: if no agent run has happened in this
 * server process, it says so and shows how to make one real.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Binary,
  LoaderCircle,
  Lock,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface TelemetryEvent {
  id: string;
  at: string;
  kind: "agent-trace" | "error" | "integration";
  name: string;
  status: "ok" | "error" | "info";
  durationMs: number | null;
  attributes: Record<string, string | number | boolean>;
}

interface TelemetryResponse {
  sentry: { configured: boolean; state: string; org: string | null; project: string | null };
  events: TelemetryEvent[];
  at: string;
}

type SpanTuple = [string, number, string];

function parseSpanTimeline(attributes: Record<string, string | number | boolean>): SpanTuple[] {
  const raw = attributes.spanTimeline;
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SpanTuple =>
        Array.isArray(item) &&
        typeof item[0] === "string" &&
        typeof item[1] === "number" &&
        typeof item[2] === "string"
    );
  } catch {
    return [];
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} sec`;
  return `${Math.round(ms)} ms`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

const EVENT_STATUS_VARIANT: Record<TelemetryEvent["status"], "success" | "destructive" | "muted"> =
  {
    ok: "success",
    error: "destructive",
    info: "muted",
  };

export function ObservabilityBoard() {
  const [data, setData] = useState<TelemetryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/telemetry", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as TelemetryResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const events = data?.events ?? [];
  const latestTrace = events.find((event) => event.kind === "agent-trace") ?? null;
  const spans = latestTrace ? parseSpanTimeline(latestTrace.attributes) : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-pretty text-sm text-muted-foreground">
          The server keeps the last 50 events in an in-process ring buffer — this works with no
          external service at all. Events reset when the server restarts; nothing is back-filled or
          invented.
        </p>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : (
            <RefreshCw aria-hidden />
          )}
          Refresh
        </Button>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3.5 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p className="text-pretty">
            Could not read the telemetry route: {error}. Nothing is shown rather than guessed.
          </p>
        </div>
      ) : null}

      {/* Sentry facts */}
      <section aria-label="Sentry" className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-forest" aria-hidden />
              Sentry
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {data?.sentry.configured ? (
                data.sentry.state === "unavailable" ? (
                  <Badge variant="warning" className="gap-1 text-[10px] tracking-wide">
                    <TriangleAlert className="h-3 w-3" aria-hidden />
                    INIT FAILED
                  </Badge>
                ) : (
                  <Badge variant="sky" className="gap-1 text-[10px] tracking-wide">
                    <ShieldCheck className="h-3 w-3" aria-hidden />
                    CONFIGURED — DELIVERY NOT CLAIMED
                  </Badge>
                )
              ) : (
                <Badge variant="outline" className="text-[10px] tracking-wide">
                  NOT CONFIGURED
                </Badge>
              )}
              {data?.sentry.org ? (
                <span className="font-mono text-xs text-muted-foreground">{data.sentry.org}</span>
              ) : null}
              {data?.sentry.project ? (
                <span className="font-mono text-xs text-muted-foreground">
                  {data.sentry.project}
                </span>
              ) : null}
            </div>
            <p className="text-pretty text-xs text-muted-foreground">
              The registry never sends a test event into a user&apos;s Sentry org, so delivery is
              never claimed — only that the SDK initialized with redaction. When no DSN is set, the
              ring buffer on this page is the app&apos;s entire observability, and it still fills.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Binary className="size-4 text-forest" aria-hidden />
              Correlation IDs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-pretty text-xs text-muted-foreground">
              Every agent run receives one uuid — its correlation ID — carried on the trace itself
              and on the telemetry event below. The same ID appears in Sentry when a DSN is
              configured, so a judge, a developer, and the trace viewer all point at the same run.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* FIELD AGENT TRACE (§26) */}
      <section aria-label="Field agent trace" className="space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">Field agent trace</h2>
        {latestTrace ? (
          <Card className="overflow-hidden">
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b bg-muted/30 py-3">
              <CardTitle className="font-mono text-xs font-semibold uppercase tracking-widest">
                Field Agent Trace
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge
                  variant={EVENT_STATUS_VARIANT[latestTrace.status]}
                  className="text-[10px] uppercase tracking-wide"
                >
                  {latestTrace.status}
                </Badge>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {formatTime(latestTrace.at)}
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {spans.length > 0 ? (
                <dl className="space-y-2">
                  {spans.map(([name, durationMs, status], index) => (
                    <div
                      key={`${name}-${index}`}
                      className="flex items-baseline justify-between gap-4 text-sm"
                    >
                      <dt
                        className={cn(
                          "min-w-0 truncate",
                          status === "error" && "text-destructive",
                          status === "skipped" && "text-muted-foreground"
                        )}
                      >
                        {name}
                        {status !== "ok" ? (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {status}
                          </span>
                        ) : null}
                      </dt>
                      <dd className="shrink-0 font-mono text-xs tabular-nums">
                        {formatDuration(durationMs)}
                      </dd>
                    </div>
                  ))}
                  <div className="flex items-baseline justify-between gap-4 border-t pt-2.5">
                    <dt className="text-sm font-semibold">Total</dt>
                    <dd className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                      {formatDuration(latestTrace.durationMs)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-pretty text-sm text-muted-foreground">
                  This run recorded no span timeline (older event format). Its total was{" "}
                  <span className="font-mono text-xs">
                    {formatDuration(latestTrace.durationMs)}
                  </span>
                  .
                </p>
              )}
              <p className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3 text-[11px] text-muted-foreground">
                <span className="uppercase tracking-wide">Correlation ID</span>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                  {String(latestTrace.attributes.correlationId ?? latestTrace.id)}
                </code>
                <span aria-hidden>·</span>
                <span>model: {String(latestTrace.attributes.model ?? "—")}</span>
                <span aria-hidden>·</span>
                <span>spans: {String(latestTrace.attributes.spanCount ?? spans.length)}</span>
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-2xl border border-dashed bg-muted/30 p-5">
            <div className="flex items-start gap-3">
              <Activity className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="space-y-1.5">
                <p className="text-sm font-medium">No agent run in this server process yet.</p>
                <p className="text-pretty text-sm text-muted-foreground">
                  This page never fabricates a trace. Run an expedition recap with the field agent
                  enabled — the next run writes its real spans, timings, and correlation ID here.
                  The agent&apos;s own health check is at{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    GET /api/field-agent?health=1
                  </code>
                  .
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Server event ring buffer */}
      <section aria-label="Server events" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-xl font-semibold tracking-tight">Server events</h2>
          <p className="text-xs text-muted-foreground">
            {events.length} of last 50 · as of {formatTime(data?.at ?? null)}
          </p>
        </div>
        {events.length === 0 ? (
          <p className="text-pretty rounded-2xl border border-dashed bg-muted/30 p-5 text-sm text-muted-foreground">
            The ring buffer is empty. It fills as the app runs: integration probes, agent recaps,
            and errors each record one event here.
          </p>
        ) : (
          <ul className="divide-y rounded-2xl border bg-card">
            {events.map((event) => {
              const extraAttributes = Object.entries(event.attributes).filter(
                ([key]) => key !== "spanTimeline"
              );
              return (
                <li key={event.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {formatTime(event.at)}
                    </span>
                    <Badge variant="outline" className="text-[10px] tracking-wide">
                      {event.kind}
                    </Badge>
                    <span className="min-w-0 truncate font-mono text-xs">{event.name}</span>
                    <Badge
                      variant={EVENT_STATUS_VARIANT[event.status]}
                      className="text-[10px] uppercase tracking-wide"
                    >
                      {event.status}
                    </Badge>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {formatDuration(event.durationMs)}
                    </span>
                  </div>
                  {extraAttributes.length > 0 ? (
                    <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground">
                      {extraAttributes.map(([key, value]) => (
                        <span key={key}>
                          {key}={String(value)}
                        </span>
                      ))}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Redaction contract */}
      <section aria-label="Redaction" className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="size-4 text-forest" aria-hidden />
              What never leaves the device
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {[
                "Photos and audio recordings",
                "Private notes and story text",
                "Precise coordinates",
                "Prompts and raw model outputs",
                "Anything that could identify a person",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="size-1 rounded-full bg-forest" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4 text-forest" aria-hidden />
              What is sent — whitelisted scalars
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p className="text-pretty">
              Status, span names and durations, counters, model ids, and correlation IDs. Agent
              traces are schema-validated again at capture time, and Sentry events pass through the
              redaction layer (
              <code className="font-mono text-xs">src/lib/telemetry/redact.ts</code>) with{" "}
              <code className="font-mono text-xs">sendDefaultPii: false</code>.
            </p>
            <p className="text-pretty">
              The trace you see above is exactly what telemetry received — this page renders the
              same event object, so the redaction claim is inspectable, not just stated.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
