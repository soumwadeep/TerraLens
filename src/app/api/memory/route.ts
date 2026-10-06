/**
 * Long-term memory route (spec §33).
 *
 * The local device journal is the source of truth; this route is the
 * opt-in bridge to the deployment's Backboard assistant. It answers
 * honestly at every step:
 *  - no configuration → typed `unavailable`, and the client keeps memories
 *    on-device only;
 *  - Backboard down/rejecting → typed `unavailable` with the real reason;
 *  - success → the memory id Backboard returned.
 *
 * Memory text is never logged and never echoed into telemetry.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addBackboardMemory,
  backboardConfigured,
  listBackboardMemories,
  probeBackboard,
  searchBackboardMemories,
} from "@/lib/server/backboard";
import { getServerConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MemoryPushSchema = z.object({
  action: z.literal("add"),
  record: z.object({
    id: z.string().min(1).max(80),
    userId: z.uuid(),
    kind: z.enum(["expedition", "observation", "preference"]),
    title: z.string().min(1).max(140),
    body: z.string().min(1).max(1200),
    tags: z.array(z.string().min(1).max(40)).max(16).default([]),
    expeditionId: z.uuid().nullable().default(null),
    createdAt: z.string().min(1).max(40),
  }),
});

const MemorySearchSchema = z.object({
  action: z.literal("search"),
  query: z.string().min(1).max(300),
  limit: z.number().int().min(1).max(25).default(5),
});

const MemoryListSchema = z.object({
  action: z.literal("list"),
  limit: z.number().int().min(1).max(100).default(25),
});

const MemoryRequestSchema = z.discriminatedUnion("action", [
  MemoryPushSchema,
  MemorySearchSchema,
  MemoryListSchema,
]);

function unavailable(state: string, reason: string) {
  return NextResponse.json({ kind: "unavailable", state, reason }, { status: 200 });
}

export async function GET(request: Request) {
  const cfg = getServerConfig();
  const url = new URL(request.url);
  const wantsHealth = url.searchParams.get("health") === "1";

  if (wantsHealth) {
    const probe = await probeBackboard();
    return NextResponse.json({ configured: backboardConfigured(), probe });
  }
  return NextResponse.json({
    configured: backboardConfigured(),
    assistantIdPresent: Boolean(cfg.backboard.assistantId),
    note: backboardConfigured()
      ? "POST {action:'add'|'search'|'list'} to use the memory bridge, or use ?health=1 for a live check."
      : "Backboard is not configured. Memories stay on this device.",
  });
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const parsed = MemoryRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid memory request.", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 }
    );
  }

  const input = parsed.data;

  if (input.action === "add") {
    const { record } = input;
    // A compact, self-describing line — no coordinates, no raw notes blobs.
    const content = `[${record.kind}] ${record.title} — ${record.body}`.slice(0, 1500);
    const result = await addBackboardMemory(content, {
      userId: record.userId,
      kind: record.kind,
      localId: record.id,
      createdAt: record.createdAt,
      ...(record.expeditionId ? { expeditionId: record.expeditionId } : {}),
      ...(record.tags.length > 0 ? { tags: record.tags.join(",") } : {}),
    });
    if (!result.ok) return unavailable(result.state, result.reason);
    return NextResponse.json({ kind: "ok", memoryId: result.memoryId });
  }

  if (input.action === "search") {
    const result = await searchBackboardMemories(input.query, input.limit);
    if (!result.ok) return unavailable(result.state, result.reason);
    return NextResponse.json({ kind: "ok", memories: result.memories });
  }

  const result = await listBackboardMemories(input.limit);
  if (!result.ok) return unavailable(result.state, result.reason);
  return NextResponse.json({
    kind: "ok",
    memories: result.memories,
    totalCount: result.totalCount,
  });
}
