/**
 * evaluate.ts — measure a SERVED, fine-tuned Tinker checkpoint (spec §28).
 *
 * Hard honesty rules baked into this script:
 *  - No endpoint configured → exit 1 and NO results file. It never guesses.
 *  - Metrics are computed ONLY from responses that parsed as valid
 *    CuriosityAction JSON; the share that parsed is printed and stored in
 *    `notes` ("N of M parsed"). Nothing is extrapolated.
 *  - The held-out eval cases live in scripts/prompts.ts, are authored
 *    separately from the training seed, and this script REFUSES to run if any
 *    of them leaked into `data/train.jsonl`.
 *
 * Run: `TINKER_EVAL_BASE_URL=... TINKER_EVAL_MODEL=... pnpm tinker:evaluate`
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CuriosityActionSchema,
  ModelEvaluationSchema,
  type CuriosityAction,
  type EvaluationMetrics,
  type ModelEvaluation,
} from "@/lib/domain/types";
import { scanTextForSafety } from "@/lib/safety/rules";
import { EVAL_CASES, SYSTEM_PROMPT, buildUserMessage } from "./prompts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRAIN_FILE = path.join(ROOT, "data", "train.jsonl");
const RESULTS_FILE = path.join(ROOT, "results.json");
const REQUEST_TIMEOUT_MS = 90_000;

// ---------------------------------------------------------------------------
// Deterministic scorers — definitions are printed and stored in `notes`
// ---------------------------------------------------------------------------

/** An action counts as "outdoor" when it needs no screen and asks for a physical verb. */
const OUTDOOR_VERB_RE =
  /\b(look|watch|listen|walk|stand|sit|find|compare|count|notice|trace|turn|point|step|hover|breathe|name|describe|observe|study|map|record|photograph|feel|smell|wait|kneel)\b/i;

const STOPWORDS = new Set([
  "this", "that", "with", "then", "them", "they", "from", "your", "what", "when",
  "have", "will", "into", "over", "under", "near", "each", "some", "more", "than",
  "just", "like", "make", "made", "very", "also", "only", "same", "next", "down",
  "back", "away", "here", "there", "where", "which", "once", "twice", "full",
]);

function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}

function stemMatch(a: string, b: string): boolean {
  return a === b || a.startsWith(b) || b.startsWith(a);
}

/** The mission is "relevant" when it shares a content word with the context or the action. */
function missionRelevant(action: CuriosityAction, contextText: string): boolean {
  if (!action.nextMission) return false;
  const pool = contentTokens(`${contextText} ${action.physicalAction}`);
  return contentTokens(action.nextMission).some((token) =>
    pool.some((candidate) => stemMatch(token, candidate))
  );
}

interface CaseResult {
  id: string;
  parseable: boolean;
  action: CuriosityAction | null;
  error: string | null;
  servedModel: string | null;
}

// ---------------------------------------------------------------------------
// Model call (OpenAI-compatible chat completions)
// ---------------------------------------------------------------------------

interface ChatResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
}

async function askModel(
  baseUrl: string,
  apiKey: string | null,
  model: string,
  userMessage: string
): Promise<{ content: string; servedModel: string | null }> {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  const body = (await response.json()) as ChatResponse;
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("response had no choices[0].message.content");
  }
  return { content, servedModel: body.model ?? null };
}

