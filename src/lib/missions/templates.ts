/**
 * Mission template library (authored project copy — spec §11, §87).
 *
 * These are hand-written, physically-actionable prompts. Every template is
 * written to be safe by construction (and still passes through the
 * deterministic safety layer at generation time). Missions are phrased to
 * get the user AWAY from the screen: short while outdoors, no jargon.
 */
import type {
  Environment,
  ExpeditionMode,
  Interest,
  MissionType,
  ObservationCategory,
} from "@/lib/domain/types";

export interface MissionTemplate {
  id: string;
  type: MissionType;
  title: string;
  instruction: string;
  whyItMatters: string;
  estimatedMinutes: number;
  modes: ExpeditionMode[] | "all";
  environments: Environment[] | "all";
  interests: Interest[];
  offlineCapable: boolean;
  /** Follow-up affinity: after observing this category, this template fits. */
  reactsTo?: ObservationCategory[];
  /** Short text for the pocket screen — defaults to `instruction`. */
  pocketHint?: string;
}

export const MISSION_TEMPLATES: MissionTemplate[] = [
  // ---------------------------------------------------------------- FIND ----
  {
    id: "find-leaf-shapes",
    type: "FIND",
    title: "Find three leaf shapes",
    instruction:
      "Find three leaves with clearly different shapes — one long, one round, one jagged, or any three that are obviously not alike. Look at the whole plant, not just the ground. Come back when you've compared them.",
    whyItMatters:
      "Leaf shape is the fastest way to recognise plant families without any app at all.",
    estimatedMinutes: 6,
    modes: "all",
    environments: "all",
    interests: ["plants", "science", "everything"],
    offlineCapable: true,
    reactsTo: ["plant", "flower", "tree"],
    pocketHint: "Three different leaf shapes. Compare edges and tips.",
  },
  {
    id: "find-small-world",
    type: "FIND",
    title: "Find a world smaller than your thumb",
    instruction:
      "Kneel or crouch somewhere green and find something smaller than your thumb doing something interesting — a seed, a bud, a tiny insect, moss. Get close without touching. Watch it for a full minute.",
    whyItMatters: "Most of the living world happens below knee height. It rewards slowing down.",
    estimatedMinutes: 5,
    modes: ["nature", "science", "mindful", "surprise"],
    environments: "all",
    interests: ["plants", "science", "mindfulness", "everything"],
    offlineCapable: true,
    pocketHint: "Something smaller than your thumb, doing something interesting.",
  },
  {
    id: "find-colour-uncommon",
    type: "FIND",
    title: "Find the least common colour around you",
    instruction:
      "Scan your surroundings and find the colour that appears least. It might be a red berry, blue flower, orange lichen. Don't photograph the first one you see — keep looking for a better example.",
    whyItMatters: "Forcing your eyes to search by colour makes the landscape suddenly detailed.",
    estimatedMinutes: 4,
    modes: "all",
    environments: "all",
    interests: ["photography", "plants", "everything"],
    offlineCapable: true,
    pocketHint: "Hunt for the rarest colour nearby.",
  },
  {
    id: "find-same-plant-twice",
    type: "FIND",
    title: "Find the same plant in two different places",
    instruction:
      "Pick any plant near you, learn its shape, then walk on and find the same kind again somewhere else. Are the two in the same condition — same age leaves, same growth stage?",
    whyItMatters:
      "Spotting a species twice is the moment identification becomes personal knowledge.",
    estimatedMinutes: 8,
    modes: ["nature", "science", "surprise"],
    environments: "all",
    interests: ["plants", "science", "everything"],
    offlineCapable: true,
    reactsTo: ["plant", "flower", "tree"],
    pocketHint: "The same plant, somewhere else. Compare them.",
  },

  // -------------------------------------------------------------- LISTEN ----
  {
    id: "listen-two-sounds",
    type: "LISTEN",
    title: "Record two distinct natural sounds",
    instruction:
      "Stand still and listen for thirty seconds. Identify two sounds that are clearly different — a bird call, wind in leaves, water, an insect hum. Move closer to each one (or just listen longer) before you record.",
    whyItMatters:
      "Ears catch what eyes miss; sound tells you what's alive nearby even when hidden.",
    estimatedMinutes: 5,
    modes: "all",
    environments: "all",
    interests: ["sounds", "birds", "mindfulness", "everything"],
    offlineCapable: true,
    pocketHint: "Two different natural sounds. Find them, listen long.",
  },
  {
    id: "listen-quietest-spot",
    type: "LISTEN",
    title: "Find the quietest spot within earshot",
    instruction:
      "Walk slowly and find the quietest place nearby — away from roads, people, machines. Stand in it for one minute. What is the quietest sound you can still hear?",
    whyItMatters: "Quiet is a location, not a mood. Finding it trains your attention.",
    estimatedMinutes: 7,
    modes: ["mindful", "science", "nature", "surprise"],
    environments: "all",
    interests: ["mindfulness", "sounds", "everything"],
    offlineCapable: true,
    pocketHint: "Find the quietest spot. One minute. Listen deeper.",
  },
  {
    id: "listen-bird-rhythm",
    type: "LISTEN",
    title: "Decode a bird call pattern",
    instruction:
      "Listen for a bird that repeats. Count the notes — does it always do three, or four? Does it answer another bird? Wait for at least five repetitions before you decide.",
    whyItMatters:
      "Bird calls have grammar. Rhythm is the first thing you can hear without knowing species.",
    estimatedMinutes: 6,
    modes: ["birding", "nature", "science", "mindful"],
    environments: "all",
    interests: ["birds", "sounds", "science", "everything"],
    offlineCapable: true,
    reactsTo: ["bird", "sound"],
    pocketHint: "One repeating bird call. Count its notes.",
  },

  // ------------------------------------------------------------- COMPARE ----
  {
    id: "compare-new-old-leaves",
    type: "COMPARE",
    title: "Compare new and old leaves on the same plant",
    instruction:
      "Choose a shrub or tree. Find the newest leaves near branch tips and the oldest leaves lower down. Are they the same colour? Same texture? Same size? Look at both before you decide anything.",
    whyItMatters:
      "New growth tells you what season the plant thinks it is — and how it protects itself.",
    estimatedMinutes: 5,
    modes: "all",
    environments: "all",
    interests: ["plants", "science", "everything"],
    offlineCapable: true,
    reactsTo: ["plant", "tree"],
    pocketHint: "Newest leaves vs oldest leaves. Same plant. Compare.",
  },
  {
    id: "compare-bark-textures",
    type: "COMPARE",
    title: "Compare the bark of three trees",
    instruction:
      "Find three different trees. Compare the bark with your eyes only — rough, smooth, grooved, peeling. Look for insects or lichen living on each. Which tree looks oldest?",
    whyItMatters: "Bark is a tree's signature — readable even in winter when leaves are gone.",
    estimatedMinutes: 6,
    modes: ["nature", "science", "family"],
    environments: "all",
    interests: ["plants", "science", "everything"],
    offlineCapable: true,
    reactsTo: ["tree"],
    pocketHint: "Three barks. Which tree looks oldest?",
  },
  {
    id: "compare-shade-light",
    type: "COMPARE",
    title: "Compare the same patch in sun and shade",
    instruction:
      "Find a spot where the ground spans sun and shadow, like under a tree edge. Compare what grows in each: colour, plant types, insect activity. Don't photograph yet — just observe both patches for a minute each.",
    whyItMatters: "A single metre of transition zone can be two different habitats.",
    estimatedMinutes: 5,
    modes: ["nature", "science", "photography"],
    environments: "all",
    interests: ["plants", "science", "photography", "everything"],
    offlineCapable: true,
    pocketHint: "One patch, two worlds: sunlight vs shadow.",
  },

  // ---------------------------------------------------------------- WALK ----
  {
    id: "walk-slow-minutes",
    type: "WALK",
    title: "Walk slower than feels natural",
    instruction:
      "For the next few minutes, walk at half your normal speed. Take the path you'd usually skip. Stop whenever something makes you curious — no rush, no destination.",
    whyItMatters: "Speed is the main reason we miss things we later call 'surprising'.",
    estimatedMinutes: 8,
    modes: ["mindful", "nature", "family", "fitness"],
    environments: "all",
    interests: ["walking", "mindfulness", "everything"],
    offlineCapable: true,
    pocketHint: "Half-speed walking. Stop for anything curious.",
  },
  {
    id: "walk-new-path",
    type: "WALK",
    title: "Take one path you've never taken",
    instruction:
      "Wherever you are, find one legal, safe way you have never walked before — the other side of the street, an extra loop, a different trail. Walk it fully before judging it.",
    whyItMatters: "Novelty is exploration's fuel; new routes reset your attention.",
    estimatedMinutes: 10,
    modes: "all",
    environments: "all",
    interests: ["walking", "everything"],
    offlineCapable: true,
    pocketHint: "One path you've never taken. Walk it fully.",
  },
  {
    id: "walk-treeline",
    type: "WALK",
    title: "Follow a line the landscape draws",
    instruction:
      "Find a natural line — a treeline, a hedge, a stream, a path edge — and follow it for a few minutes. Note where it bends and why. What made that line exist?",
    whyItMatters:
      "Landscape lines are history: old walls, drainage, wind. Reading them is real fieldwork.",
    estimatedMinutes: 8,
    modes: ["nature", "science", "mindful"],
    environments: ["forest", "countryside", "park", "campus"],
    interests: ["walking", "science", "everything"],
    offlineCapable: true,
    pocketHint: "Follow a treeline, hedge, or edge. Where does it bend?",
  },

  // -------------------------------------------------------------- OBSERVE ----
  {
    id: "observe-pollinator",
    type: "OBSERVE",
    title: "Watch a flower's visitors",
    instruction:
      "Find a flowering plant and stand back. Watch for two minutes without moving. Who visits — bees, flies, butterflies, beetles? Does the visitor land on the same side every time?",
    whyItMatters: "Pollination is the busiest story in nature and it plays in every park.",
    estimatedMinutes: 4,
    modes: "all",
    environments: "all",
    interests: ["plants", "science", "photography", "everything"],
    offlineCapable: true,
    reactsTo: ["flower", "insect"],
    pocketHint: "A flower and its visitors. Two minutes. Stand still.",
  },
  {
    id: "observe-notice-change",
    type: "NOTICE_CHANGE",
    title: "Find evidence of the season",
    instruction:
      "Find one clear sign of the season — turning leaves, new shoots, fallen seed heads, bare branches, buds. Get the detail, not the panorama. Look at several candidates before choosing.",
    whyItMatters: "Seasons are slow news. Noticing change makes it visible.",
    estimatedMinutes: 5,
    modes: "all",
    environments: "all",
    interests: ["plants", "photography", "science", "everything"],
    offlineCapable: true,
    pocketHint: "One strong sign of the season. Get the detail.",
  },
  {
    id: "observe-insect-plant",
    type: "OBSERVE",
    title: "Find an insect interacting with a plant",
    instruction:
      "Look at one plant for one full minute before moving to the next. Find an insect using it — resting, eating, hiding, walking. Watch what it does and which part of the plant it chose.",
    whyItMatters: "Insects and plants are in constant negotiation; every leaf is a tiny stage.",
    estimatedMinutes: 6,
    modes: ["nature", "science", "photography"],
    environments: "all",
    interests: ["science", "photography", "everything"],
    offlineCapable: true,
    reactsTo: ["insect", "plant"],
    pocketHint: "An insect using a plant. Watch what it does.",
  },

  // ------------------------------------------------------------ PHOTOGRAPH --
  {
    id: "photo-texture-pattern",
    type: "PHOTOGRAPH",
    title: "Photograph a natural texture you can almost feel",
    instruction:
      "Find a texture — bark, moss, ripples, stones — and fill the frame with it. No background, no context. Look at three textures before choosing the best one.",
    whyItMatters: "Textures are the fingerprints of natural materials.",
    estimatedMinutes: 5,
    modes: ["photography", "nature", "family"],
    environments: "all",
    interests: ["photography", "everything"],
    offlineCapable: true,
    pocketHint: "Fill the frame with one texture. Look at three first.",
  },
  {
    id: "photo-window-light",
    type: "PHOTOGRAPH",
    title: "Photograph something backlit by the sky",
    instruction:
      "Find a leaf, grass head, or seed pod against the sky and shoot it from below. Move until the light passes through it. Don't crush or pick anything — find it naturally in position.",
    whyItMatters:
      "Backlight reveals structure — veins, hairs, translucency — invisible from above.",
    estimatedMinutes: 6,
    modes: ["photography", "nature"],
    environments: "all",
    interests: ["photography", "plants", "everything"],
    offlineCapable: true,
    pocketHint: "Shoot from below. Light through the leaf.",
  },

  // ----------------------------------------------------------- RECORD_AUDIO -
  {
    id: "record-place-soundscape",
    type: "RECORD_AUDIO",
    title: "Record the sound of this place",
    instruction:
      "Record 10–15 seconds of wherever you're standing. Then walk twenty steps and record again. The difference between the two recordings is the sound of distance.",
    whyItMatters: "A soundscape is place-identity. Comparing two spots makes space audible.",
    estimatedMinutes: 5,
    modes: ["nature", "mindful", "science", "surprise"],
    environments: "all",
    interests: ["sounds", "mindfulness", "everything"],
    offlineCapable: true,
    pocketHint: "Record here. Walk 20 steps. Record there. Compare.",
  },
  {
    id: "record-wind",
    type: "RECORD_AUDIO",
    title: "Find what the wind is touching",
    instruction:
      "Close your eyes for ten seconds and locate the wind. Then look at exactly what it's touching — grass, leaves, a wire, water. Listen for what it sounds like on each.",
    whyItMatters:
      "Wind is only audible through what it moves — hearing it is hearing the landscape.",
    estimatedMinutes: 4,
    modes: ["mindful", "nature", "surprise"],
    environments: "all",
    interests: ["sounds", "mindfulness", "everything"],
    offlineCapable: true,
    pocketHint: "Ten seconds with eyes closed. Where is the wind?",
  },

  // -------------------------------------------------------------- REFLECT ---
  {
    id: "reflect-found-question",
    type: "REFLECT",
    title: "Choose the one question this walk gave you",
    instruction:
      "Think back over the last few minutes. Pick the single thing you're most curious about — the one you'd ask a naturalist if they appeared right now. Save that question before you search anything.",
    whyItMatters: "A good question you own beats ten answers you don't.",
    estimatedMinutes: 3,
    modes: "all",
    environments: "all",
    interests: ["everything"],
    offlineCapable: true,
    pocketHint: "What's your one question from this walk?",
  },
  {
    id: "reflect-first-notice",
    type: "REFLECT",
    title: "Name something you've never noticed before",
    instruction:
      "Of everything you saw in the last ten minutes, pick the thing you've genuinely never noticed before — even if it's small. Describe it from memory without looking at a photo.",
    whyItMatters: "Memory-based recall deepens observation more than archiving does.",
    estimatedMinutes: 3,
    modes: "all",
    environments: "all",
    interests: ["everything", "mindfulness"],
    offlineCapable: true,
    pocketHint: "Something you've never noticed before. Describe it from memory.",
  },

  // ---------------------------------------------------------------- COUNT ---
  {
    id: "count-categories",
    type: "COUNT",
    title: "Count how many kinds of green there are",
    instruction:
      "Find as many distinct shades of green as you can — five minimum. Look at grasses, leaves, moss, distant trees. Don't photograph them; just count and remember the most unusual one.",
    whyItMatters: "'Green' is hundreds of colours; counting them is free colour training.",
    estimatedMinutes: 4,
    modes: "all",
    environments: "all",
    interests: ["plants", "photography", "everything"],
    offlineCapable: true,
    pocketHint: "Count five+ different greens.",
  },
  {
    id: "count-bird-survey",
    type: "COUNT",
    title: "Run a five-minute bird survey",
    instruction:
      "Stand in one spot for five minutes. Count every bird you see OR hear — the same bird twice doesn't count twice. Note the most common and the most surprising.",
    whyItMatters: "Five-minute counts are exactly how real bird surveys work.",
    estimatedMinutes: 5,
    modes: ["birding", "science", "nature"],
    environments: "all",
    interests: ["birds", "science", "everything"],
    offlineCapable: true,
    reactsTo: ["bird"],
    pocketHint: "Five minutes. Count every bird seen or heard.",
  },

  // ---------------------------------------------------------- FOLLOW_CLUE ---
  {
    id: "clue-follow-sound",
    type: "FOLLOW_CLUE",
    title: "Follow a sound until you find its source",
    instruction:
      "Pick a sound that isn't obvious — something hidden. Move toward it carefully, in stages. Keep going until you can point at the source. If you lose it, stand still and listen again.",
    whyItMatters: "Following sound is tracking by ear — the oldest skill on this list.",
    estimatedMinutes: 7,
    modes: ["nature", "birding", "mindful", "surprise"],
    environments: "all",
    interests: ["sounds", "birds", "everything"],
    offlineCapable: true,
    pocketHint: "Follow the hidden sound to its source.",
  },
  {
    id: "clue-nature-detective",
    type: "FOLLOW_CLUE",
    title: "Find who was here before you (without touching anything)",
    instruction:
      "Look for traces: a feather, a chewed leaf, footprints in mud, a seed opened by teeth, droppings, a spider web with breakfast in it. Choose one trace and work out what happened — but leave everything exactly where it is.",
    whyItMatters: "Reading traces turns a walk into a mystery with a real answer.",
    estimatedMinutes: 8,
    modes: ["surprise", "science", "nature", "family"],
    environments: "all",
    interests: ["science", "everything"],
    offlineCapable: true,
    pocketHint: "Find a trace of wildlife. Reconstruct the story. Touch nothing.",
  },
];

