/**
 * Shared human labels for domain enums. One source of truth so the Today,
 * Journal, expedition and pocket surfaces never drift apart.
 */
import type {
  Environment,
  ExpeditionMode,
  Interest,
  MissionType,
  ObservationCategory,
} from "@/lib/domain/types";

export const MODE_META: Record<ExpeditionMode, { label: string; emoji: string; blurb: string }> = {
  nature: { label: "Living World", emoji: "🌿", blurb: "Plants, animals, whatever is out there." },
  birding: { label: "Birding", emoji: "🦜", blurb: "Calls, silhouettes, and patience." },
  photography: { label: "Photography", emoji: "📷", blurb: "Look first, frame second." },
  mindful: { label: "Mindful", emoji: "🧘", blurb: "Slow down; the details do the rest." },
  science: { label: "Field Science", emoji: "🔬", blurb: "Observe, compare, note what changed." },
  family: { label: "Family", emoji: "👨‍👩‍👧", blurb: "Missions everyone can do together." },
  fitness: { label: "Fitness", emoji: "🏃", blurb: "Distance and fresh air, gently gamified." },
  surprise: { label: "Surprise Me", emoji: "🎲", blurb: "You don't pick. The day does." },
};

export const ENVIRONMENT_META: Record<Environment, { label: string; emoji: string; hint: string }> =
  {
    park: { label: "Park", emoji: "🌳", hint: "Lawns, edges, old trees." },
    garden: { label: "Garden", emoji: "🌻", hint: "Yours or a shared one." },
    forest: { label: "Forest", emoji: "🌲", hint: "Look up as much as down." },
    neighbourhood: { label: "Neighbourhood", emoji: "🏘️", hint: "Street trees and walls." },
    campus: { label: "Campus", emoji: "🎓", hint: "Planted and wild in one place." },
    countryside: { label: "Countryside", emoji: "🌾", hint: "Distance and sky count." },
    unknown: { label: "Not sure yet", emoji: "🧭", hint: "We'll keep missions general." },
  };

export const CATEGORY_META: Record<ObservationCategory, { label: string; emoji: string }> = {
  plant: { label: "Plant", emoji: "🌿" },
  flower: { label: "Flower", emoji: "🌸" },
  tree: { label: "Tree", emoji: "🌳" },
  bird: { label: "Bird", emoji: "🐦" },
  insect: { label: "Insect", emoji: "🐝" },
  animal: { label: "Animal", emoji: "🦊" },
  fungus: { label: "Fungus", emoji: "🍄" },
  rock: { label: "Rock", emoji: "🪨" },
  landscape: { label: "Landscape", emoji: "🏞️" },
  sound: { label: "Sound", emoji: "🎧" },
  texture: { label: "Texture", emoji: "🧶" },
  weather: { label: "Weather", emoji: "🌦️" },
  other: { label: "Other", emoji: "✨" },
  unknown: { label: "Not sure", emoji: "❔" },
};

/** Categories offered when tagging a capture — "unknown" stays available. */
export const CAPTURE_CATEGORIES: ObservationCategory[] = [
  "plant",
  "flower",
  "tree",
  "bird",
  "insect",
  "animal",
  "fungus",
  "rock",
  "landscape",
  "texture",
  "weather",
  "sound",
  "other",
  "unknown",
];

export const INTEREST_META: Record<Interest, { label: string; emoji: string }> = {
  plants: { label: "Plants", emoji: "🌿" },
  birds: { label: "Birds", emoji: "🐦" },
  photography: { label: "Photography", emoji: "📷" },
  walking: { label: "Walking", emoji: "🥾" },
  science: { label: "Science", emoji: "🔬" },
  sounds: { label: "Sounds", emoji: "🎧" },
  mindfulness: { label: "Mindfulness", emoji: "🧘" },
  everything: { label: "Everything", emoji: "🌈" },
};

export const MISSION_TYPE_META: Record<MissionType, { label: string; emoji: string }> = {
  FIND: { label: "Find", emoji: "🔍" },
  LISTEN: { label: "Listen", emoji: "👂" },
  COMPARE: { label: "Compare", emoji: "⚖️" },
  WALK: { label: "Walk", emoji: "🚶" },
  OBSERVE: { label: "Observe", emoji: "👀" },
  PHOTOGRAPH: { label: "Photograph", emoji: "📷" },
  RECORD_AUDIO: { label: "Record", emoji: "🎙️" },
  REFLECT: { label: "Reflect", emoji: "💭" },
  COUNT: { label: "Count", emoji: "🔢" },
  NOTICE_CHANGE: { label: "Notice", emoji: "🍃" },
  FOLLOW_CLUE: { label: "Follow a clue", emoji: "🐾" },
};

/** Deterministic expedition title from the setup choices. */
export function suggestExpeditionTitle(
  mode: ExpeditionMode,
  environment: Environment,
  at: Date = new Date()
): string {
  const h = at.getHours();
  const timeOfDay =
    h < 5 ? "Night" : h < 12 ? "Morning" : h < 17 ? "Afternoon" : h < 21 ? "Evening" : "Night";
  const verb: Record<ExpeditionMode, string> = {
    nature: "wander",
    birding: "birdwatch",
    photography: "photo walk",
    mindful: "slow walk",
    science: "field study",
    family: "family outing",
    fitness: "brisk walk",
    surprise: "mystery walk",
  };
  const place =
    environment === "unknown"
      ? "outdoors"
      : `in the ${ENVIRONMENT_META[environment].label.toLowerCase()}`;
  return `${timeOfDay} ${verb[mode]} ${place}`;
}
