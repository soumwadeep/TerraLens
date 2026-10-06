/**
 * Activities (spec §5, §40, §49).
 *
 * The worker owns NO business logic and NO model keys: activities call the
 * web app's /api/field-agent route, which runs the Mastra agent and persists
 * the recap. That keeps one implementation of every honesty rule (availability
 * checks, fallback labeling, storage) and makes the worker purely durable
 * orchestration — retries are Temporal's, answers are the app's.
 */
import { ApplicationFailure } from "@temporalio/activity";
import type { HealthWorkflowResult, RecapWorkflowInput, RecapWorkflowResult } from "./shared";

function appBaseUrl(): string {
  const url = process.env.APP_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim();
  if (!url) {
    throw ApplicationFailure.create({
      message:
        "APP_URL (or RENDER_EXTERNAL_URL) is not set — the worker cannot reach the TerraLens web app.",
      type: "config-missing",
      nonRetryable: true,
    });
  }
  const trimmed = url.replace(/\/+$/, "");
  // Render's fromService gives a bare host ("terralens.onrender.com").
  return /^https?:\/\//u.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export async function runRecapActivity(input: RecapWorkflowInput): Promise<RecapWorkflowResult> {
  const base = appBaseUrl();
  const res = await fetch(`${base}/api/field-agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, origin: "workflow" }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const detail = await res
      .text()
      .then((t) => t.slice(0, 200))
      .catch(() => "");
    // 5xx: the app itself is struggling — retry. 4xx: the request was wrong —
    // retrying cannot fix it.
    throw ApplicationFailure.create({
      message: `The field agent route answered HTTP ${res.status}. ${detail}`,
      type: res.status >= 500 ? "agent-route-5xx" : "agent-route-4xx",
      nonRetryable: res.status < 500,
    });
  }

  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return {
    processed: true,
    engine: body && typeof body.engine === "string" ? body.engine : null,
    stored: body?.stored === true,
    reason: body && typeof body.reason === "string" ? body.reason : null,
  };
}

export async function runHealthCheckActivity(): Promise<HealthWorkflowResult> {
  const base = appBaseUrl();
  const res = await fetch(`${base}/api/field-agent?health=1`, {
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return {
    ok: res.ok && body?.reachable === true,
    httpStatus: res.status,
    detail: body && typeof body.detail === "string" ? body.detail : null,
  };
}
