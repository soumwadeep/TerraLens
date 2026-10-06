/**
 * Grass Score unit tests (spec §16).
 *
 * These are the tests the /judge page promises run in CI. They pin the
 * deterministic arithmetic: component ceilings, anti-gaming behavior,
 * honest-zero GPS handling, rank boundaries, and streak counting.
 */
import { describe, expect, it } from "vitest";
import {
  GRASS_COMPONENT_META,
  GRASS_RANK_META,
  GRASS_SCORE_MAX,
  computeComponents,
  computeGrassScore,
  computeStreakDays,
  grassInputs,
  grassRankFor,
} from "@/lib/scoring/grass-score";

describe("grassRankFor — rank boundaries", () => {
  it.each([
    [0, "seedling"],
    [149, "seedling"],
    [150, "sprout"],
    [299, "sprout"],
    [300, "explorer"],
    [499, "explorer"],
    [500, "trailblazer"],
    [699, "trailblazer"],
    [700, "naturalist"],
    [879, "naturalist"],
    [880, "wildmind"],
    [1000, "wildmind"],
  ] as const)("score %i → rank %s", (score, rank) => {
    expect(grassRankFor(score)).toBe(rank);
  });

  it("clamps out-of-range input instead of throwing", () => {
    expect(grassRankFor(-50)).toBe("seedling");
    expect(grassRankFor(5000)).toBe("wildmind");
  });

  it("every rank in the thresholds has display metadata", () => {
    for (const rank of Object.keys(GRASS_RANK_META)) {
      expect(GRASS_RANK_META[rank as keyof typeof GRASS_RANK_META].label.length).toBeGreaterThan(0);
    }
  });
});

