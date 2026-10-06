/**
 * Integration registry API (spec §48, §49).
 *
 * GET          → configuration facts ("configured" is a config truth). If a
 *                live check ran in the last 60 s its result is attached.
 * GET ?live=1  → additionally runs each configured integration's own health
 *                check. `state: "ready"` is only ever claimed here, and only
 *                after that integration's check actually passed.
 *
 * No secrets are exposed: booleans and small facts only.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getIntegrationStatuses } from "@/lib/integrations/registry";
import { nowIso } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const live = request.nextUrl.searchParams.get("live") === "1";
  const integrations = await getIntegrationStatuses({ live });
  return NextResponse.json({
    live,
    at: nowIso(),
    ready: integrations.filter((item) => item.state === "ready").length,
    total: integrations.length,
    integrations,
  });
}
