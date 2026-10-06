import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analyzeObservation,
  curiosityActionFromInsight,
  describeAnalysisOrder,
  missionFromInsight,
  selectAnalysisOrder,
  type AnalysisContext,
} from "@/lib/ai/analysis";
import { ModelInsightSchema, type ModelInsight } from "@/lib/ai/adapter";
import { MAX_MISSIONS } from "@/lib/missions/engine";

const OBSERVATION_ID = "3d1f8a54-2c0e-4a9e-9c3a-6f2b1d4e5a6b";
const EXPEDITION_ID = "7c2e9b13-5d4f-4a8b-9e1c-8a3f2b6d4e7a";

interface FetchCall {
  url: string;
  body: Record<string, unknown> | null;
}

type Handler = (url: string) => Response | Promise<Response>;

function stubFetch(handler: Handler): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({
      url,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
    });
    return handler(url);
  });
  return calls;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function localOk(insight: Record<string, unknown>): Response {
  return jsonResponse({ choices: [{ message: { content: JSON.stringify(insight) } }] });
}

function serverOk(insight: Record<string, unknown>): Response {
  return jsonResponse({
    kind: "ok",
    insight: ModelInsightSchema.parse(insight),
    model: "gemma3:4b",
    latencyMs: 21,
    via: "gemma-server",
  });
}

function ctx(overrides: Partial<AnalysisContext> = {}): AnalysisContext {
  return {
    observation: { id: OBSERVATION_ID, category: "bird", note: "" },
    expedition: { id: EXPEDITION_ID, mode: "nature", environment: "unknown" },
    preferences: { aiRuntimePreference: "AUTO", privacyMode: "HYBRID" },
    imageDataUrl: null,
    boardTitles: [],
    boardCount: 0,
    nextOrderIndex: 0,
    ...overrides,
  };
}

