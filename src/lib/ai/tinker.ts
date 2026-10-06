/**
 * Tinker workspace reader (spec §28) — server-only.
 *
 * Reads ONLY what actually exists on disk:
 *  - `ai/tinker/results.json` written by `pnpm tinker:evaluate` (real model
 *    outputs, deterministic scorers). Absent → status "not-run" with null
 *    metrics. Present but invalid → status "failed" with the parse problem.
 *  - dataset row counts from the workspace files, so /lab/evaluation shows
 *    facts, never guesses.
 *
 * This module never runs training or evaluation and never fabricates a run.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { ModelEvaluationSchema, type ModelEvaluation } from "@/lib/domain/types";

const WORKSPACE = path.join(process.cwd(), "ai", "tinker");
const RESULTS_FILE = path.join(WORKSPACE, "results.json");
const TRAIN_FILE = path.join(WORKSPACE, "data", "train.jsonl");
const SEED_FILE = path.join(WORKSPACE, "data", "seed-curiosity.jsonl");
const EXPORT_FILE = path.join(WORKSPACE, "data", "observations-export.json");

export interface TinkerDatasetStats {
  /** null = file missing or unreadable. */
  seedRows: number | null;
  trainRows: number | null;
  exportPresent: boolean;
}

export interface TinkerStatus {
  /** The workspace ships with the repo; false only in stripped deployments. */
  workspacePresent: boolean;
  dataset: TinkerDatasetStats;
  evaluation: ModelEvaluation;
}

async function countJsonlRows(file: string): Promise<number | null> {
  try {
    const text = await fs.readFile(file, "utf8");
    return text.split("\n").filter((line) => line.trim().length > 0).length;
  } catch {
    return null;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export async function getTinkerDatasetStats(): Promise<TinkerDatasetStats> {
  const [seedRows, trainRows, exportPresent] = await Promise.all([
    countJsonlRows(SEED_FILE),
    countJsonlRows(TRAIN_FILE),
    exists(EXPORT_FILE),
  ]);
  return { seedRows, trainRows, exportPresent };
}

function notRunEvaluation(notes: string, datasetSize: number): ModelEvaluation {
  return ModelEvaluationSchema.parse({
    id: "tinker-eval-pending",
    adapterName: "tinker",
    model: "not-configured",
    version: null,
    dataset: "ai/tinker/data/train.jsonl",
    datasetSize,
    status: "not-run",
    metrics: null,
    runAt: null,
    notes,
  });
}

/** The stored evaluation, or an honest "not-run"/"failed" record. */
export async function getTinkerEvaluation(): Promise<ModelEvaluation> {
  const stats = await getTinkerDatasetStats();

  let raw: string;
  try {
    raw = await fs.readFile(RESULTS_FILE, "utf8");
  } catch {
    return notRunEvaluation(
      "No evaluation has been run. Prepare the dataset (`pnpm tinker:prepare`), fine-tune on Tinker's platform, then run `pnpm tinker:evaluate` against the served checkpoint — results appear here.",
      stats.trainRows ?? 0
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return ModelEvaluationSchema.parse({
      ...notRunEvaluation("placeholder", stats.trainRows ?? 0),
      id: "tinker-eval-corrupt",
      status: "failed",
      notes:
        "ai/tinker/results.json exists but is not valid JSON. Re-run `pnpm tinker:evaluate` to regenerate it from a real model run.",
    });
  }

  const parsed = ModelEvaluationSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return ModelEvaluationSchema.parse({
      ...notRunEvaluation("placeholder", stats.trainRows ?? 0),
      id: "tinker-eval-invalid",
      status: "failed",
      notes: `ai/tinker/results.json does not match the evaluation schema (${
        issue ? `${issue.path.join(".")}: ${issue.message}` : "unknown issue"
      }). Re-run \`pnpm tinker:evaluate\`.`,
    });
  }
  return parsed.data;
}

export async function getTinkerStatus(): Promise<TinkerStatus> {
  const [dataset, evaluation, workspacePresent] = await Promise.all([
    getTinkerDatasetStats(),
    getTinkerEvaluation(),
    exists(WORKSPACE),
  ]);
  return { workspacePresent, dataset, evaluation };
}
