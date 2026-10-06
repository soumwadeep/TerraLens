import { describe, expect, it } from "vitest";
import {
  adaptMissionsAfterObservation,
  canTransition,
  generateMissions,
  MAX_MISSIONS,
  missionCountForDuration,
  missionFromTemplate,
  missionProgress,
  missionTypeCoverage,
  nextFocusMission,
  seededRandom,
  selectTemplates,
  templateMatchesEnvironment,
  templateMatchesInterests,
  templateMatchesMode,
  transitionMission,
  unlockNextMission,
} from "@/lib/missions/engine";
import type { Mission, MissionStatus } from "@/lib/domain/types";

const EXPEDITION_ID = "00000000-0000-4000-8000-000000000001";

const EXPEDITION = {
  id: EXPEDITION_ID,
  mode: "nature",
  environment: "forest",
  durationMinutes: 30,
} as const;

function makeMission(
  templateId: string,
  orderIndex: number,
  status: MissionStatus = "LOCKED"
): Mission {
  const mission = missionFromTemplate(templateId, EXPEDITION_ID, orderIndex, status);
  if (!mission) throw new Error(`Template ${templateId} unexpectedly failed to build`);
  return mission;
}

describe("seededRandom (mulberry32)", () => {
  it("produces the same sequence for the same seed", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("produces values in [0, 1)", () => {
    const rand = seededRandom(7);
    for (let i = 0; i < 100; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("differs between seeds", () => {
    expect(seededRandom(1)()).not.toBe(seededRandom(2)());
  });
});

describe("eligibility matchers", () => {
  it("templateMatchesMode: 'all' and 'surprise' accept anything", () => {
    expect(templateMatchesMode("all", "birding")).toBe(true);
    expect(templateMatchesMode(["mindful"], "surprise")).toBe(true);
    expect(templateMatchesMode(["mindful"], "birding")).toBe(false);
    expect(templateMatchesMode(["nature", "science"], "science")).toBe(true);
  });

  it("templateMatchesEnvironment: 'all' and 'unknown' accept anything", () => {
    expect(templateMatchesEnvironment("all", "neighbourhood")).toBe(true);
    expect(templateMatchesEnvironment(["forest"], "unknown")).toBe(true);
    expect(templateMatchesEnvironment(["forest"], "neighbourhood")).toBe(false);
  });

  it("templateMatchesInterests: empty or 'everything' accepts anything", () => {
    expect(templateMatchesInterests(["birds"], [])).toBe(true);
    expect(templateMatchesInterests(["birds"], ["everything"])).toBe(true);
    expect(templateMatchesInterests(["everything"], ["birds"])).toBe(true);
    expect(templateMatchesInterests(["birds"], ["plants"])).toBe(false);
    expect(templateMatchesInterests(["birds", "plants"], ["plants"])).toBe(true);
  });
});

describe("missionCountForDuration", () => {
  it("scales 15m→3 … 60m→6 and clamps outside", () => {
    expect(missionCountForDuration(15)).toBe(3);
    expect(missionCountForDuration(30)).toBe(5);
    expect(missionCountForDuration(60)).toBe(6);
    expect(missionCountForDuration(1)).toBe(3);
    expect(missionCountForDuration(600)).toBe(6);
  });
});

describe("selectTemplates", () => {
  it("is deterministic for the same expedition id", () => {
    const args: Parameters<typeof selectTemplates>[0] = {
      expeditionId: "exp-abc",
      mode: "nature",
      environment: "forest",
      interests: [],
      count: 5,
    };
    const first = selectTemplates(args).map((t) => t.id);
    const second = selectTemplates(args).map((t) => t.id);
    expect(first).toEqual(second);
    expect(first.length).toBe(5);
  });

  it("only picks eligible, non-blocked templates", () => {
    const picked = selectTemplates({
      expeditionId: "exp-xyz",
      mode: "birding",
      environment: "park",
      interests: ["birds"],
      count: 6,
    });
    for (const template of picked) {
      expect(templateMatchesMode(template.modes, "birding")).toBe(true);
      expect(templateMatchesEnvironment(template.environments, "park")).toBe(true);
      expect(templateMatchesInterests(template.interests, ["birds"])).toBe(true);
    }
  });
});

describe("missionFromTemplate", () => {
  it("returns null for an unknown template id", () => {
    expect(missionFromTemplate("no-such-template", "exp", 0)).toBeNull();
  });

  it("builds a LOCKED mission stamped as a rules-generated live record", () => {
    const mission = missionFromTemplate("find-leaf-shapes", EXPEDITION_ID, 3);
    expect(mission).not.toBeNull();
    expect(mission?.status).toBe("LOCKED");
    expect(mission?.orderIndex).toBe(3);
    expect(mission?.generatedBy).toBe("rules");
    expect(mission?.origin).toBe("live");
    expect(mission?.syncStatus).toBe("local-only");
    expect(mission?.observationIds).toEqual([]);
    expect(mission?.completedAt).toBeNull();
    expect(mission?.safetyMetadata.reviewedBy).toBe("rules");
    expect(mission?.safetyMetadata.level).not.toBe("blocked");
  });
});

describe("generateMissions", () => {
  it("creates one AVAILABLE mission and the rest LOCKED, in board order", () => {
    const missions = generateMissions({ expedition: EXPEDITION, interests: ["everything"] });
    expect(missions.length).toBe(missionCountForDuration(EXPEDITION.durationMinutes));
    expect(missions[0].status).toBe("AVAILABLE");
    for (const mission of missions.slice(1)) {
      expect(mission.status).toBe("LOCKED");
    }
    expect(missions.map((m) => m.orderIndex)).toEqual(missions.map((_, i) => i));
  });

  it("is deterministic — same expedition id, same board", () => {
    const a = generateMissions({ expedition: EXPEDITION, interests: ["plants"] });
    const b = generateMissions({ expedition: EXPEDITION, interests: ["plants"] });
    expect(a.map((m) => m.title)).toEqual(b.map((m) => m.title));
  });
});

describe("mission state machine", () => {
  it("allows exactly the spec transitions", () => {
    expect(canTransition("LOCKED", "AVAILABLE")).toBe(true);
    expect(canTransition("LOCKED", "COMPLETED")).toBe(false);
    expect(canTransition("AVAILABLE", "ACTIVE")).toBe(true);
    expect(canTransition("AVAILABLE", "COMPLETED")).toBe(true);
    expect(canTransition("AVAILABLE", "SKIPPED")).toBe(true);
    expect(canTransition("ACTIVE", "COMPLETED")).toBe(true);
    expect(canTransition("ACTIVE", "SKIPPED")).toBe(true);
    expect(canTransition("SKIPPED", "ACTIVE")).toBe(true);
    expect(canTransition("SKIPPED", "AVAILABLE")).toBe(true);
    expect(canTransition("COMPLETED", "ACTIVE")).toBe(false);
    expect(canTransition("EXPIRED", "AVAILABLE")).toBe(false);
  });

  it("throws loudly on an illegal transition", () => {
    const done = makeMission("find-leaf-shapes", 0, "COMPLETED");
    expect(() => transitionMission(done, "ACTIVE")).toThrow(/Illegal mission transition/);
  });

  it("is a no-op when the status is unchanged", () => {
    const mission = makeMission("find-leaf-shapes", 0, "LOCKED");
    expect(transitionMission(mission, "LOCKED")).toBe(mission);
  });

  it("stamps completedAt on completion and keeps it idempotent across skips", () => {
    const mission = makeMission("find-leaf-shapes", 0, "ACTIVE");
    const at = "2026-10-06T10:00:00.000Z";
    const completed = transitionMission(mission, "COMPLETED", { at });
    expect(completed.completedAt).toBe(at);
    expect(completed.updatedAt).toBe(at);
  });

  it("dedupes observation ids when attaching evidence", () => {
    const obsA = "00000000-0000-4000-8000-0000000000a1";
    const obsB = "00000000-0000-4000-8000-0000000000b2";
    const mission = makeMission("find-leaf-shapes", 0, "AVAILABLE");
    const active = transitionMission(mission, "ACTIVE", { observationId: obsA });
    const completed = transitionMission(active, "COMPLETED", { observationId: obsA });
    expect(completed.observationIds).toEqual([obsA]);

    const other = transitionMission(
      makeMission("find-same-plant-twice", 1, "ACTIVE"),
      "COMPLETED",
      {
        observationId: obsB,
      }
    );
    expect(other.observationIds).toEqual([obsB]);
  });

  it("re-queues a synced mission on change, leaves local-only untouched", () => {
    const synced = {
      ...makeMission("find-leaf-shapes", 0, "ACTIVE"),
      syncStatus: "synced" as const,
    };
    expect(transitionMission(synced, "COMPLETED").syncStatus).toBe("queued");
    const local = makeMission("find-leaf-shapes", 0, "ACTIVE");
    expect(transitionMission(local, "COMPLETED").syncStatus).toBe("local-only");
  });
});

describe("unlockNextMission", () => {
  it("does nothing while something is AVAILABLE or ACTIVE", () => {
    const board = [
      makeMission("find-leaf-shapes", 0, "AVAILABLE"),
      makeMission("listen-two-sounds", 1),
    ];
    expect(unlockNextMission(board)).toBe(board);
  });

  it("unlocks the lowest-order LOCKED mission when the board stalls", () => {
    const board = [
      makeMission("find-leaf-shapes", 0, "COMPLETED"),
      makeMission("listen-two-sounds", 1),
      makeMission("walk-slow-minutes", 2),
    ];
    const unlocked = unlockNextMission(board);
    expect(unlocked[1].status).toBe("AVAILABLE");
    expect(unlocked[2].status).toBe("LOCKED");
  });

  it("returns the same board when nothing can be unlocked", () => {
    const board = [makeMission("find-leaf-shapes", 0, "COMPLETED")];
    expect(unlockNextMission(board)).toBe(board);
  });
});

describe("missionProgress & nextFocusMission", () => {
  const board = [
    makeMission("find-leaf-shapes", 0, "COMPLETED"),
    makeMission("listen-two-sounds", 1, "SKIPPED"),
    makeMission("walk-slow-minutes", 2, "ACTIVE"),
    makeMission("count-categories", 3),
  ];

  it("counts each status and rounds the percentage", () => {
    expect(missionProgress(board)).toEqual({
      completed: 1,
      skipped: 1,
      total: 4,
      active: 1,
      percent: 25,
    });
  });

  it("is zeroed for an empty board", () => {
    expect(missionProgress([])).toEqual({
      completed: 0,
      skipped: 0,
      total: 0,
      active: 0,
      percent: 0,
    });
  });

  it("focuses ACTIVE before AVAILABLE before the lowest LOCKED", () => {
    expect(nextFocusMission(board)?.status).toBe("ACTIVE");
    const noActive = board.filter((m) => m.status !== "ACTIVE");
    expect(nextFocusMission(noActive)?.orderIndex).toBe(3);
    const withAvailable = [
      makeMission("find-leaf-shapes", 0, "SKIPPED"),
      makeMission("listen-two-sounds", 1, "AVAILABLE"),
      makeMission("walk-slow-minutes", 2, "LOCKED"),
    ];
    expect(nextFocusMission(withAvailable)?.status).toBe("AVAILABLE");
    expect(nextFocusMission([])).toBeNull();
  });
});

describe("adaptMissionsAfterObservation", () => {
  it("adds authored follow-ups for the observed category, AVAILABLE and ordered after the board", () => {
    const board = [makeMission("find-leaf-shapes", 0, "COMPLETED")];
    const result = adaptMissionsAfterObservation(board, { category: "plant" }, EXPEDITION_ID);
    expect(result.reason).toBe("follow-up:plant");
    expect(result.added.length).toBeGreaterThan(0);
    for (const mission of result.added) {
      expect(mission.status).toBe("AVAILABLE");
      expect(mission.orderIndex).toBeGreaterThan(0);
    }
    expect(result.missions.length).toBe(board.length + result.added.length);
  });

  it("never exceeds MAX_MISSIONS", () => {
    const board = Array.from({ length: MAX_MISSIONS }, (_, i) =>
      makeMission("find-leaf-shapes", i, "LOCKED")
    );
    const result = adaptMissionsAfterObservation(board, { category: "plant" }, EXPEDITION_ID);
    expect(result.missions).toBe(board);
    expect(result.added).toEqual([]);
    expect(result.reason).toBe("board-full");
  });

  it("dedupes by title and reports no-new-follow-ups when everything is present", () => {
    const board = [
      makeMission("compare-new-old-leaves", 0, "COMPLETED"),
      makeMission("find-same-plant-twice", 1, "COMPLETED"),
      makeMission("find-leaf-shapes", 2, "COMPLETED"),
    ];
    const result = adaptMissionsAfterObservation(board, { category: "plant" }, EXPEDITION_ID);
    expect(result.reason).toBe("no-new-follow-ups");
    expect(result.added).toEqual([]);
    expect(result.missions).toBe(board);
  });

  it("falls back to the unknown category templates for unmapped categories", () => {
    const result = adaptMissionsAfterObservation([], { category: "unknown" }, EXPEDITION_ID);
    expect(result.reason).toBe("follow-up:unknown");
    expect(result.added.length).toBeGreaterThan(0);
    expect(result.added[0].title).toBe("Name something you've never noticed before");
  });
});

describe("missionTypeCoverage", () => {
  it("returns each type once", () => {
    const board = [
      makeMission("find-leaf-shapes", 0), // FIND
      makeMission("find-small-world", 1), // FIND
      makeMission("listen-two-sounds", 2), // LISTEN
    ];
    expect(missionTypeCoverage(board).sort()).toEqual(["FIND", "LISTEN"]);
  });
});