describe("computeComponents — ceilings and scaling", () => {
  it("outdoor duration: full 250 at 60 minutes, linear below, capped above", () => {
    expect(computeComponents(grassInputs({ outdoorSeconds: 0 })).outdoorDuration).toBe(0);
    expect(computeComponents(grassInputs({ outdoorSeconds: 1800 })).outdoorDuration).toBe(125);
    expect(computeComponents(grassInputs({ outdoorSeconds: 3600 })).outdoorDuration).toBe(250);
    expect(computeComponents(grassInputs({ outdoorSeconds: 7200 })).outdoorDuration).toBe(250);
  });

  it("pocket time: full 200 only when 25 min away with no screen time", () => {
    const full = computeComponents(grassInputs({ pocketSeconds: 1500, screenActiveSeconds: 0 }));
    expect(full.pocketTime).toBe(200);
  });

  it("pocket time anti-gaming: sitting in the app earns a fraction", () => {
    // 25 min of pocket but 25 min of screen — away-share 0.5, share multiplier 0.625.
    const halfScreen = computeComponents(
      grassInputs({ pocketSeconds: 1500, screenActiveSeconds: 1500 })
    );
    expect(halfScreen.pocketTime).toBeCloseTo(200 * (0.25 + 0.75 * 0.5), 1);
    expect(halfScreen.pocketTime).toBeLessThan(200);
  });

  it("pocket time: all screen, no pocket → zero", () => {
    const allScreen = computeComponents(
      grassInputs({ pocketSeconds: 0, screenActiveSeconds: 3600 })
    );
    expect(allScreen.pocketTime).toBe(0);
  });

  it("mission completion: 50 each, capped at 200", () => {
    expect(computeComponents(grassInputs({ missionsCompleted: 1 })).missionCompletion).toBe(50);
    expect(computeComponents(grassInputs({ missionsCompleted: 3 })).missionCompletion).toBe(150);
    expect(computeComponents(grassInputs({ missionsCompleted: 4 })).missionCompletion).toBe(200);
    expect(computeComponents(grassInputs({ missionsCompleted: 40 })).missionCompletion).toBe(200);
  });

  it("mission completion: skipping drags the credit down (min multiplier 0.4)", () => {
    const withSkips = computeComponents(grassInputs({ missionsCompleted: 4, missionsSkipped: 4 }));
    // 200 * clamp(4/8, 0.4, 1) = 100
    expect(withSkips.missionCompletion).toBe(100);
    const mostlySkipped = computeComponents(
      grassInputs({ missionsCompleted: 1, missionsSkipped: 9 })
    );
    // 50 * clamp(0.1, 0.4, 1) = 20 — the floor prevents total collapse.
    expect(mostlySkipped.missionCompletion).toBe(20);
  });

  it("observation diversity: variety-first, spamming one category is capped", () => {
    const spamOneCategory = computeComponents(
      grassInputs({ observationCount: 40, uniqueCategories: 1, uniqueTags: 0 })
    );
    // 60 * (1/5) + 40 * 1 = 52 — count alone cannot max the component.
    expect(spamOneCategory.observationDiversity).toBe(52);
    const varied = computeComponents(
      grassInputs({ observationCount: 8, uniqueCategories: 5, uniqueTags: 10 })
    );
    expect(varied.observationDiversity).toBe(150);
  });

  it("distance: honest zero without GPS or below the jitter threshold", () => {
    expect(computeComponents(grassInputs({ distanceMeters: null })).distance).toBe(0);
    expect(computeComponents(grassInputs({ distanceMeters: 99 })).distance).toBe(0);
    expect(computeComponents(grassInputs({ distanceMeters: 1500 })).distance).toBe(50);
    expect(computeComponents(grassInputs({ distanceMeters: 3000 })).distance).toBe(100);
    expect(computeComponents(grassInputs({ distanceMeters: 50_000 })).distance).toBe(100);
  });

  it("novelty: 10 per first-time discovery, capped at 50", () => {
    expect(computeComponents(grassInputs({ newDiscoveries: 3 })).discoveryNovelty).toBe(30);
    expect(computeComponents(grassInputs({ newDiscoveries: 99 })).discoveryNovelty).toBe(50);
  });

  it("streak: 10 per consecutive day, capped at 50", () => {
    expect(computeComponents(grassInputs({ streakDays: 2 })).streak).toBe(20);
    expect(computeComponents(grassInputs({ streakDays: 30 })).streak).toBe(50);
  });

  it("component ceilings in GRASS_COMPONENT_META match the engine's actual caps", () => {
    const extreme = computeComponents(
      grassInputs({
        outdoorSeconds: 100_000,
        pocketSeconds: 100_000,
        screenActiveSeconds: 0,
        distanceMeters: 1_000_000,
        missionsCompleted: 100,
        missionsSkipped: 0,
        observationCount: 1000,
        uniqueCategories: 1000,
        uniqueTags: 1000,
        newDiscoveries: 1000,
        streakDays: 1000,
      })
    );
    for (const meta of GRASS_COMPONENT_META) {
      expect(extreme[meta.key]).toBeLessThanOrEqual(meta.max);
    }
  });

  it("never produces a negative component", () => {
    const zero = computeComponents(grassInputs({}));
    for (const value of Object.values(zero)) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("computeGrassScore — whole score", () => {
  it("returns exactly 0 / Seedling for a fully empty input", () => {
    const result = computeGrassScore(grassInputs({}));
    expect(result.score).toBe(0);
    expect(result.rank).toBe("seedling");
    expect(result.gpsAvailable).toBe(false);
  });

  it("a perfect day totals 1000 and core-honest ranks", () => {
    const result = computeGrassScore(
      grassInputs({
        outdoorSeconds: 3600,
        pocketSeconds: 1500,
        screenActiveSeconds: 0,
        distanceMeters: 3000,
        missionsCompleted: 4,
        observationCount: 8,
        uniqueCategories: 5,
        uniqueTags: 10,
        newDiscoveries: 5,
        streakDays: 5,
      })
    );
    expect(result.score).toBe(GRASS_SCORE_MAX);
    expect(result.rank).toBe("wildmind");
  });

  it("is deterministic — same input, same output, twice", () => {
    const input = grassInputs({ outdoorSeconds: 2200, pocketSeconds: 900, missionsCompleted: 2 });
    expect(computeGrassScore(input)).toEqual(computeGrassScore(input));
  });

  it("score equals the rounded sum of its components", () => {
    const input = grassInputs({
      outdoorSeconds: 1234,
      pocketSeconds: 567,
      screenActiveSeconds: 89,
      missionsCompleted: 2,
      missionsSkipped: 1,
      observationCount: 3,
      uniqueCategories: 2,
      uniqueTags: 4,
      distanceMeters: 654,
      newDiscoveries: 1,
      streakDays: 3,
    });
    const result = computeGrassScore(input);
    const sum = Object.values(result.components).reduce((a, b) => a + b, 0);
    expect(result.score).toBe(Math.round(Math.min(1000, Math.max(0, sum))));
  });

  it("flags GPS-off honestly instead of inventing distance points", () => {
    const result = computeGrassScore(grassInputs({ outdoorSeconds: 3600, distanceMeters: null }));
    expect(result.gpsAvailable).toBe(false);
    expect(result.components.distance).toBe(0);
    expect(result.notes.join(" ")).toContain("GPS off");
  });

  it("notes the GPS jitter guard for sub-100 m distance", () => {
    const result = computeGrassScore(grassInputs({ outdoorSeconds: 600, distanceMeters: 40 }));
    expect(result.notes.join(" ")).toContain("GPS jitter");
    expect(result.components.distance).toBe(0);
  });

  it("notes when pocket time is zero, when screen time beat pocket time, and on interruptions", () => {
    const result = computeGrassScore(
      grassInputs({
        outdoorSeconds: 1800,
        pocketSeconds: 0,
        screenActiveSeconds: 900,
        interruptionHeavy: true,
      })
    );
    const notes = result.notes.join(" ");
    expect(notes).toContain("No pocket time");
    expect(notes).toContain("Screen-active time exceeded");
    expect(notes).toContain("app-switching");
  });

  it("notes the mission ceiling once it is hit", () => {
    const result = computeGrassScore(grassInputs({ missionsCompleted: 4 }));
    expect(result.notes.join(" ")).toContain("ceiling");
  });
});

describe("computeStreakDays", () => {
  it("counts consecutive days ending today", () => {
    expect(computeStreakDays(["2026-03-01", "2026-03-02", "2026-03-03"], "2026-03-03")).toBe(3);
  });

  it("allows a streak that ends yesterday (today not yet explored)", () => {
    expect(computeStreakDays(["2026-03-01", "2026-03-02"], "2026-03-03")).toBe(2);
  });

  it("returns 0 when the newest exploration is older than yesterday", () => {
    expect(computeStreakDays(["2026-02-20", "2026-02-21"], "2026-03-03")).toBe(0);
  });

  it("breaks on a gap", () => {
    expect(computeStreakDays(["2026-03-01", "2026-03-02", "2026-03-04"], "2026-03-04")).toBe(1);
  });

  it("dedupes and accepts unordered input", () => {
    expect(
      computeStreakDays(["2026-03-03", "2026-03-01", "2026-03-02", "2026-03-02"], "2026-03-03")
    ).toBe(3);
  });

  it("returns 0 for no data", () => {
    expect(computeStreakDays([], "2026-03-03")).toBe(0);
  });
});
