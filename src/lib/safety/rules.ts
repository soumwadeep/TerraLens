/**
 * Deterministic safety layer (spec §34).
 *
 * Every generated mission passes through these rules before it can reach a
 * user. The Safety Agent (AI) is an ADDITIONAL reviewer, never a replacement:
 * these checks are deterministic, testable, and always run.
 */
import type { ObservationCategory, SafetyLevel, SafetyMetadata } from "@/lib/domain/types";

export interface SafetyScanResult {
  level: SafetyLevel;
  warnings: string[];
  matchedRules: string[];
}

/**
 * Hard-blocked instruction patterns. If a generated mission contains any of
 * these intents it is rejected outright (level: "blocked").
 */
const BLOCKED_PATTERNS: Array<{ rule: string; re: RegExp }> = [
  { rule: "ingest-unknown", re: /\b(eat|taste|ingest|swallow|chew|consume)\b/i },
  {
    rule: "forage-food",
    re: /\b(forage|harvest|pick.{0,20}(eat|food|snack)|collect.{0,20}berries)\b/i,
  },
  {
    rule: "handle-fungus",
    re: /\b(touch|pick|handle|pull up|break off)\b.{0,40}\b(mushroom|fungus|toadstool)\b/i,
  },
  {
    rule: "handle-wildlife",
    re: /\b(catch|trap|grab|handle|pet|feed|touch|hold)\b.{0,40}\b(bird|animal|insect|snake|frog|squirrel|rabbit|deer|fox|bat)\b/i,
  },
  {
    rule: "approach-wildlife",
    re: /\b(approach|chase|follow|get close to|corner)\b.{0,30}\b(animal|deer|fox|snake|bear|boar|coyote)\b/i,
  },
  {
    rule: "trespass",
    re: /\b(trespass|enter.{0,20}(private|restricted|locked|fenced)|jump.{0,20}(fence|gate)|climb over)\b/i,
  },
  {
    rule: "climb-danger",
    re: /\b(climb|stand on|walk on)\b.{0,30}\b(rail|wall|rock face|cliff|roof|fence)\b/i,
  },
  {
    rule: "enter-water",
    re: /\b(swim|wade|enter|jump into)\b.{0,20}\b(water|river|lake|pond|stream|ocean)\b/i,
  },
  {
    rule: "cross-unsafe-road",
    re: /\b(cross|walk along|jog on)\b.{0,20}\b(highway|motorway|freeway|busy road|railway|train track)\b/i,
  },
  { rule: "illegal", re: /\b(poach|steal|vandal|graffiti|damage|destroy|dig up)\b/i },
  { rule: "medicinal-claims", re: /\b(cure|treat|heal|medicine|remedy)\b/i },
  {
    rule: "dangerous-touch",
    re: /\b(touch|brush against|grab)\b.{0,30}\b(poison|venom|stinging nettle|hogweed|thorn bush)\b/i,
  },
];

/** Caution patterns: allowed, but carry a visible warning. */
const CAUTION_PATTERNS: Array<{ rule: string; re: RegExp; warning: string }> = [
  {
    rule: "night",
    re: /\b(at night|after dark|midnight|nocturnal)\b/i,
    warning: "Only explore after dark in safe, familiar, well-lit areas — and tell someone first.",
  },
  {
    rule: "heights",
    re: /\b(high place|vantage|hilltop|viewpoint|overlook)\b/i,
    warning: "Stay behind barriers at viewpoints and keep away from edges.",
  },
  {
    rule: "water-edge",
    re: /\b(puddle|pond edge|riverbank|shore|waterfront|beach)\b/i,
    warning: "Keep a safe distance from the water's edge; banks can be slippery.",
  },
  {
    rule: "weather",
    re: /\b(storm|rain hard|lightning|thunder|extreme heat|heatwave|freezing)\b/i,
    warning: "Check the weather before heading out and turn back if conditions change.",
  },
  {
    rule: "traffic",
    re: /\b(street|roadside|parking lot|traffic)\b/i,
    warning: "Stay on the pavement side and keep attention on traffic, not the screen.",
  },
];

/** Category-specific warnings shown next to every AI analysis (spec §34). */
export const CATEGORY_SAFETY_WARNINGS: Partial<Record<ObservationCategory, string>> = {
  fungus:
    "Do not eat or handle unknown mushrooms based on AI identification. Some deadly species look harmless.",
  plant:
    "Never consume a plant based on TerraLens identification. Some edible-looking plants are toxic.",
  flower: "Never consume a plant based on TerraLens identification — including flowers and petals.",
  bird: "Observe birds from a distance. Do not approach nests, chicks, or injured birds.",
  animal: "Observe wild animals from a safe distance. Never feed, approach, or corner them.",
  insect:
    "Some insects sting or bite. Look, don't touch — and keep a respectful distance from hives and nests.",
};

export function scanTextForSafety(text: string): SafetyScanResult {
  const warnings: string[] = [];
  const matchedRules: string[] = [];
  let level: SafetyLevel = "safe";

  for (const { rule, re } of BLOCKED_PATTERNS) {
    if (re.test(text)) {
      matchedRules.push(rule);
      level = "blocked";
    }
  }
  if (level !== "blocked") {
    for (const { rule, re, warning } of CAUTION_PATTERNS) {
      if (re.test(text)) {
        matchedRules.push(rule);
        warnings.push(warning);
      }
    }
    if (warnings.length > 0) level = "caution";
  } else {
    warnings.push(
      "This instruction was blocked by TerraLens safety rules because it could put you or wildlife at risk."
    );
  }

  return { level, warnings, matchedRules };
}

/** Review a single mission instruction + title. */
export function reviewMissionText(title: string, instruction: string): SafetyMetadata {
  const scan = scanTextForSafety(`${title}\n${instruction}`);
  return {
    level: scan.level,
    warnings: scan.warnings,
    reviewedBy: "rules",
  };
}

/**
 * Merge a deterministic review with an AI safety review.
 * The stricter result always wins — an AI can never downgrade "blocked".
 */
export function mergeSafetyReviews(
  rules: SafetyMetadata,
  ai: SafetyMetadata | null
): SafetyMetadata {
  if (!ai) return rules;
  const order: SafetyLevel[] = ["safe", "caution", "blocked"];
  const stricter = order.indexOf(ai.level) > order.indexOf(rules.level) ? ai.level : rules.level;
  return {
    level: stricter,
    warnings: Array.from(new Set([...rules.warnings, ...ai.warnings])).slice(0, 6),
    reviewedBy: "rules+safety-agent",
  };
}

export function missionSafetyLevel(category: ObservationCategory | null | undefined): {
  level: SafetyLevel;
  warning: string | null;
} {
  if (!category) return { level: "safe", warning: null };
  const warning = CATEGORY_SAFETY_WARNINGS[category] ?? null;
  const level: SafetyLevel =
    category === "fungus" || category === "plant" || category === "flower" || category === "animal"
      ? "caution"
      : "safe";
  return { level, warning };
}

/** Responsible nature principles (spec §67) — shown in the journal + onboarding. */
export const NATURE_PRINCIPLES = [
  "Observe, don't disturb.",
  "Leave plants where they grow.",
  "Give wildlife space — they were here first.",
  "Stay on safe, public paths.",
  "Take memories and responsible photos — not specimens.",
  "Respect private property and other people's quiet.",
] as const;
