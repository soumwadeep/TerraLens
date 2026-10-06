/**
 * Curiosity Engine — rules path (spec §8).
 *
 * Turns an observation into a physical-world action instead of an answer.
 * The output schema is identical to the AI path (CuriosityActionSchema) so the
 * Gemma adapter and the Curiosity Adapter can plug in later without any
 * architectural change — and the offline experience is always available.
 *
 * Hard rule: `requiresScreen` defaults to false. A candidate action may only
 * set it true when the action genuinely cannot be done without the phone
 * (photographing, recording audio) — and those candidates are chosen rarely.
 */
import type {
  AccessibilityPreferences,
  CuriosityAction,
  CuriosityActionCategory,
  Environment,
  Expedition,
  ExpeditionMode,
  MissionType,
  Observation,
  ObservationCategory,
  SafetyLevel,
} from "@/lib/domain/types";
import { CuriosityActionSchema } from "@/lib/domain/types";
import { missionSafetyLevel, scanTextForSafety } from "@/lib/safety/rules";

export interface CuriosityInput {
  observation: Pick<Observation, "id" | "category" | "note">;
  /** The expedition is the goal context: mode, environment, title. */
  expedition: Pick<Expedition, "mode" | "environment" | "title">;
  /** Categories observed earlier in this expedition (for variety). */
  recentCategories: ObservationCategory[];
  /** Mission types already completed (avoid repeating the same kind of ask). */
  completedMissionTypes: MissionType[];
  accessibility: AccessibilityPreferences;
  /** Remaining expedition time, when known — actions are clamped to fit. */
  minutesRemaining?: number;
}

interface Candidate {
  category: CuriosityActionCategory;
  insight: string;
  action: string;
  mission: string;
  minutes: number;
  requiresScreen?: boolean;
}

type CandidateTable = Partial<Record<ObservationCategory, Candidate[]>>;

/**
 * Authored candidate actions. Insights state only what the observation itself
 * supports ("many plants show…") — they never claim an identification.
 */
