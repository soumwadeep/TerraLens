/**
 * Server analysis route (spec §26, §33, §49).
 *
 * A thin, honest proxy to the deployment's OpenAI-compatible Gemma endpoint:
 *  - The API key stays server-side; it is never echoed in any response.
 *  - Image bytes are NOT accepted here — photos stay on the device unless the
 *    user explicitly asks the server path for a text-only analysis.
 *  - Unconfigured → typed `unavailable` JSON with `noRuntime: true`; the
 *    client degrades to on-device or to nothing, never to a fake answer.
 */
import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/config";
import { captureServerError } from "@/lib/telemetry";
import {
  AnalysisRequestSchema,
  buildAnalysisMessages,
  insightHasSubstance,
  parseModelInsight,
  SERVER_ADAPTER_ID,
  type AdapterProbe,
} from "@/lib/ai/adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROBE_TIMEOUT_MS = 6000;

function safeOrigin(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "the configured endpoint";
  }
}

function unavailable(reason: string, latencyMs: number | null, noRuntime: boolean) {
  return NextResponse.json(
    { kind: "unavailable", reason, latencyMs, noRuntime, via: SERVER_ADAPTER_ID },
    { status: 200 }
  );
}

async function runProbe(): Promise<AdapterProbe> {
  const cfg = getServerConfig();
  const at = new Date().toISOString();
  if (!cfg.gemma.baseUrl) {
    return {
      adapterId: SERVER_ADAPTER_ID,
      at,
      state: "not-configured",
      detail: "No server AI endpoint is configured for this deployment.",
      models: [],
      latencyMs: null,
    };
  }
  const url = `${cfg.gemma.baseUrl}/models`;
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: cfg.gemma.apiKey ? { Authorization: `Bearer ${cfg.gemma.apiKey}` } : undefined,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store",
    });
    const latencyMs = Date.now() - startedAt;
    if (!res.ok) {
      return {
        adapterId: SERVER_ADAPTER_ID,
        at,
        state: "unreachable",
        detail: `Server endpoint answered HTTP ${res.status} at ${safeOrigin(url)}.`,
        models: [],
        latencyMs,
      };
    }
    const body = (await res.json()) as { data?: Array<{ id?: unknown }> };
    const models = (body.data ?? [])
      .map((m) => (typeof m.id === "string" ? m.id : null))
      .filter((m): m is string => m !== null)
      .slice(0, 50);
    const wanted = cfg.gemma.model;
    const hasModel = models.some((m) => m === wanted || m.split(":")[0] === wanted.split(":")[0]);
    return {
      adapterId: SERVER_ADAPTER_ID,
      at,
      state: hasModel ? "ready" : "model-missing",
      detail: hasModel
        ? `Server endpoint at ${safeOrigin(url)} is serving ${wanted}.`
        : `Server endpoint at ${safeOrigin(url)} is up, but ${wanted} is not loaded.`,
      models,
      latencyMs,
    };
  } catch {
    return {
      adapterId: SERVER_ADAPTER_ID,
      at,
      state: "unreachable",
      detail: `No server AI endpoint answered at ${safeOrigin(url)}.`,
      models: [],
      latencyMs: null,
    };
  }
}

export async function GET(request: Request) {
  const cfg = getServerConfig();
  const url = new URL(request.url);
  const wantsHealth = url.searchParams.get("health") === "1";

  if (wantsHealth) {
    const probe = await runProbe();
    return NextResponse.json({ configured: cfg.gemma.baseUrl !== null, probe });
  }
  if (!cfg.gemma.baseUrl) {
    return NextResponse.json({
      configured: false,
      note: "Server analysis is off. All analysis stays on-device.",
    });
  }
  return NextResponse.json({
    configured: true,
    model: cfg.gemma.model,
    note: "POST an observation analysis request, or use ?health=1 for a live check.",
  });
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  // Image bytes are deliberately outside this route's contract — rejected
  // unconditionally, whether or not a server AI is configured.
  if (
    json !== null &&
    typeof json === "object" &&
    ("imageDataUrl" in json || "image" in (json as Record<string, unknown>))
  ) {
    return NextResponse.json(
      { error: "Image bytes are not accepted by the server route — photos stay on-device." },
      { status: 422 }
    );
  }

  const cfg = getServerConfig();
  if (!cfg.gemma.baseUrl) {
    return unavailable("Server analysis is not configured for this deployment.", null, true);
  }

  const parsed = AnalysisRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid analysis request.", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 }
    );
  }

  const messages = buildAnalysisMessages(parsed.data);
  const startedAt = Date.now();

  let res: Response;
  try {
    res = await fetch(`${cfg.gemma.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.gemma.apiKey ? { Authorization: `Bearer ${cfg.gemma.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: cfg.gemma.model,
        messages,
        temperature: 0.2,
        max_tokens: 800,
        stream: false,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(cfg.gemma.timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    captureServerError("analyze.server-fetch", error);
    return unavailable(
      `No server AI endpoint answered at ${safeOrigin(cfg.gemma.baseUrl)}.`,
      null,
      true
    );
  }

  const latencyMs = Date.now() - startedAt;
  if (!res.ok) {
    captureServerError("analyze.server-http", new Error(`HTTP ${res.status}`), {
      status: res.status,
    });
    return unavailable(`Server AI responded HTTP ${res.status}.`, latencyMs, false);
  }

  let content: string;
  try {
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const raw = body.choices?.[0]?.message?.content;
    if (typeof raw !== "string" || raw.trim().length === 0) {
      return unavailable("Server AI returned an empty response.", latencyMs, false);
    }
    content = raw;
  } catch {
    return unavailable("Server AI returned unparseable transport JSON.", latencyMs, false);
  }

  const insight = parseModelInsight(content);
  if (!insight) {
    return unavailable(
      "Server AI answered, but the response did not match the required shape.",
      latencyMs,
      false
    );
  }
  if (!insightHasSubstance(insight)) {
    return unavailable("Server AI returned an empty analysis.", latencyMs, false);
  }

  return NextResponse.json({
    kind: "ok",
    insight,
    model: cfg.gemma.model,
    latencyMs,
    via: SERVER_ADAPTER_ID,
  });
}
