/**
 * Online enrichment route (spec §6f) — SerpApi-backed verification for
 * observations. The client only calls this when the user asks ("Look online")
 * and the privacy mode allows server calls.
 *
 * GET  — configuration facts, or `?health=1` for a live account probe.
 * POST — { query, limit } → google results, or a typed `unavailable`.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { probeSerpApi, searchOnline, serpapiConfigured } from "@/lib/server/serpapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EnrichSchema = z.object({
  query: z.string().min(2).max(300),
  limit: z.number().int().min(1).max(10).default(4),
});

function unavailable(state: string, reason: string) {
  return NextResponse.json({ kind: "unavailable", state, reason }, { status: 200 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("health") === "1") {
    const probe = await probeSerpApi();
    return NextResponse.json({ configured: serpapiConfigured(), probe });
  }
  return NextResponse.json({
    configured: serpapiConfigured(),
    note: serpapiConfigured()
      ? "POST {query, limit} for online results, or use ?health=1 for a live check."
      : "SerpApi is not configured. Online context is unavailable on this deployment.",
  });
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const parsed = EnrichSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid enrichment request.", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 }
    );
  }

  const result = await searchOnline(parsed.data.query, parsed.data.limit);
  if (!result.ok) return unavailable(result.state, result.reason);
  return NextResponse.json({
    kind: "ok",
    engine: "google",
    answer: result.answer,
    results: result.results,
  });
}
