import { describe, expect, it } from "vitest";
import {
  CATEGORY_SAFETY_WARNINGS,
  mergeSafetyReviews,
  missionSafetyLevel,
  NATURE_PRINCIPLES,
  reviewMissionText,
  scanTextForSafety,
} from "@/lib/safety/rules";
import type { ObservationCategory } from "@/lib/domain/types";

describe("scanTextForSafety — blocked patterns (spec §34)", () => {
  it("blocks anything that suggests eating or ingesting", () => {
    const result = scanTextForSafety("Find a wild berry and taste it to identify it.");
    expect(result.level).toBe("blocked");
    expect(result.matchedRules).toContain("ingest-unknown");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("blocks foraging for food", () => {
    expect(scanTextForSafety("Forage along the trail for snacks.").level).toBe("blocked");
  });

  it("blocks handling mushrooms", () => {
    const result = scanTextForSafety("Pick a mushroom and check its gills.");
    expect(result.level).toBe("blocked");
    expect(result.matchedRules).toContain("handle-fungus");
  });

  it("blocks feeding or handling wildlife", () => {
    expect(scanTextForSafety("Feed the squirrel from your hand.").level).toBe("blocked");
  });

  it("blocks approaching dangerous animals", () => {
    expect(scanTextForSafety("Approach the deer slowly for a photo.").level).toBe("blocked");
  });

  it("blocks trespassing instructions", () => {
    expect(scanTextForSafety("Jump the fence to see the field.").level).toBe("blocked");
  });

  it("blocks climbing dangerous structures", () => {
    expect(scanTextForSafety("Climb the rock face and look down.").level).toBe("blocked");
  });

  it("blocks entering water", () => {
    expect(scanTextForSafety("Wade into the river to get closer.").level).toBe("blocked");
  });

  it("blocks crossing unsafe roads", () => {
    expect(scanTextForSafety("Cross the highway for a better angle.").level).toBe("blocked");
  });

  it("blocks illegal acts", () => {
    expect(scanTextForSafety("Dig up the plant to take home.").level).toBe("blocked");
  });

  it("blocks medicinal claims", () => {
    expect(scanTextForSafety("This plant can cure headaches.").level).toBe("blocked");
  });

  it("blocks touching dangerous plants", () => {
    expect(scanTextForSafety("Touch the stinging nettle to feel it.").level).toBe("blocked");
  });

  it("returns a blocker explanation warning", () => {
    const result = scanTextForSafety("Eat the berry.");
    expect(result.warnings[0]).toContain("blocked by TerraLens safety rules");
  });
});

describe("scanTextForSafety — caution patterns", () => {
  it("flags night exploration with a warning", () => {
    const result = scanTextForSafety("Listen for owls at night.");
    expect(result.level).toBe("caution");
    expect(result.matchedRules).toContain("night");
    expect(result.warnings.length).toBe(1);
  });

  it("flags viewpoints", () => {
    expect(scanTextForSafety("Find a hilltop vantage point.").level).toBe("caution");
  });

  it("flags water edges", () => {
    expect(scanTextForSafety("Sit near the riverbank and listen.").level).toBe("caution");
  });

  it("flags weather words", () => {
    expect(scanTextForSafety("Watch how the trees move before a storm.").level).toBe("caution");
  });

  it("flags roadside activity", () => {
    expect(scanTextForSafety("Photograph the wildflowers on the roadside.").level).toBe("caution");
  });

  it("collects multiple caution warnings", () => {
    const result = scanTextForSafety("From the hilltop overlook, watch the storm arrive.");
    expect(result.level).toBe("caution");
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
  });
});

describe("scanTextForSafety — clean text", () => {
  it("leaves everyday outdoor instructions safe", () => {
    const result = scanTextForSafety("Look up at the tree canopy for ten slow seconds.");
    expect(result.level).toBe("safe");
    expect(result.warnings).toEqual([]);
    expect(result.matchedRules).toEqual([]);
  });

  it("blocked beats caution — caution is not appended", () => {
    const result = scanTextForSafety("Taste the mushroom by the riverbank.");
    expect(result.level).toBe("blocked");
    expect(result.matchedRules).not.toContain("water-edge");
  });
});

describe("reviewMissionText", () => {
  it("scans title and instruction together and stamps the rules reviewer", () => {
    const review = reviewMissionText("Taste test", "Eat the berry you find.");
    expect(review.level).toBe("blocked");
    expect(review.reviewedBy).toBe("rules");
  });

  it("is safe for safe missions", () => {
    const review = reviewMissionText("Cloud watch", "Lie back and count cloud shapes.");
    expect(review.level).toBe("safe");
    expect(review.warnings).toEqual([]);
  });
});

describe("mergeSafetyReviews", () => {
  const rulesSafe = { level: "safe" as const, warnings: [], reviewedBy: "rules" as const };

  it("returns the rules review when there is no AI review", () => {
    expect(mergeSafetyReviews(rulesSafe, null)).toBe(rulesSafe);
  });

  it("an AI review can never downgrade blocked to caution", () => {
    const blocked = {
      level: "blocked" as const,
      warnings: ["Stop."],
      reviewedBy: "rules" as const,
    };
    const aiSaysFine = {
      level: "safe" as const,
      warnings: [],
      reviewedBy: "safety-agent" as const,
    };
    const merged = mergeSafetyReviews(blocked, aiSaysFine);
    expect(merged.level).toBe("blocked");
    expect(merged.reviewedBy).toBe("rules+safety-agent");
  });

  it("the stricter level wins in either direction", () => {
    const aiCaution = {
      level: "caution" as const,
      warnings: ["Careful."],
      reviewedBy: "safety-agent" as const,
    };
    expect(mergeSafetyReviews(rulesSafe, aiCaution).level).toBe("caution");
  });

  it("merges unique warnings and caps them", () => {
    const rules = {
      level: "caution" as const,
      warnings: ["A", "B"],
      reviewedBy: "rules" as const,
    };
    const ai = {
      level: "caution" as const,
      warnings: ["B", "C", "D", "E", "F", "G"],
      reviewedBy: "safety-agent" as const,
    };
    const merged = mergeSafetyReviews(rules, ai);
    expect(merged.warnings).toEqual(["A", "B", "C", "D", "E", "F"]);
  });
});

describe("missionSafetyLevel", () => {
  it("is safe with no warning for null/undefined categories", () => {
    expect(missionSafetyLevel(null)).toEqual({ level: "safe", warning: null });
    expect(missionSafetyLevel(undefined)).toEqual({ level: "safe", warning: null });
  });

  it("marks consumption-relevant categories caution", () => {
    for (const category of ["fungus", "plant", "flower", "animal"] as ObservationCategory[]) {
      const result = missionSafetyLevel(category);
      expect(result.level).toBe("caution");
      expect(result.warning).not.toBeNull();
      expect(result.warning).toBe(CATEGORY_SAFETY_WARNINGS[category]);
    }
  });

  it("keeps observation-only categories safe", () => {
    expect(missionSafetyLevel("rock").level).toBe("safe");
    expect(missionSafetyLevel("landscape").level).toBe("safe");
    expect(missionSafetyLevel("weather").level).toBe("safe");
  });

  it("has warnings for bird and insect too", () => {
    expect(missionSafetyLevel("bird").warning).toContain("distance");
    expect(missionSafetyLevel("insect").warning).toContain("sting");
  });
});

describe("NATURE_PRINCIPLES", () => {
  it("includes the observe-don't-disturb principle", () => {
    expect(NATURE_PRINCIPLES[0]).toBe("Observe, don't disturb.");
    expect(NATURE_PRINCIPLES.length).toBeGreaterThanOrEqual(5);
  });
});
