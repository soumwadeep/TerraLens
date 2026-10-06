/**
 * Field Agent recap contract (spec §24, §34, §49) — shared by client and server.
 *
 * The recap is the "welcome back" note shown on a completed expedition. Rules:
 *  - The context packet is text-only and deliberately narrow: stats, mission
 *    titles, observation categories — never photos, never observation notes,
 *    never raw location. (The user's own wrap-up story is included only when
 *    the client decides it may leave the device; see the recap card.)
 *  - The model output is untrusted text: parsed, schema-validated, and only
 *    then shown.
 *  - When no model runtime answers, the deterministic recap is NOT a fake AI
 *    answer: it is computed from the same real numbers and is labeled as such.
 */
import { z } from "zod";
import {
  EnvironmentSchema,
  ExpoModeSchema,
  GrassRankSchema,
  IsoDateTime,
  MissionStatusSchema,
  MissionTypeSchema,
  ObservationCategorySchema,
} from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// Model output contract (untrusted; validated field by field)
// ---------------------------------------------------------------------------

export const FieldRecapSchema = z.object({
  headline: z.string().min(1).max(140),
  recap: z.string().min(1).max(1200),
  highlights: z.array(z.string().min(1).max(160)).max(4).catch([]),
  nextSuggestion: z.string().max(400).nullable().catch(null),
  encouragement: z.string().max(240).nullable().catch(null),
});
export type FieldRecap = z.infer<typeof FieldRecapSchema>;

export const RecapEngineSchema = z.enum(["mastra", "deterministic"]);
export type RecapEngine = z.infer<typeof RecapEngineSchema>;

export const StoredFieldRecapSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  expeditionId: z.uuid(),
  recap: FieldRecapSchema,
  engine: RecapEngineSchema,
  model: z.string().nullable().default(null),
  createdAt: IsoDateTime,
});
export type StoredFieldRecap = z.infer<typeof StoredFieldRecapSchema>;

// ---------------------------------------------------------------------------
// Context packet (client → server; text-only by construction)
// ---------------------------------------------------------------------------

export const RecapContextSchema = z.object({
  expeditionId: z.uuid(),
  title: z.string().min(1).max(120),
  mode: ExpoModeSchema,
  environment: EnvironmentSchema,
  durationMinutes: z.number().int().min(1).max(480),
  stats: z.object({
    outdoorSeconds: z.number().min(0),
    pocketSeconds: z.number().min(0),
    screenActiveSeconds: z.number().min(0),
    distanceMeters: z.number().min(0).nullable().default(null),
    interruptions: z.number().int().min(0).default(0),
  }),
  missions: z
    .array(
      z.object({
        type: MissionTypeSchema,
        title: z.string().max(140),
        status: MissionStatusSchema,
      })
    )
    .max(20)
    .default([]),
  observations: z
    .array(
      z.object({
        category: ObservationCategorySchema,
        commonName: z.string().max(120).nullable().default(null),
        confidence: z.number().min(0).max(1).default(0),
        tags: z.array(z.string().max(60)).max(30).default([]),
      })
    )
    .max(30)
    .default([]),
  score: z
    .object({
      score: z.number().min(0).max(1000),
      rank: GrassRankSchema,
    })
    .nullable()
    .default(null),
  /** The user's own wrap-up words — included only when privacy allows. */
  story: z.string().max(2000).nullable().default(null),
});
export type RecapContext = z.infer<typeof RecapContextSchema>;

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

export const RECAP_SYSTEM_PROMPT = [
  "You are the TerraLens Field Agent, writing a short welcome-back recap for an amateur nature explorer.",
  "You are NOT a certified identification authority and this is NOT a report — it is a warm, honest summary of what the numbers and the user's own story say happened.",
  "Hard rules:",
  "- Use only the facts in the context. Never invent species names, locations, weather, or events.",
  "- The goal of every sentence is to send the person outside again: celebrate time away from the screen, not time in the app.",
  "- Never suggest eating, tasting, touching, handling, collecting, or picking any plant, fungus, or animal. No medical claims.",
  "- Do not mention being an AI or a model.",
  "- Be specific to THIS expedition; a recap that could apply to any walk is a failed recap.",
  "Return exactly one JSON object, no markdown fences, matching this shape:",
  '{"headline":"<=100 chars, concrete, no exclamation spam",',
  '"recap":"2-4 sentences <=600 chars, grounded only in the context",',
  '"highlights":["at most 4 short factual moments <=120 chars each"],',
  '"nextSuggestion":"one physical-world suggestion for next time, <=200 chars, or null",',
  '"encouragement":"one plain honest sentence <=160 chars, or null"}',
].join("\n");