/**
 * Authored follow-up templates keyed by what was just observed — the
 * "AI adapts the next mission" beat of the loop, available even offline.
 */
export const FOLLOW_UP_TEMPLATES: Record<string, string[]> = {
  plant: ["compare-new-old-leaves", "find-same-plant-twice", "find-leaf-shapes"],
  flower: ["observe-pollinator", "find-colour-uncommon"],
  tree: ["compare-bark-textures", "find-same-plant-twice"],
  bird: ["count-bird-survey", "listen-bird-rhythm", "clue-follow-sound"],
  insect: ["observe-insect-plant", "find-small-world"],
  animal: ["clue-nature-detective"],
  fungus: ["find-small-world", "reflect-first-notice"],
  sound: ["listen-quietest-spot", "clue-follow-sound", "record-place-soundscape"],
  rock: ["photo-texture-pattern", "compare-shade-light"],
  landscape: ["walk-treeline", "photo-window-light"],
  texture: ["photo-texture-pattern"],
  weather: ["listen-quietest-spot", "reflect-found-question"],
  other: ["reflect-first-notice", "count-categories"],
  unknown: ["reflect-first-notice", "find-small-world"],
};

export function templateById(id: string): MissionTemplate | null {
  return MISSION_TEMPLATES.find((t) => t.id === id) ?? null;
}