const RICH_INSIGHT = {
  category: "bird",
  commonName: "European Robin",
  scientificName: "Erithacus rubecula",
  confidence: 0.8,
  visualFeatures: ["orange breast", "round body"],
  uncertainty: "Could be a juvenile variant.",
  safetyWarning: null,
  curiosityPrompt: "Why is it singing right now?",
  suggestedNextAction: "Watch the fence line for two minutes.",
  curiosity: {
    shortInsight: "Robins often sing to claim territory.",
    physicalAction: "Stand still and count how many times it repeats its phrase.",
    nextMission: "Count one bird's call phrases",
    estimatedMinutes: 3,
    actionKind: "LISTEN",
    requiresScreen: false,
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("selectAnalysisOrder (privacy first)", () => {
  it("LOCAL_ONLY is a hard constraint — never the server", () => {
    expect(
      selectAnalysisOrder({ aiRuntimePreference: "CLOUD", privacyMode: "LOCAL_ONLY" })
    ).toEqual(["local"]);
  });

  it("prefers the user's runtime choice", () => {
    expect(selectAnalysisOrder({ aiRuntimePreference: "LOCAL", privacyMode: "HYBRID" })).toEqual([
      "local",
    ]);
    expect(selectAnalysisOrder({ aiRuntimePreference: "CLOUD", privacyMode: "HYBRID" })).toEqual([
      "server",
    ]);
  });

  it("AUTO tries on-device first, then the server", () => {
    expect(
      selectAnalysisOrder({ aiRuntimePreference: "AUTO", privacyMode: "CLOUD_ENHANCED" })
    ).toEqual(["local", "server"]);
  });

  it("describes each order in plain language", () => {
    expect(describeAnalysisOrder(["local"])).toBe("On-device only.");
    expect(describeAnalysisOrder(["server"])).toBe("Server only.");
    expect(describeAnalysisOrder(["local", "server"])).toBe("On-device first, server as fallback.");
  });
});

describe("analyzeObservation — on-device path", () => {
  it("assembles a full ok outcome: analysis, curiosity action and mission candidate", async () => {
    stubFetch(() => localOk(RICH_INSIGHT));
    const outcome = await analyzeObservation(ctx());

    expect(outcome.analysis.engine).toBe("gemma-local");
    expect(outcome.analysis.runtime).toBe("on-device");
    expect(outcome.analysis.status).toBe("ok");
    expect(outcome.analysis.confidenceLabel).toBe("high");
    expect(outcome.analysis.commonName).toBe("European Robin");
    expect(outcome.unavailability).toBeNull();

    expect(outcome.curiosityAction).not.toBeNull();
    expect(outcome.curiosityAction?.generatedBy).toBe("gemma");
    expect(outcome.curiosityAction?.requiresScreen).toBe(false);

    expect(outcome.suggestedMission).not.toBeNull();
    expect(outcome.suggestedMission?.generatedBy).toBe("gemma");
    expect(outcome.suggestedMission?.type).toBe("LISTEN");
    expect(outcome.suggestedMission?.status).toBe("AVAILABLE");
    expect(outcome.suggestedMission?.orderIndex).toBe(0);
  });

  it("never touches the server route under LOCAL_ONLY", async () => {
    const calls = stubFetch(() => localOk(RICH_INSIGHT));
    await analyzeObservation(
      ctx({ preferences: { aiRuntimePreference: "AUTO", privacyMode: "LOCAL_ONLY" } })
    );
    expect(calls.length).toBe(1);
    expect(calls.every((c) => !c.url.includes("/api/analyze"))).toBe(true);
  });

  it("sends image bytes to the on-device runtime when an image is attached", async () => {
    const calls = stubFetch(() => localOk(RICH_INSIGHT));
    await analyzeObservation(ctx({ imageDataUrl: "data:image/png;base64,AAAA" }));
    const messages = calls[0].body?.messages as Array<{ content: unknown }>;
    const last = messages[messages.length - 1];
    expect(JSON.stringify(last.content)).toContain("data:image/png;base64,AAAA");
  });

  it("marks an unanswerable model response as unavailable (answered-and-failed)", async () => {
    stubFetch(() => localOk({ totally: "wrong shape" }));
    const outcome = await analyzeObservation(
      ctx({ preferences: { aiRuntimePreference: "LOCAL", privacyMode: "HYBRID" } })
    );
    expect(outcome.analysis.status).toBe("unavailable");
    expect(outcome.unavailability).toEqual({ noRuntime: false, adapterId: "gemma-local" });
    expect(outcome.curiosityAction).toBeNull();
    expect(outcome.suggestedMission).toBeNull();
  });
});

describe("analyzeObservation — fallback behaviour", () => {
  it("falls through to the server when no local runtime answered", async () => {
    const calls = stubFetch((url) => {
      if (url.includes("127.0.0.1:11434")) throw new TypeError("fetch failed");
      return serverOk(RICH_INSIGHT);
    });
    const outcome = await analyzeObservation(ctx());
    expect(calls.length).toBe(2);
    expect(outcome.analysis.engine).toBe("gemma-server");
    expect(outcome.analysis.runtime).toBe("server");
    expect(outcome.analysis.status).toBe("ok");
  });

  it("never forwards image bytes to the server — hasImage flag only", async () => {
    const calls = stubFetch((url) => {
      if (url.includes("127.0.0.1:11434")) throw new TypeError("fetch failed");
      return serverOk(RICH_INSIGHT);
    });
    await analyzeObservation(ctx({ imageDataUrl: "data:image/png;base64,AAAA" }));
    const serverCall = calls.find((c) => c.url.includes("/api/analyze"));
    expect(serverCall).toBeDefined();
    const serialized = JSON.stringify(serverCall?.body);
    expect(serialized).not.toContain("data:image");
    expect(serialized).not.toContain("base64");
    expect(serverCall?.body?.hasImage).toBe(true);
  });

  it("a runtime that answered and failed STOPS the chain — no silent fallback", async () => {
    const calls = stubFetch(() =>
      jsonResponse({ kind: "unavailable", reason: "not configured" }, 200)
    );
    const outcome = await analyzeObservation(
      ctx({ preferences: { aiRuntimePreference: "CLOUD", privacyMode: "HYBRID" } })
    );
    expect(calls.length).toBe(1);
    expect(outcome.unavailability).toEqual({ noRuntime: false, adapterId: "gemma-server" });
  });

  it("reports the last unreachable adapter when nothing answered at all", async () => {
    stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    const outcome = await analyzeObservation(ctx());
    expect(outcome.analysis.status).toBe("unavailable");
    expect(outcome.unavailability).toEqual({ noRuntime: true, adapterId: "gemma-server" });
    expect(outcome.analysis.unavailableReason).toBeTruthy();
  });
});

describe("analyzeObservation — deterministic safety filter", () => {
  it("withholds a blocked field with a visible warning instead of rendering it", async () => {
    stubFetch(() =>
      localOk({
        ...RICH_INSIGHT,
        curiosityPrompt: "Eat a leaf to check if it is edible.",
        visualFeatures: ["round leaves", "Eat it and wait"],
      })
    );
    const outcome = await analyzeObservation(
      ctx({ observation: { id: OBSERVATION_ID, category: "plant", note: "" } })
    );
    expect(outcome.analysis.curiosityPrompt).toBeNull();
    expect(outcome.analysis.visualFeatures).toEqual(["round leaves"]);
    expect(outcome.analysis.safetyWarning).toContain("withheld");
  });

  it("drops a blocked curiosity suggestion entirely — no action, no mission", async () => {
    stubFetch(() =>
      localOk({
        ...RICH_INSIGHT,
        curiosity: {
          ...RICH_INSIGHT.curiosity,
          physicalAction: "Pick the mushroom and eat a small piece to taste it.",
        },
      })
    );
    const outcome = await analyzeObservation(
      ctx({ observation: { id: OBSERVATION_ID, category: "fungus", note: "" } })
    );
    expect(outcome.curiosityAction).toBeNull();
    expect(outcome.suggestedMission).toBeNull();
    expect(outcome.analysis.safetyWarning).toContain("withheld");
  });

  it("carries the category safety warning into every analysis", async () => {
    stubFetch(() => localOk({ ...RICH_INSIGHT, category: "fungus" }));
    const outcome = await analyzeObservation(
      ctx({ observation: { id: OBSERVATION_ID, category: "fungus", note: "" } })
    );
    expect(outcome.analysis.safetyWarning).toContain("Do not eat or handle unknown mushrooms");
  });
});

describe("curiosityActionFromInsight", () => {
  it("returns null without a suggestion", () => {
    const noCuriosity: ModelInsight = ModelInsightSchema.parse({ commonName: "x" });
    expect(curiosityActionFromInsight(noCuriosity, "bird")).toBeNull();
  });

  it("forces requiresScreen false except for PHOTOGRAPH/RECORD", () => {
    const photograph = ModelInsightSchema.parse({
      curiosity: {
        shortInsight: "s",
        physicalAction: "p",
        actionKind: "PHOTOGRAPH",
        requiresScreen: true,
      },
    });
    expect(curiosityActionFromInsight(photograph, "bird")?.requiresScreen).toBe(true);

    const notice = ModelInsightSchema.parse({
      curiosity: {
        shortInsight: "s",
        physicalAction: "p",
        actionKind: "NOTICE",
        requiresScreen: true,
      },
    });
    expect(curiosityActionFromInsight(notice, "bird")?.requiresScreen).toBe(false);
  });

  it("raises the level to caution for consumption-relevant categories", () => {
    const insight = ModelInsightSchema.parse({
      curiosity: { shortInsight: "s", physicalAction: "p", actionKind: "LOOK" },
    });
    expect(curiosityActionFromInsight(insight, "fungus")?.safetyLevel).toBe("caution");
    expect(curiosityActionFromInsight(insight, "rock")?.safetyLevel).toBe("safe");
  });
});

describe("missionFromInsight", () => {
  const insight = ModelInsightSchema.parse(RICH_INSIGHT);

  it("builds a gemma-generated candidate mapped to the right mission type", () => {
    const mission = missionFromInsight(ctx({ nextOrderIndex: 4 }), insight);
    expect(mission).not.toBeNull();
    expect(mission?.type).toBe("LISTEN"); // LISTEN → LISTEN
    expect(mission?.generatedBy).toBe("gemma");
    expect(mission?.orderIndex).toBe(4);
  });

  it("rejects a board that is already full", () => {
    expect(missionFromInsight(ctx({ boardCount: MAX_MISSIONS }), insight)).toBeNull();
  });

  it("rejects duplicates and too-short titles", () => {
    expect(
      missionFromInsight(ctx({ boardTitles: ["Count one bird's call phrases"] }), insight)
    ).toBeNull();
    const shortTitle = ModelInsightSchema.parse({
      curiosity: { shortInsight: "s", physicalAction: "p", nextMission: "ab" },
    });
    expect(missionFromInsight(ctx(), shortTitle)).toBeNull();
  });

  it("rejects a blocked instruction", () => {
    const dangerous = ModelInsightSchema.parse({
      curiosity: {
        shortInsight: "s",
        physicalAction: "Eat the berries you find to test them.",
        nextMission: "Taste the wild berries",
      },
    });
    expect(missionFromInsight(ctx(), dangerous)).toBeNull();
  });
});
