/**
 * Field Agent API (spec §5, §24, §34, §49).
 *
 * The only route allowed to run the Mastra recap agent. Callers:
 *  - the expedition recap card (origin "client") — direct run, or queued
 *    through Temporal when this deployment has both Temporal and MongoDB,
 *  - the Temporal worker (origin "workflow") — always a direct run so the
 *    workflow cannot recurse into itself.
 *
 * Everything here is honest by construction: a run that cannot happen is a
 * typed `available: false` with a reason — never a fabricated recap.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { FieldRecapSchema, RecapContextSchema } from "@/lib/ai/recap";
import { mongoConfigured } from "@/lib/server/mongodb";
import {
  saveAgentTrace,
  saveFieldRecap,
  getFieldRecapForExpedition,
} from "@/lib/server/field-records";
import { fieldAgentFacts, probeModelEndpoint, runFieldAgent } from "@/lib/server/field-agent";
import { captureAgentTrace } from "@/lib/telemetry";
import {
  startExpeditionRecapWorkflow,
  TemporalUnavailableError,
  temporalConfigured,
} from "@/lib/server/temporal-client";
import { nowIso } from "@/lib/utils";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET — facts, health, stored recap
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const health = params.get("health");
  const userId = params.get("userId");
  const expeditionId = params.get("expeditionId");
  const facts = fieldAgentFacts();

  if (health === "1") {
    const probe = facts.enabled
      ? await probeModelEndpoint()
      : { reachable: false, httpStatus: null, detail: "The field agent is disabled." };
    return NextResponse.json({ ...probe, at: nowIso() });
  }

  if (userId !== null || expeditionId !== null) {
    if (!z.uuid().safeParse(userId).success || !z.uuid().safeParse(expeditionId).success) {
      return NextResponse.json(
        { error: "userId and expeditionId must both be uuids." },
        { status: 400 }
      );
    }
    try {
      const stored = await getFieldRecapForExpedition(userId as string, expeditionId as string);
      return NextResponse.json({ mongoConfigured: mongoConfigured(), stored, at: nowIso() });
    } catch {
      return NextResponse.json(
        { mongoConfigured: true, stored: null, error: "unavailable", at: nowIso() },
        { status: 503 }
      );
    }
  }

  return NextResponse.json({
    fieldAgent: {
      enabled: facts.enabled,
      model: facts.model,
      endpointConfigured: facts.modelEndpoint !== null,
      timeoutMs: facts.timeoutMs,
    },
    mongo: { configured: mongoConfigured() },
    temporal: { configured: temporalConfigured() },
    at: nowIso(),
  });
}

// ---------------------------------------------------------------------------
// POST — run (or queue) a recap
// ---------------------------------------------------------------------------

const PostBodySchema = z.object({
  userId: z.uuid(),
  expeditionId: z.uuid(),
  context: RecapContextSchema,
  fallback: FieldRecapSchema.nullable().default(null),
  origin: z.enum(["client", "workflow"]).default("client"),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid recap request.", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 }
    );
  }
  const { userId, expeditionId, context, fallback, origin } = parsed.data;

  if (context.expeditionId !== expeditionId) {
    return NextResponse.json(
      { error: "The context packet does not match the expeditionId." },
      { status: 400 }
    );
  }

  // Durable path: only offered when the workflow's output could actually be
  // stored (it is read back from MongoDB) and Temporal is configured.
  if (origin === "client" && temporalConfigured() && mongoConfigured()) {
    try {
      const started = await startExpeditionRecapWorkflow({
        userId,
        expeditionId,
        context,
        fallback,
      });
      return NextResponse.json({
        queued: true,
        workflowId: started.workflowId,
        runId: started.runId,
      });
    } catch (error) {
      if (!(error instanceof TemporalUnavailableError)) throw error;
      // Temporal answered with a failure — fall through to the direct run.
    }
  }

  const result = await runFieldAgent(context);

  if (result.kind === "ok") {
    let stored = false;
    try {
      stored =
        (await saveFieldRecap({
          userId,
          expeditionId,
          recap: result.recap,
          engine: "mastra",
          model: result.model,
        })) !== null;
    } catch {
      /* storage is best-effort — the recap itself is still returned */
    }
    try {
      await saveAgentTrace(result.trace);
    } catch {
      /* tracing must never break the recap path */
    }
    try {
      await captureAgentTrace(result.trace);
    } catch {
      /* telemetry is best-effort */
    }
    return NextResponse.json({
      queued: false,
      available: true,
      engine: "mastra",
      recap: result.recap,
      model: result.model,
      latencyMs: result.latencyMs,
      stored,
    });
  }

  if (result.trace) {
    try {
      await saveAgentTrace(result.trace);
    } catch {
      /* best-effort */
    }
    try {
      await captureAgentTrace(result.trace);
    } catch {
      /* telemetry is best-effort */
    }
  }

  let stored = false;
  if (fallback) {
    try {
      stored =
        (await saveFieldRecap({
          userId,
          expeditionId,
          recap: fallback,
          engine: "deterministic",
          model: null,
        })) !== null;
    } catch {
      /* best-effort */
    }
  }

  return NextResponse.json({
    queued: false,
    available: false,
    reason: result.reason,
    latencyMs: result.latencyMs,
    stored,
  });
}