const CANDIDATES: CandidateTable = {
  plant: [
    {
      category: "COMPARE",
      insight: "Many plants colour their newest leaves differently while they harden.",
      action:
        "Find the newest leaves at the tip of the same plant — are they the same colour as the old ones?",
      mission: "Compare the newest and oldest leaves on one plant.",
      minutes: 3,
    },
    {
      category: "LOOK",
      insight: "Leaf edges hide clues: smooth, toothed and lobed edges follow different rules.",
      action:
        "Trace one leaf's edge with your eyes — smooth, toothed, or lobed? Then find its opposite nearby.",
      mission: "Find two leaves with opposite edge types.",
      minutes: 4,
    },
  ],
  flower: [
    {
      category: "NOTICE",
      insight: "Flowers are working: petals advertise, and something is being paid in nectar.",
      action: "Watch this flower for one full minute without touching it. Who visits? How often?",
      mission: "Count flower visits for one minute.",
      minutes: 3,
    },
    {
      category: "COMPARE",
      insight: "Two flowers of the same kind can face different directions for real reasons.",
      action:
        "Find another flower of the same kind. Which way does each face — sun, path, or open space?",
      mission: "Compare the direction two flowers face.",
      minutes: 3,
    },
  ],
  tree: [
    {
      category: "LOOK",
      insight: "Bark changes with age: young trunks are often smoother than the old ones nearby.",
      action:
        "Compare the bark on a young trunk and an old trunk of the same kind. Close your eyes, then look again — what did you miss?",
      mission: "Compare young and old bark on the same kind of tree.",
      minutes: 4,
    },
  ],
  bird: [
    {
      category: "LISTEN",
      insight: "Birds repeat themselves — calls are patterns, not noise.",
      action:
        "Close your eyes. Listen for one call and wait for it to repeat. Learn the rhythm before you look for the bird.",
      mission: "Learn one bird's call pattern by ear.",
      minutes: 3,
    },
  ],
  insect: [
    {
      category: "NOTICE",
      insight:
        "Insects on a plant are usually doing one of four things: eating, resting, hunting, or passing through.",
      action:
        "Watch your insect without moving and decide which of the four it is. Don't touch it.",
      mission: "Work out what the insect is doing — from a distance.",
      minutes: 3,
    },
  ],
  animal: [
    {
      category: "NOTICE",
      insight: "Wild animals notice you long before you notice them — their behaviour is the clue.",
      action:
        "Step back quietly. Watch what the animal does next: freeze, flee, or carry on? That tells you how close is close enough.",
      mission: "Observe an animal's reaction from a respectful distance.",
      minutes: 3,
    },
  ],
  fungus: [
    {
      category: "LOOK",
      insight:
        "Fungi are the visible tip of networks under your feet. Some harmless species mimic deadly ones.",
      action:
        "From a safe distance, note where it grows: on wood, soil, or moss? Leave everything exactly as it is — an app's guess is never a reason to disturb it.",
      mission: "Note exactly where a fungus is growing — wood, soil, or moss.",
      minutes: 3,
    },
  ],
  rock: [
    {
      category: "COMPARE",
      insight: "Wet rock shows colour that dry rock hides.",
      action:
        "Find the same kind of rock in shade and in sun. Hover your hand near each — which is warmer?",
      mission: "Compare a sunlit and a shaded rock.",
      minutes: 3,
    },
  ],
  landscape: [
    {
      category: "WALK",
      insight: "Every landscape is layered: foreground, middle, skyline.",
      action: "Walk twenty steps and stop. Name one thing in each layer — near, middle, far.",
      mission: "Name the three layers of this landscape.",
      minutes: 4,
    },
    {
      category: "NOTICE",
      insight: "Sounds reveal landscape too: traffic, water, wind and birds each have a direction.",
      action: "Turn slowly through a full circle. Point at the loudest and the quietest direction.",
      mission: "Map the loudest and quietest direction around you.",
      minutes: 3,
    },
  ],
  texture: [
    {
      category: "LOOK",
      insight: "Texture is light: the same surface changes with the angle you view it from.",
      action: "Look at this surface from three angles. Which angle reveals the most detail?",
      mission: "Find the angle that reveals the most texture.",
      minutes: 2,
    },
  ],
  weather: [
    {
      category: "NOTICE",
      insight: "Weather is legible: wind, clouds and light each tell you what happens next.",
      action:
        "Stand still and find which way the wind blows — use a leaf, grass, or your cheek. Then look at the clouds.",
      mission: "Read the wind direction without any device.",
      minutes: 3,
    },
  ],
  sound: [
    {
      category: "LISTEN",
      insight: "Every place has a sound signature — most people never hear it twice.",
      action:
        "Move ten steps toward the quietest direction and listen for ten seconds. Did any sound disappear? Did a new one appear?",
      mission: "Find where one sound disappears.",
      minutes: 4,
    },
    {
      category: "WAIT",
      insight:
        "Waiting is a technique: animals often resume activity about a minute after you stop moving.",
      action:
        "Sit or stand still for ninety seconds. Don't move. Notice what starts again around you.",
      mission: "Stay still for 90 seconds and note what returns.",
      minutes: 3,
    },
  ],
  other: [
    {
      category: "SEARCH",
      insight: "The best discoveries are usually three of the same thing, not one of a kind.",
      action:
        "Find two more things that share one property with what you observed. Same colour? Same shape? Same sound?",
      mission: "Find two more things sharing one property with your observation.",
      minutes: 4,
    },
  ],
  unknown: [
    {
      category: "NOTICE",
      insight: "Not knowing is the start, not the failure — observation beats identification.",
      action:
        "Look again for thirty seconds and find one detail you can describe precisely without naming anything.",
      mission: "Describe one detail precisely — no names allowed.",
      minutes: 3,
    },
  ],
};

/** Mode flavour: which action kinds suit the expedition the user chose. */
const MODE_BIAS: Record<ExpeditionMode, CuriosityActionCategory[]> = {
  nature: ["LOOK", "NOTICE", "COMPARE"],
  birding: ["LISTEN", "WAIT", "NOTICE"],
  photography: ["LOOK", "NOTICE", "COMPARE"],
  mindful: ["LISTEN", "WAIT", "REFLECT"],
  science: ["COMPARE", "NOTICE", "LOOK"],
  family: ["SEARCH", "COMPARE", "LOOK"],
  fitness: ["WALK", "SEARCH", "NOTICE"],
  surprise: ["SEARCH", "NOTICE", "LOOK"],
};

const MOTION_LIGHT: CuriosityActionCategory[] = [
  "LOOK",
  "NOTICE",
  "COMPARE",
  "LISTEN",
  "REFLECT",
  "WAIT",
];

const SAFETY_ORDER: SafetyLevel[] = ["safe", "caution", "blocked"];

