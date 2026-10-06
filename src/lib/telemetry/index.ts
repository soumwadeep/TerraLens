/**
 * Telemetry (spec §34, §49) — server-only.
 *
 * Two sinks, one honesty contract:
 *  - a local ring buffer (always on) that /api/telemetry and /lab/observability
 *    read — the app's observability works with no external service at all;
 *  - Sentry, ONLY when a DSN is configured, and ONLY through redactSentryEvent
 *    (see redact.ts). No photos, audio, notes, story text, coordinates or
 *    prompts ever leave; agent traces carry whitelisted scalars only.
 *
 * Sentry init is lazy and failure-safe: a bad DSN must never break a request.
 */
import { getServerConfig } from "@/lib/config";
import { AgentTraceSchema, type AgentTrace, type AgentSpan } from "@/lib/domain/types";
import { nowIso, uuid } from "@/lib/utils";
import { redactSentryEvent, scalarAttributes } from "@/lib/telemetry/redact";

export interface TelemetryEvent {
  id: string;
  at: string;
  kind: "agent-trace" | "error" | "integration";
  name: string;
  status: "ok" | "error" | "info";
  durationMs: number | null;
  attributes: Record<string, string | number | boolean>;
}

const MAX_EVENTS = 50;

interface TelemetryGlobal {
  events?: TelemetryEvent[];
  sentry?: Promise<typeof import("@sentry/nextjs") | null>;
  sentryState?: "configured" | "unavailable" | "not-configured";
}

const globalForTelemetry = globalThis as unknown as { __terralensTelemetry?: TelemetryGlobal };
const state: TelemetryGlobal = (globalForTelemetry.__terralensTelemetry ??= {});

function push(event: TelemetryEvent): void {
  const events = (state.events ??= []);
  events.unshift(event);
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
}

function record(
  kind: TelemetryEvent["kind"],
  name: string,
  status: TelemetryEvent["status"],
  durationMs: number | null,
  attributes: Record<string, unknown>
): TelemetryEvent {
  const event: TelemetryEvent = {
    id: uuid(),
    at: nowIso(),
    kind,
    name,
    status,
    durationMs,
    attributes: scalarAttributes(attributes),
  };
  push(event);
  return event;
}

// ---------------------------------------------------------------------------
// Sentry (lazy, server-side, redacted)
// ---------------------------------------------------------------------------

async function ensureSentry(): Promise<typeof import("@sentry/nextjs") | null> {
  if (state.sentry) return state.sentry;
  state.sentry = (async () => {
    const cfg = getServerConfig();
    if (!cfg.sentry.dsn) {
      state.sentryState = "not-configured";
      return null;
    }
    try {
      const Sentry = await import("@sentry/nextjs");
      if (!Sentry.isInitialized()) {
        Sentry.init({
          dsn: cfg.sentry.dsn,
          sendDefaultPii: false,
          tracesSampleRate: 0.1,
          beforeSend: (event) =>
            redactSentryEvent(event as unknown as Record<string, unknown>) as never,
        } as Parameters<typeof Sentry.init>[0]);
      }
      state.sentryState = "configured";
      return Sentry;
    } catch (error) {
      state.sentryState = "unavailable";
      console.warn(
        `[telemetry] Sentry init failed: ${error instanceof Error ? error.message : "unknown"}`
      );
      return null;
    }
  })();
  return state.sentry;
}

/** Called from instrumentation so the configured state is visible at boot. */
export async function initTelemetry(): Promise<void> {
  await ensureSentry();
  if (state.sentryState === "configured")
    console.info("[telemetry] Sentry is configured (redacted).");
}

export function sentryFacts(): {
  configured: boolean;
  state: string;
  org: string | null;
  project: string | null;
} {
  const cfg = getServerConfig();
  return {
    configured: Boolean(cfg.sentry.dsn),
    state: state.sentryState ?? (cfg.sentry.dsn ? "configured" : "not-configured"),
    org: cfg.sentry.org,
    project: cfg.sentry.project,
  };
}

// ---------------------------------------------------------------------------
// Capture APIs
// ---------------------------------------------------------------------------

/**
 * Persist one agent run into both sinks. The trace is schema-validated again
 * here (defense in depth) and only whitelisted scalar attributes are sent.
 */
export async function captureAgentTrace(trace: AgentTrace): Promise<void> {
  const parsed = AgentTraceSchema.safeParse(trace);
  if (!parsed.success) return;
  const spans: AgentSpan[] = parsed.data.spans;
  const attributes: Record<string, unknown> = {
    correlationId: parsed.data.id,
    status: parsed.data.status,
    spanCount: spans.length,
    spanNames: spans.map((s) => s.name).join(","),
    // Ordered [name, durationMs, status] tuples so /lab/observability can
    // render the real span breakdown — names and timings only, never content.
    spanTimeline: JSON.stringify(spans.map((s) => [s.name, s.durationMs, s.status])),
  };
  for (const span of spans) {
    for (const [key, value] of Object.entries(span.attributes)) {
      attributes[`${span.name}.${key}`] = value;
    }
  }
  record("agent-trace", parsed.data.name, parsed.data.status, parsed.data.durationMs, attributes);
  try {
    const Sentry = await ensureSentry();
    Sentry?.captureEvent({
      message: `agent-trace:${parsed.data.name}`,
      level: parsed.data.status === "ok" ? "info" : "error",
      tags: { kind: "agent-trace", status: parsed.data.status },
      extra: scalarAttributes(attributes),
    });
  } catch {
    /* Sentry must never break a request */
  }
}

/**
 * Record a server-side failure. `name` is a stable machine label
 * (e.g. "voice.synthesize"); `attributes` are counters/flags. The error
 * message is engine-generated by contract — never user text.
 */
export function captureServerError(
  name: string,
  error: unknown,
  attributes?: Record<string, unknown>
): void {
  const message = error instanceof Error ? error.message.slice(0, 300) : "unknown error";
  const kind = error instanceof Error ? error.name : "Error";
  record("error", name, "error", null, { ...attributes, errorKind: kind });
  void (async () => {
    try {
      const Sentry = await ensureSentry();
      Sentry?.captureEvent({
        message: `${name}: ${message}`,
        level: "error",
        tags: { kind: "error" },
        extra: scalarAttributes(attributes ?? {}),
      });
    } catch {
      /* best-effort */
    }
  })();
}

/** Record an integration probe outcome (used by the registry route). */
export function captureIntegrationCheck(
  id: string,
  ready: boolean,
  detail: string,
  durationMs: number
): void {
  record("integration", `integration.${id}`, ready ? "ok" : "error", durationMs, { detail });
}

export function getRecentTelemetry(limit = MAX_EVENTS): TelemetryEvent[] {
  return (state.events ?? []).slice(0, Math.max(0, Math.min(limit, MAX_EVENTS)));
}
