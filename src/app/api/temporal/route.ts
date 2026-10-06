/**
 * Temporal workflows API (spec §5, §40, §49).
 *
 * GET  — configuration facts, plus `?health=1` for a live task-queue probe
 *        (worker pollers connected) and `?workflowId=` for a real run status.
 * POST — start a health workflow that actually calls the field agent; the
 *        /lab page uses it to prove the durable path end-to-end.
 *
 * Nothing here is synthesized: unreachable cluster → typed error; unknown
 * workflow → `found: false`; missing config → `configured: false`.
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  describeWorkflow,
  probeTaskQueue,
  startFieldAgentHealthWorkflow,
  TemporalUnavailableError,
  temporalConfigured,
} from "@/lib/server/temporal-client";
import { getServerConfig } from "@/lib/config";
import { nowIso } from "@/lib/utils";

export const dynamic = "force-dynamic";

function unavailableResponse(error: unknown) {
  if (error instanceof TemporalUnavailableError) {
    return NextResponse.json(
      { configured: true, error: "unavailable", detail: error.message },
      { status: 503 }
    );
  }
  return NextResponse.json({ error: "The Temporal request failed unexpectedly." }, { status: 500 });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const cfg = getServerConfig();

  if (!temporalConfigured()) {
    return NextResponse.json({
      configured: false,
      namespace: null,
      taskQueue: null,
      at: nowIso(),
    });
  }

  if (params.get("health") === "1") {
    try {
      const health = await probeTaskQueue();
      return NextResponse.json({ configured: true, ...health, at: nowIso() });
    } catch (error) {
      return unavailableResponse(error);
    }
  }

  const workflowId = params.get("workflowId");
  if (workflowId !== null) {
    try {
      const status = await describeWorkflow(workflowId);
      return NextResponse.json({
        configured: true,
        found: status !== null,
        workflow: status,
        at: nowIso(),
      });
    } catch (error) {
      return unavailableResponse(error);
    }
  }

  return NextResponse.json({
    configured: true,
    namespace: cfg.temporal.namespace,
    taskQueue: cfg.temporal.taskQueue,
    at: nowIso(),
  });
}

export async function POST() {
  if (!temporalConfigured()) {
    return NextResponse.json(
      { configured: false, error: "Temporal is not configured for this deployment." },
      { status: 409 }
    );
  }
  try {
    const started = await startFieldAgentHealthWorkflow();
    return NextResponse.json({ configured: true, started: true, ...started });
  } catch (error) {
    return unavailableResponse(error);
  }
}
