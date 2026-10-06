/**
 * Badge / achievement engine (spec §17).
 *
 * Fully deterministic: badges are derived from stored entities (expeditions,
 * missions, observations, scores) — never awarded by an LLM, never awarded by
 * the network. Demo-origin rows are ignored so the judge/demo mode can never
 * inflate a real collection.
 */
import type { Expedition, GrassScore, Mission, Observation } from "@/lib/domain/types";
import { computeStreakDays } from "@/lib/scoring/grass-score";

export interface BadgeContext {
  expeditions: Expedition[];
  missions: Mission[];
  observations: Observation[];
  scores: GrassScore[];
  todayKey: string;
}

export interface BadgeStatus {
  id: string;
  label: string;
  emoji: string;
  /** How to earn it — shown on locked badges. */
  description: string;
  earned: boolean;
  progress: number;
  target: number;
}

interface BadgeDefinition {
  id: string;
  label: string;
  emoji: string;
  description: string;
  measure: (ctx: LiveContext) => number;
  target: number;
}

interface LiveContext {
  expeditions: Expedition[];
  completedExpeditions: Expedition[];
  missions: Mission[];
  observations: Observation[];
  scores: GrassScore[];
  streakDays: number;
}

function liveOnly<T extends { origin: "live" | "demo" }>(rows: T[]): T[] {
  return rows.filter((r) => r.origin === "live");
}

function startHour(expedition: Expedition): number | null {
  if (!expedition.startedAt) return null;
  const d = new Date(expedition.startedAt);
  return Number.isNaN(d.getTime()) ? null : d.getHours();
}

function distinctDateKeys(expeditions: Expedition[]): number {
  return new Set(expeditions.map((e) => e.dateKey)).size;
}

function bestExpeditionScore(scores: GrassScore[]): number {
  return scores
    .filter((s) => s.scope === "expedition")
    .reduce((best, s) => Math.max(best, s.score), 0);
}

