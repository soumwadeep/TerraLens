/**
 * Knowledge retrieval route (spec §6e).
 *
 * GET  — configuration facts, or `?health=1` for a live Tiger Data probe.
 * POST — a search over the deployment's Tiger Data knowledge base.
 *
 * The bundled field guide lives on-device; this route only ever answers for
 * the server-side extension of it. Unconfigured or unreachable → typed
 * `unavailable`, never fabricated records.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerConfig } from "@/lib/config";
import {
  probeTiger,
  searchTigerKnowledge,
  TigerUnavailableError,
  tigerConfigured,
} from "@/lib/server/tiger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KnowledgeQuerySchema = z.object({
  query: z.string().min(1).max(300),
  limit: z.number().int().min(1).max(25).default(5),
});

function unavailable(state: string, reason: string) {
  return NextResponse.json({ kind: "unavailable", state, reason }, { status: 200 });
}

export async function GET(request: Request) {
  const cfg = getServerConfig();
  const url = new URL(request.url);
  const wantsHealth = url.searchParams.get("health") === "1";

  if (wantsHealth) {
    const probe = await probeTiger();
    return NextResponse.json({ configured: tigerConfigured(), probe });
  }
  return NextResponse.json({
    configured: tigerConfigured(),
    embeddingModel: cfg.gemma.embeddingModel ?? null,
    note: tigerConfigured()
      ? "POST {query, limit} to search the knowledge base, or use ?health=1 for a live check."
      : "Tiger Data is not configured. The bundled field guide on this device is the whole knowledge base.",
  });
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const parsed = KnowledgeQuerySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid knowledge query.", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 }
    );
  }

  try {
    const result = await searchTigerKnowledge(parsed.data.query, parsed.data.limit);
    return NextResponse.json({ kind: "ok", records: result.records, engine: result.engine });
  } catch (error) {
    if (error instanceof TigerUnavailableError) {
      return unavailable(error.state, error.message);
    }
    return unavailable("unreachable", "Tiger Data did not answer.");
  }
}
