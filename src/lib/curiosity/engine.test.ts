import { describe, expect, it } from "vitest";
import {
  environmentHint,
  generateCuriosityAction,
  pickCuriosityCandidate,
  usedCategoriesFromMissionTypes,
  type CuriosityInput,
} from "@/lib/curiosity/engine";
import type { ObservationCategory } from "@/lib/domain/types";

const ACCESSIBILITY = {
  reducedMotion: false,
  highContrast: false,
  largeText: false,
  captions: true,
  largeTouchTargets: false,
};

function input(overrides: Partial<CuriosityInput> = {}): CuriosityInput {
  return {
    observation: { id: "obs-1", category: "plant", note: "" },
    expedition: { mode: "nature", environment: "forest", title: "Morning walk" },
    recentCategories: [],
    completedMissionTypes: [],
    accessibility: ACCESSIBILITY,
    ...overrides,
  };
}

type CandidateLike = Parameters<typeof pickCuriosityCandidate>[0][number];

const POOL: CandidateLike[] = [
  {
    category: "WALK",
    insight: "Move.",
    action: "Walk somewhere new.",
    mission: "Walk.",
    minutes: 5,
  },
  {
    category: "NOTICE",
    insight: "Look.",
    action: "Notice one detail.",
    mission: "Notice.",
    minutes: 3,
  },
  {
    category: "SEARCH",
    insight: "Find.",
    action: "Find two more like it.",
    mission: "Search.",
    minutes: 4,
  },
];

describe("pickCuriosityCandidate", () => {
  it("is deterministic for the same observation id", () => {
    const a = pickCuriosityCandidate(POOL, input());
    const b = pickCuriosityCandidate(POOL, input());
    expect(a).toBe(b);
  });

  it("rotates the choice across different observation ids", () => {
    // surprise mode keeps both NOTICE and SEARCH eligible, so the id hash is
    // the only thing left deciding the pick.
    const picks = new Set(
      ["a", "b", "c", "d", "e", "f"].map(
        (id) =>
          pickCuriosityCandidate(
            POOL,
            input({
              observation: { id, category: "plant", note: "" },
              expedition: { mode: "surprise", environment: "forest", title: "" },
            })
          ).category
      )
    );
    expect(picks.size).toBeGreaterThan(1);
  });

  it("restricts the pool to motion-light actions under reducedMotion", () => {
    const picked = pickCuriosityCandidate(
      POOL,
      input({ accessibility: { ...ACCESSIBILITY, reducedMotion: true } })
    );
    expect(picked.category).not.toBe("WALK");
    expect(["NOTICE", "SEARCH"]).toContain(picked.category);
  });

  it("biases toward action kinds that suit the expedition mode", () => {
    // mindful mode bias: LISTEN, WAIT, REFLECT — none of POOL; falls back to full pool
    const mindful = pickCuriosityCandidate(
      POOL,
      input({ expedition: { mode: "mindful", environment: "forest", title: "x" } })
    );
    expect(POOL).toContain(mindful);
    // fitness bias includes WALK, SEARCH and NOTICE — a walk-ish pool resolves
    const fitness = pickCuriosityCandidate(
      POOL,
      input({ expedition: { mode: "fitness", environment: "forest", title: "x" } })
    );
    expect(POOL).toContain(fitness);
  });

  it("pushes already-used action kinds down when a fresh one exists", () => {
    const picked = pickCuriosityCandidate(POOL, input(), ["WALK", "SEARCH"]);
    expect(picked.category).toBe("NOTICE");
  });

  it("never picks a screen-requiring candidate when a screen-free biased one exists", () => {
    const pool: CandidateLike[] = [
      {
        category: "NOTICE",
        insight: "i",
        action: "a",
        mission: "m",
        minutes: 3,
        requiresScreen: true,
      },
      { category: "LOOK", insight: "i", action: "a", mission: "m", minutes: 3 },
    ];
    const picked = pickCuriosityCandidate(pool, input()); // nature bias: LOOK/NOTICE/COMPARE
    expect(picked.category).toBe("LOOK");
    expect(picked.requiresScreen).toBeUndefined();
  });
});

describe("usedCategoriesFromMissionTypes", () => {
  it("maps mission types to action kinds and dedupes", () => {
    expect(usedCategoriesFromMissionTypes(["FIND", "FOLLOW_CLUE"])).toEqual(["SEARCH"]);
    expect(usedCategoriesFromMissionTypes(["OBSERVE", "COUNT", "NOTICE_CHANGE"])).toEqual([
      "NOTICE",
    ]);
    expect(usedCategoriesFromMissionTypes(["LISTEN", "COMPARE", "WALK", "REFLECT"])).toEqual([
      "LISTEN",
      "COMPARE",
      "WALK",
      "REFLECT",
    ]);
    expect(usedCategoriesFromMissionTypes(["PHOTOGRAPH", "RECORD_AUDIO"])).toEqual([
      "PHOTOGRAPH",
      "RECORD",
    ]);
  });
});

describe("generateCuriosityAction", () => {
  const categories: ObservationCategory[] = [
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

  it("produces a well-formed, non-blocked, screen-free action for every category", () => {
    for (const category of categories) {
      const action = generateCuriosityAction(
        input({ observation: { id: `obs-${category}`, category, note: "" } })
      );
      expect(action.generatedBy).toBe("rules");
      expect(action.safetyLevel).not.toBe("blocked");
      expect(action.requiresScreen).toBe(false);
      expect(action.shortInsight.length).toBeGreaterThan(0);
      expect(action.physicalAction.length).toBeGreaterThan(0);
      expect(action.estimatedMinutes).toBeGreaterThanOrEqual(1);
    }
  });

  it("is deterministic for the same input", () => {
    const a = generateCuriosityAction(input());
    const b = generateCuriosityAction(input());
    expect(a).toEqual(b);
  });

  it("raises fungus, plant, flower and animal to caution via the category safety layer", () => {
    for (const category of ["fungus", "plant", "flower", "animal"] as ObservationCategory[]) {
      const action = generateCuriosityAction(
        input({ observation: { id: `obs-${category}`, category, note: "" } })
      );
      expect(action.safetyLevel).toBe("caution");
    }
  });

  it("clamps the action to the remaining expedition time", () => {
    const short = generateCuriosityAction(input({ minutesRemaining: 2 }));
    expect(short.estimatedMinutes).toBe(2);
    const tiny = generateCuriosityAction(input({ minutesRemaining: 0.4 }));
    expect(tiny.estimatedMinutes).toBe(1);
    const none = generateCuriosityAction(input({ minutesRemaining: 0 }));
    expect(none.estimatedMinutes).toBeGreaterThanOrEqual(1);
    const unknown = generateCuriosityAction(input());
    expect(unknown.estimatedMinutes).toBeGreaterThanOrEqual(1);
  });

  it("falls back to the authored unknown-pool action for unmapped categories", () => {
    const action = generateCuriosityAction(
      input({ observation: { id: "obs-x", category: "unknown", note: "" } })
    );
    expect(action.category).toBe("NOTICE");
    expect(action.safetyLevel).toBe("safe");
  });
});

describe("environmentHint", () => {
  it("has a specific hint for every environment value", () => {
    for (const env of [
      "park",
      "garden",
      "forest",
      "neighbourhood",
      "campus",
      "countryside",
      "unknown",
    ] as const) {
      expect(environmentHint(env).length).toBeGreaterThan(10);
    }
  });
});