function strictest(a: SafetyLevel, b: SafetyLevel): SafetyLevel {
  return SAFETY_ORDER.indexOf(b) > SAFETY_ORDER.indexOf(a) ? b : a;
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Pick a candidate deterministically:
 *  1. accessibility.reducedMotion restricts the pool to stationary actions,
 *  2. the user's expedition mode biases toward suitable action kinds,
 *  3. the observation id rotates the choice so consecutive observations vary,
 *  4. action kinds already asked this expedition are pushed down.
 */
export function pickCuriosityCandidate(
  candidates: Candidate[],
  input: CuriosityInput,
  usedCategories: CuriosityActionCategory[] = []
): Candidate {
  let pool = candidates;
  if (input.accessibility.reducedMotion) {
    const stationary = candidates.filter((c) => MOTION_LIGHT.includes(c.category));
    if (stationary.length > 0) pool = stationary;
  }

  const bias = MODE_BIAS[input.expedition.mode] ?? [];
  const biased = pool.filter((c) => bias.includes(c.category) && c.requiresScreen !== true);
  if (biased.length > 0) pool = biased;

  const fresh = pool.filter((c) => !usedCategories.includes(c.category));
  if (fresh.length > 0) pool = fresh;

  return pool[hashString(input.observation.id) % pool.length];
}

/** Action-category history derivable from mission types completed so far. */
export function usedCategoriesFromMissionTypes(types: MissionType[]): CuriosityActionCategory[] {
  const map: Partial<Record<MissionType, CuriosityActionCategory>> = {
    FIND: "SEARCH",
    LISTEN: "LISTEN",
    COMPARE: "COMPARE",
    WALK: "WALK",
    OBSERVE: "NOTICE",
    PHOTOGRAPH: "PHOTOGRAPH",
    RECORD_AUDIO: "RECORD",
    REFLECT: "REFLECT",
    COUNT: "NOTICE",
    NOTICE_CHANGE: "NOTICE",
    FOLLOW_CLUE: "SEARCH",
  };
  return Array.from(
    new Set(types.map((t) => map[t]).filter((c): c is CuriosityActionCategory => Boolean(c)))
  );
}

export function generateCuriosityAction(input: CuriosityInput): CuriosityAction {
  const table = CANDIDATES[input.observation.category] ?? CANDIDATES.unknown ?? [];
  // Authored copy is safe by construction, but the deterministic scan is the
  // gate (same pattern as mission selection): a candidate that trips a hard
  // blocker is never eligible, and the always-safe "unknown" pool covers a
  // fully-blocked table.
  const safeTable = table.filter(
    (c) => scanTextForSafety(`${c.insight}\n${c.action}`).level !== "blocked"
  );
  const candidate = pickCuriosityCandidate(
    safeTable.length > 0 ? safeTable : (CANDIDATES.unknown ?? []),
    input,
    usedCategoriesFromMissionTypes(input.completedMissionTypes)
  );

  // Fit the action into the remaining time when we know it.
  const minutes =
    input.minutesRemaining !== undefined && input.minutesRemaining > 0
      ? Math.max(1, Math.min(candidate.minutes, Math.round(input.minutesRemaining)))
      : candidate.minutes;

  // Authored copy still passes through the deterministic safety layer, and the
  // final level is the strictest of the copy scan and the observation category.
  const scan = scanTextForSafety(`${candidate.insight}\n${candidate.action}`);
  const categorySafety = missionSafetyLevel(input.observation.category);
  const safetyLevel = strictest(scan.level, categorySafety.level);

  const action: CuriosityAction = {
    shortInsight: candidate.insight,
    physicalAction: candidate.action,
    nextMission: candidate.mission,
    estimatedMinutes: minutes,
    requiresScreen: candidate.requiresScreen === true,
    safetyLevel,
    category: candidate.category,
    generatedBy: "rules",
  };
  return CuriosityActionSchema.parse(action);
}

/** One-line environment hint used in prompts and pocket screen copy. */
export function environmentHint(environment: Environment): string {
  const hints: Record<Environment, string> = {
    park: "You're in a park — edges, lawns and old trees are all different habitats.",
    garden: "You're in a garden — look for what the gardener didn't plant.",
    forest: "You're among trees — look up as much as you look down.",
    neighbourhood:
      "You're in a neighbourhood — street trees and walls host more life than they look.",
    campus: "You're on a campus — planted and wild life mix in odd borders.",
    countryside: "You're in open country — distance and sky are part of the observation.",
    unknown: "Wherever you are, the nearest patch of green has a story.",
  };
  return hints[environment];
}