export function buildRecapUserPrompt(context: RecapContext): string {
  const h = Math.round(context.stats.outdoorSeconds / 60);
  const pocket = Math.round(context.stats.pocketSeconds / 60);
  const screen = Math.round(context.stats.screenActiveSeconds / 60);
  const completed = context.missions.filter((m) => m.status === "COMPLETED").length;
  const skipped = context.missions.filter((m) => m.status === "SKIPPED").length;
  const categories = Array.from(new Set(context.observations.map((o) => o.category)));

  const lines = [
    "Expedition context (all times in minutes):",
    `- Title: "${context.title}"`,
    `- Mode: ${context.mode}; environment: ${context.environment}; planned duration: ${context.durationMinutes} min`,
    `- Actually outside: ${h} min; pocket time (phone away): ${pocket} min; screen-active time: ${screen} min; app switches: ${context.stats.interruptions}`,
    context.stats.distanceMeters !== null
      ? `- Distance walked: ${Math.round(context.stats.distanceMeters)} m`
      : "- Distance walked: not measured (no location permission) — do not guess it",
    `- Missions: ${completed} completed, ${skipped} skipped, of ${context.missions.length} on the board`,
    ...context.missions.slice(0, 10).map((m) => `  · [${m.status}] ${m.title}`),
    `- Observations: ${context.observations.length}; categories seen: ${
      categories.length > 0 ? categories.join(", ") : "(none recorded)"
    }`,
    ...context.observations
      .slice(0, 8)
      .map((o) =>
        o.commonName
          ? `  · ${o.category} — "${o.commonName}" (confidence ${Math.round(o.confidence * 100)}%)${
              o.tags.length > 0 ? ` [${o.tags.slice(0, 5).join(", ")}]` : ""
            }`
          : `  · ${o.category}${o.tags.length > 0 ? ` [${o.tags.slice(0, 5).join(", ")}]` : ""}`
      ),
    context.score
      ? `- Grass Score: ${context.score.score}/1000 (rank: ${context.score.rank})`
      : "- Grass Score: not computed for this expedition",
    context.story
      ? `- In the user's own words: "${context.story.slice(0, 1200)}"`
      : "- The user did not write a story this time.",
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Deterministic recap — computed, never invented
// ---------------------------------------------------------------------------

function minutes(seconds: number): number {
  return Math.round(seconds / 60);
}

/**
 * The honest fallback. Everything here is derived arithmetically from the
 * context packet, so it is safe to render without any model; the UI labels it
 * as a deterministic summary, not as an AI write-up.
 */
export function deterministicRecap(context: RecapContext): FieldRecap {
  const h = minutes(context.stats.outdoorSeconds);
  const pocket = minutes(context.stats.pocketSeconds);
  const completed = context.missions.filter((m) => m.status === "COMPLETED").length;
  const categories = Array.from(new Set(context.observations.map((o) => o.category))).filter(
    (c) => c !== "unknown"
  );

  const sentences: string[] = [];
  sentences.push(
    h > 0
      ? `You were outside for about ${h} minute${h === 1 ? "" : "s"}${pocket > 0 ? `, ${pocket} of them with the phone pocketed` : ""}.`
      : "This expedition's clock shows almost no time outside — the next one starts whenever you do."
  );
  if (context.missions.length > 0) {
    sentences.push(
      completed > 0
        ? `You completed ${completed} of ${context.missions.length} missions.`
        : `None of the ${context.missions.length} missions got checked off — the board will be there next time.`
    );
  }
  if (context.observations.length > 0) {
    const count = context.observations.length;
    const across =
      categories.length > 0
        ? ` across ${categories.length} ${categories.length === 1 ? "category" : "categories"}`
        : "";
    sentences.push(`You captured ${count} observation${count === 1 ? "" : "s"}${across}.`);
  }

  const highlights: string[] = [];
  if (pocket > 0) highlights.push(`${pocket} min with the phone away`);
  if (context.stats.distanceMeters !== null) {
    highlights.push(`${Math.round(context.stats.distanceMeters)} m walked`);
  }
  if (categories.length > 0) highlights.push(`Noticed: ${categories.slice(0, 4).join(", ")}`);
  if (context.score)
    highlights.push(`Grass Score ${context.score.score}/1000 (${context.score.rank})`);

  return FieldRecapSchema.parse({
    headline:
      h > 0
        ? `${h} min outside${completed > 0 ? `, ${completed} mission${completed === 1 ? "" : "s"} done` : ""}`
        : "A short step outside still counts",
    recap: sentences.join(" ").slice(0, 1200),
    highlights: highlights.slice(0, 4),
    nextSuggestion: null,
    encouragement: null,
  });
}
