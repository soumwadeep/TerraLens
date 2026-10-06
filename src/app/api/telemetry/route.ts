/**
 * Telemetry facts + the local ring buffer (spec §34, §49).
 *
 * Works with no Sentry DSN at all: the ring buffer is the app's own
 * observability. When Sentry is configured, the same events were forwarded
 * through the redaction layer — this route never exposes anything Sentry
 * did not already receive in redacted form.
 */
import { NextResponse } from "next/server";
import { getRecentTelemetry, sentryFacts } from "@/lib/telemetry";
import { nowIso } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    sentry: sentryFacts(),
    events: getRecentTelemetry(50),
    at: nowIso(),
  });
}