/** Strict JSON first; a single fenced-block strip as fallback. Never more. */
function parseAction(raw: string): { action: CuriosityAction; error: null } | { action: null; error: string } {
  const attempts = [raw.trim()];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) attempts.push(fenced[1].trim());

  for (const attempt of attempts) {
    try {
      const json: unknown = JSON.parse(attempt);
      const parsed = CuriosityActionSchema.safeParse(json);
      if (parsed.success) return { action: parsed.data, error: null };
      return {
        action: null,
        error: `valid JSON but not a CuriosityAction (${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message})`,
      };
    } catch {
      // try the next attempt
    }
  }
  return { action: null, error: `not JSON (starts with: ${JSON.stringify(raw.trim().slice(0, 60))})` };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const baseUrl = process.env.TINKER_EVAL_BASE_URL?.trim();
  const model = process.env.TINKER_EVAL_MODEL?.trim();
  const apiKey = process.env.TINKER_EVAL_API_KEY?.trim() || null;

  if (!baseUrl || !model) {
    console.error("Tinker evaluation — no results will be written.\n");
    console.error("Point these variables at a SERVED, fine-tuned checkpoint:");
    console.error("  TINKER_EVAL_BASE_URL   e.g. https://<your-endpoint>/v1  (OpenAI-compatible)");
    console.error("  TINKER_EVAL_MODEL      e.g. terralens-curiosity-v1");
    console.error("  TINKER_EVAL_API_KEY    only when your endpoint requires one\n");
    console.error("Training happens on Tinker's own platform — see ai/tinker/README.md.");
    console.error("Nothing here answers without a real model; TerraLens never invents metrics.");
    process.exit(1);
  }

  // The dataset must exist so datasetSize is a fact, not a guess.
  let trainText: string;
  try {
    trainText = await fs.readFile(TRAIN_FILE, "utf8");
  } catch {
    console.error("No ai/tinker/data/train.jsonl — run `pnpm tinker:prepare` first.");
    process.exit(1);
  }
  const trainRows = trainText.split("\n").filter((line) => line.trim().length > 0);
  const datasetSize = trainRows.length;

  // Held-out guard: refuse if any eval case leaked into training data.
  const trainUserMessages = new Set<string>();
  for (const row of trainRows) {
    try {
      const parsed = JSON.parse(row) as { messages?: Array<{ role?: string; content?: string }> };
      const user = parsed.messages?.find((m) => m.role === "user");
      if (user?.content) trainUserMessages.add(user.content);
    } catch {
      console.error("train.jsonl contains a line that is not JSON — re-run `pnpm tinker:prepare`.");
      process.exit(1);
    }
  }
  for (const evalCase of EVAL_CASES) {
    if (trainUserMessages.has(buildUserMessage(evalCase))) {
      console.error(
        `Eval case ${evalCase.id} appears in train.jsonl. Held-out cases must never be trained on — refusing to run.`
      );
      process.exit(1);
    }
  }

  console.log(`Tinker evaluation — model "${model}" at ${baseUrl}`);
  console.log(`Dataset: ${datasetSize} rows · eval cases: ${EVAL_CASES.length} (held out, verified)\n`);

  const results: CaseResult[] = [];
  const requestErrors: string[] = [];
  for (const evalCase of EVAL_CASES) {
    const userMessage = buildUserMessage(evalCase);
    try {
      const { content, servedModel } = await askModel(baseUrl, apiKey, model, userMessage);
      const parsed = parseAction(content);
      results.push({
        id: evalCase.id,
        parseable: parsed.action !== null,
        action: parsed.action,
        error: parsed.error,
        servedModel,
      });
      console.log(
        parsed.action
          ? `  ${evalCase.id}  parsed   → ${parsed.action.category} (${parsed.action.physicalAction.length} chars)`
          : `  ${evalCase.id}  UNPARSED → ${parsed.error}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      requestErrors.push(`${evalCase.id}: ${message}`);
      results.push({ id: evalCase.id, parseable: false, action: null, error: message, servedModel: null });
      console.log(`  ${evalCase.id}  REQUEST FAILED → ${message}`);
    }
  }

  const parsed = results.filter(
    (r): r is CaseResult & { action: CuriosityAction } => r.action !== null
  );
  const total = EVAL_CASES.length;
  const servedModel = results.find((r) => r.servedModel !== null)?.servedModel ?? null;

  let metrics: EvaluationMetrics | null = null;
  let status: "completed" | "failed" = "completed";
  let notes: string;

  if (parsed.length === 0) {
    status = "failed";
    const firstError = results.find((r) => r.error !== null)?.error ?? "unknown";
    notes =
      `0 of ${total} responses parsed as valid CuriosityAction JSON — no metrics are possible, and none were invented. ` +
      `First failure: ${firstError.slice(0, 200)}` +
      (requestErrors.length > 0 ? ` · ${requestErrors.length} of ${total} requests failed outright.` : "");
    console.error("\nNo parseable responses — results.json records status:\"failed\" and null metrics.");
  } else {
    metrics = {
      outdoorActionRate: round(
        parsed.filter((r) => r.action.requiresScreen === false && OUTDOOR_VERB_RE.test(r.action.physicalAction))
          .length / parsed.length,
        3
      ),
      screenDependencyRate: round(
        parsed.filter((r) => r.action.requiresScreen === true).length / parsed.length,
        3
      ),
      avgResponseLength: round(
        parsed.reduce((sum, r) => sum + r.action.physicalAction.length, 0) / parsed.length,
        1
      ),
      safetyCompliance: round(
        parsed.filter(
          (r) =>
            scanTextForSafety(
              `${r.action.shortInsight} ${r.action.physicalAction} ${r.action.nextMission ?? ""}`
            ).level !== "blocked"
        ).length / parsed.length,
        3
      ),
      missionRelevance: round(
        parsed.filter((r) => {
          const evalCase = EVAL_CASES.find((c) => c.id === r.id);
          return missionRelevant(r.action, evalCase ? `${evalCase.category} ${evalCase.note}` : "");
        }).length / parsed.length,
        3
      ),
      actionDiversity: round(
        new Set(parsed.map((r) => r.action.category)).size / Math.min(parsed.length, 11),
        3
      ),
    };

    notes = [
      `Metrics computed ONLY from ${parsed.length} of ${total} responses that parsed as valid CuriosityAction JSON`,
      parsed.length < total ? ` (${total - parsed.length} unparseable)` : "",
      requestErrors.length > 0 ? `; ${requestErrors.length} requests failed outright` : "",
      ". Deterministic scorers — outdoorActionRate: share with an outdoor verb and requiresScreen=false; ",
      "screenDependencyRate: share with requiresScreen=true; safetyCompliance: share not blocked by scanTextForSafety; ",
      "missionRelevance: share whose nextMission shares a content word with the observation or action; ",
      "actionDiversity: distinct action categories ÷ parseable responses. ",
      `Served model reported itself as: ${servedModel ?? "unknown"}.`,
    ].join("").slice(0, 1000);
  }

  const evaluation: ModelEvaluation = ModelEvaluationSchema.parse({
    id: `tinker-eval-${new Date().toISOString().slice(0, 10)}`,
    adapterName: "tinker",
    model,
    version: servedModel && servedModel !== model ? servedModel : null,
    dataset: "ai/tinker/data/train.jsonl",
    datasetSize,
    status,
    metrics,
    runAt: new Date().toISOString(),
    notes,
  });

  await fs.writeFile(RESULTS_FILE, JSON.stringify(evaluation, null, 2) + "\n", "utf8");

  if (metrics) {
    console.log("\nMetrics (deterministic, parseable responses only):");
    console.log(`  outdoorActionRate     ${metrics.outdoorActionRate}`);
    console.log(`  screenDependencyRate  ${metrics.screenDependencyRate}`);
    console.log(`  avgResponseLength     ${metrics.avgResponseLength}`);
    console.log(`  safetyCompliance      ${metrics.safetyCompliance}`);
    console.log(`  missionRelevance      ${metrics.missionRelevance}`);
    console.log(`  actionDiversity       ${metrics.actionDiversity}`);
  }
  console.log(`\nWrote ${path.relative(process.cwd(), RESULTS_FILE)} (status: ${status}).`);
  console.log("The /lab/evaluation page reads this file directly — no other pipeline touches it.");
  process.exit(status === "completed" ? 0 : 1);
}

void main();
