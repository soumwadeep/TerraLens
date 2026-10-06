/**
 * Prediction route (spec §28) — the TabPFN boundary.
 *
 * GET  — configuration facts, or `?health=1` for a live probe of the
 *        prediction service (process up vs trained artifact loaded).
 * POST — {features, horizonDate}; returns a PredictionSchema-shaped record
 *        or a typed `unavailable` envelope. Fewer than 4 numeric features
 *        never leaves this process: that is `insufficient-data` by definition.
 *
 * Probabilities are only ever relayed from the trained model. When the
 * service is missing, honest states are returned — never numbers.
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { predictionConfigured, probePrediction, requestPrediction } from "@/lib/server/prediction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_FEATURES = 4;

const PredictSchema = z.object({
  features: z.record(z.string(), z.union([z.number(), z.string(), z.null()])),
  horizonDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .default(null),
});

function countNumericFeatures(features: Record<string, number | string | null>): number {
  return Object.values(features).filter((v) => typeof v === "number" && Number.isFinite(v)).length;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("health") === "1") {
    const probe = await probePrediction();
    return NextResponse.json({ configured: predictionConfigured(), probe });
  }
  return NextResponse.json({
    configured: predictionConfigured(),
    note: predictionConfigured()
      ? "POST {features, horizonDate} to ask the trained model, or use ?health=1 for a live check."
      : "The prediction service is not configured. The app shows no forecast rather than an invented one.",
  });
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const parsed = PredictSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid prediction request.", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 }
    );
  }

  const { features, horizonDate } = parsed.data;
  const createdAt = new Date().toISOString();
  const base = {
    id: randomUUID(),
    userId: null,
    horizonDate,
    features,
    createdAt,
  };

  if (countNumericFeatures(features) < MIN_FEATURES) {
    return NextResponse.json({
      kind: "ok",
      prediction: {
        ...base,
        status: "insufficient-data",
        source: "insufficient-data",
        outputs: [],
        modelVersion: null,
        message: `A forecast needs at least ${MIN_FEATURES} numeric signals from your field record; there are ${countNumericFeatures(features)} so far.`,
      },
    });
  }

  const result = await requestPrediction(features, horizonDate);
  if (!result.ok) {
    return NextResponse.json({
      kind: "unavailable",
      state: result.state,
      reason: result.reason,
    });
  }

  return NextResponse.json({
    kind: "ok",
    prediction: {
      ...base,
      status: "ok",
      source: "tabpfn-service",
      outputs: result.outputs,
      modelVersion: result.modelVersion,
      message: "Predicted by TabPFN — probabilities come straight from the trained model.",
    },
  });
}
