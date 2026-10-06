/**
 * App health endpoint.
 *
 * This reports only what is true without any external dependency: the Next.js
 * server answered. It is deliberately NOT a sponsor-integration status board —
 * per the honesty rules, an integration is READY only after its own live
 * health check (see /lab/models), never because a route responded here.
 */
import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = getServerConfig();
  return NextResponse.json({
    ok: true,
    service: "terralens",
    version: "0.1.0",
    at: new Date().toISOString(),
    // Configuration facts, not capability claims — no secrets, no READY states.
    configured: {
      serverAnalysis: cfg.gemma.baseUrl !== null,
      fieldAgent: cfg.fieldAgentEnabled && cfg.gemma.baseUrl !== null,
      mongodb: cfg.flags.mongodb,
      temporal: cfg.flags.temporal,
    },
  });
}
