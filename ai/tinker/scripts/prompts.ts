/**
 * Shared prompts for the Tinker workspace (spec §28).
 *
 * The system prompt defines the TerraLens voice the tuned model should learn:
 * one physical-world action, strict JSON, never an identification. It is used
 * by BOTH `prepare-dataset.ts` (to format training rows) and `evaluate.ts`
 * (to question the served model) — so training and evaluation speak the same
 * language. If you change it, re-run `pnpm tinker:prepare` and re-evaluate.
 */
import type { ExpeditionMode, ObservationCategory } from "@/lib/domain/types";

export const SYSTEM_PROMPT = `You are the Curiosity Adapter inside TerraLens, an offline-first nature companion. Someone outdoors has just recorded an observation. Your job is to hand them ONE physical-world action that gets their eyes off the phone.

Reply with a single JSON object and nothing else — no markdown fences, no prose before or after. Use exactly these keys:
{
  "shortInsight": "one or two sentences of fact the observation itself supports. Never claim a species identification.",
  "physicalAction": "an instruction they can do right now, standing where they are, without the screen.",
  "nextMission": "one sentence they could tick off, or null if the action is complete in itself.",
  "estimatedMinutes": 2,
  "requiresScreen": false,
  "safetyLevel": "safe",
  "category": "LOOK",
  "generatedBy": "curiosity-adapter"
}

Rules:
- requiresScreen is false unless the action genuinely cannot be done without the phone (recording audio, taking one photo). Prefer false always.
- category is one of: LOOK, LISTEN, WALK, COMPARE, SEARCH, WAIT, NOTICE, SMELL_SAFE, PHOTOGRAPH, RECORD, REFLECT.
- safetyLevel is "caution" for observations about plants, flowers, fungi and animals, "safe" otherwise.
- Never instruct anyone to touch, pick, taste, or ingest any organism, and never to approach or interact with wildlife.
- Prefer looking, listening, waiting, comparing, counting and walking. Discover, don't identify: describe what to notice, never name a species.`;

export interface ExampleContext {
  category: ObservationCategory;
  note: string;
  mode: ExpeditionMode;
  environment: string;
}

/** The user turn — identical shape in training rows and evaluation calls. */
export function buildUserMessage(context: ExampleContext): string {
  return [
    `Observation: ${context.category}`,
    `Note: "${context.note}"`,
    `Expedition mode: ${context.mode}`,
    `Environment: ${context.environment}`,
  ].join("\n");
}

/**
 * Held-out evaluation cases. Authored separately from the training seed and
 * checked against `train.jsonl` at evaluation time — if any case leaks into
 * the training data, `evaluate.ts` refuses to run. These are never used as
 * training rows.
 */
export const EVAL_CASES: Array<ExampleContext & { id: string }> = [
  {
    id: "eval-01",
    category: "plant",
    note: "moss growing thick on the north side of a stone wall",
    mode: "nature",
    environment: "park",
  },
  {
    id: "eval-02",
    category: "flower",
    note: "a clover patch where some heads are white and some are pink",
    mode: "science",
    environment: "garden",
  },
  {
    id: "eval-03",
    category: "tree",
    note: "an old oak with ivy holding the whole trunk",
    mode: "mindful",
    environment: "forest",
  },
  {
    id: "eval-04",
    category: "bird",
    note: "swifts high overhead near dusk, too fast to follow for long",
    mode: "birding",
    environment: "neighbourhood",
  },
  {
    id: "eval-05",
    category: "insect",
    note: "bees working through a lavender bush in the late sun",
    mode: "mindful",
    environment: "garden",
  },
  {
    id: "eval-06",
    category: "animal",
    note: "a heron standing still in the shallows, watching the current",
    mode: "photography",
    environment: "countryside",
  },
  {
    id: "eval-07",
    category: "fungus",
    note: "orange bracket fungus growing in tiers on a fallen branch",
    mode: "science",
    environment: "forest",
  },
  {
    id: "eval-08",
    category: "rock",
    note: "chalk stones arranged in a rough circle near the path",
    mode: "fitness",
    environment: "countryside",
  },
  {
    id: "eval-09",
    category: "landscape",
    note: "a broad field sloping down toward a line of trees",
    mode: "family",
    environment: "countryside",
  },
  {
    id: "eval-10",
    category: "sound",
    note: "wind moving through dry grass, almost no other sound",
    mode: "mindful",
    environment: "countryside",
  },
  {
    id: "eval-11",
    category: "texture",
    note: "freshly cut log with the end-grain rings still bright",
    mode: "photography",
    environment: "forest",
  },
  {
    id: "eval-12",
    category: "weather",
    note: "low cloud moving fast above the rooftops, rain not arrived yet",
    mode: "nature",
    environment: "neighbourhood",
  },
];