const BADGES: BadgeDefinition[] = [
  {
    id: "first-steps",
    label: "First Steps",
    emoji: "👣",
    description: "Complete your first expedition.",
    measure: (c) => c.completedExpeditions.length,
    target: 1,
  },
  {
    id: "pathfinder",
    label: "Pathfinder",
    emoji: "🧭",
    description: "Complete 5 expeditions.",
    measure: (c) => c.completedExpeditions.length,
    target: 5,
  },
  {
    id: "daily-habit",
    label: "Daily Habit",
    emoji: "📅",
    description: "Explore on 3 different days.",
    measure: (c) => distinctDateKeys(c.completedExpeditions),
    target: 3,
  },
  {
    id: "ten-observations",
    label: "Noticer",
    emoji: "🔎",
    description: "Record 10 observations.",
    measure: (c) => c.observations.length,
    target: 10,
  },
  {
    id: "collector-50",
    label: "Field Collector",
    emoji: "🗂️",
    description: "Record 50 observations.",
    measure: (c) => c.observations.length,
    target: 50,
  },
  {
    id: "five-lenses",
    label: "Five Lenses",
    emoji: "🖐️",
    description: "See 5 different kinds of thing in one expedition.",
    measure: (c) =>
      c.completedExpeditions.reduce((best, e) => {
        const cats = new Set(
          c.observations.filter((o) => o.expeditionId === e.id).map((o) => o.category)
        );
        return Math.max(best, cats.size);
      }, 0),
    target: 5,
  },
  {
    id: "bird-ears",
    label: "Bird Ears",
    emoji: "🐦",
    description: "Observe birds 3 times.",
    measure: (c) => c.observations.filter((o) => o.category === "bird").length,
    target: 3,
  },
  {
    id: "plant-friend",
    label: "Plant Friend",
    emoji: "🌿",
    description: "Observe 5 plants, flowers, or trees.",
    measure: (c) =>
      c.observations.filter((o) => ["plant", "flower", "tree"].includes(o.category)).length,
    target: 5,
  },
  {
    id: "sound-hunter",
    label: "Sound Hunter",
    emoji: "🎧",
    description: "Record 3 sounds.",
    measure: (c) => c.observations.filter((o) => o.type === "audio").length,
    target: 3,
  },
  {
    id: "shutterbug",
    label: "Shutterbug",
    emoji: "📷",
    description: "Capture 5 photos.",
    measure: (c) => c.observations.filter((o) => o.type === "photo").length,
    target: 5,
  },
  {
    id: "deep-writer",
    label: "Field Writer",
    emoji: "✍️",
    description: "Write 3 detailed notes (80+ characters).",
    measure: (c) => c.observations.filter((o) => o.type === "note" && o.note.length >= 80).length,
    target: 3,
  },
  {
    id: "mission-master",
    label: "Mission Master",
    emoji: "🎯",
    description: "Complete 10 missions.",
    measure: (c) => c.missions.filter((m) => m.status === "COMPLETED").length,
    target: 10,
  },
  {
    id: "pocket-champion",
    label: "Pocket Champion",
    emoji: "🪄",
    description: "Spend 20+ minutes with the phone away in one expedition.",
    measure: (c) =>
      c.completedExpeditions.reduce((best, e) => Math.max(best, e.stats.pocketSeconds), 0),
    target: 1200,
  },
  {
    id: "score-300",
    label: "Trailblazer's Proof",
    emoji: "🥾",
    description: "Earn a Grass Score of 300+.",
    measure: (c) => bestExpeditionScore(c.scores),
    target: 300,
  },
  {
    id: "score-500",
    label: "Deep Green",
    emoji: "🌲",
    description: "Earn a Grass Score of 500+.",
    measure: (c) => bestExpeditionScore(c.scores),
    target: 500,
  },
  {
    id: "streak-3",
    label: "Three in a Row",
    emoji: "🔥",
    description: "Explore 3 days in a row.",
    measure: (c) => c.streakDays,
    target: 3,
  },
  {
    id: "streak-7",
    label: "Seven Days Wild",
    emoji: "🗓️",
    description: "Explore 7 days in a row.",
    measure: (c) => c.streakDays,
    target: 7,
  },
  {
    id: "early-bird",
    label: "Early Bird",
    emoji: "🌅",
    description: "Start an expedition before 7 AM.",
    measure: (c) =>
      c.completedExpeditions.some((e) => {
        const h = startHour(e);
        return h !== null && h < 7;
      })
        ? 1
        : 0,
    target: 1,
  },
  {
    id: "night-owl",
    label: "Night Owl",
    emoji: "🌙",
    description: "Start an expedition at or after 9 PM.",
    measure: (c) =>
      c.completedExpeditions.some((e) => {
        const h = startHour(e);
        return h !== null && h >= 21;
      })
        ? 1
        : 0,
    target: 1,
  },
];

export function evaluateBadges(ctx: BadgeContext): BadgeStatus[] {
  const expeditions = liveOnly(ctx.expeditions);
  const scores = liveOnly(ctx.scores);
  const dateKeysWithToday = scores.map((s) => s.dateKey).concat(ctx.todayKey);
  const live: LiveContext = {
    expeditions,
    completedExpeditions: expeditions.filter((e) => e.status === "COMPLETED"),
    missions: liveOnly(ctx.missions),
    observations: liveOnly(ctx.observations),
    scores,
    streakDays: computeStreakDays(Array.from(new Set(dateKeysWithToday)), ctx.todayKey),
  };
  return BADGES.map((b) => {
    const raw = b.measure(live);
    return {
      id: b.id,
      label: b.label,
      emoji: b.emoji,
      description: b.description,
      earned: raw >= b.target,
      progress: Math.min(raw, b.target),
      target: b.target,
    };
  });
}

export function earnedBadgeCount(statuses: BadgeStatus[]): number {
  return statuses.filter((b) => b.earned).length;
}

/** Newest badges first — used for compact summaries. */
export function earnedBadges(statuses: BadgeStatus[]): BadgeStatus[] {
  return statuses.filter((b) => b.earned);
}
