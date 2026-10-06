import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAnalysisMessages,
  extractJsonObject,
  insightHasSubstance,
  LOCAL_ADAPTER_ID,
  LOCAL_DEFAULT_BASE_URL,
  ModelInsightSchema,
  parseModelInsight,
  SERVER_ADAPTER_ID,
} from "@/lib/ai/adapter";
import { LocalGemmaAdapter } from "@/lib/ai/local-gemma";
import { ServerGemmaAdapter } from "@/lib/ai/server-gemma";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("adapter constants", () => {
  it("pins the local default endpoint and adapter ids", () => {
    expect(LOCAL_DEFAULT_BASE_URL).toBe("http://127.0.0.1:11434/v1");
    expect(LOCAL_ADAPTER_ID).toBe("gemma-local");
    expect(SERVER_ADAPTER_ID).toBe("gemma-server");
  });
});

describe("ModelInsightSchema — lenient by design", () => {
  it("fills safe defaults for an empty object", () => {
    const insight = ModelInsightSchema.parse({});
    expect(insight).toEqual({
      category: "unknown",
      commonName: null,
      scientificName: null,
      confidence: 0,
      visualFeatures: [],
      uncertainty: "",
      safetyWarning: null,
      curiosityPrompt: null,
      suggestedNextAction: null,
      curiosity: null,
    });
  });

  it("degrades each bad field instead of discarding the answer", () => {
    const insight = ModelInsightSchema.parse({
      category: "alien",
      confidence: 7,
      visualFeatures: ["ok", "also ok"],
      curiosity: { shortInsight: "s", physicalAction: "p", actionKind: "MOONWALK" },
    });
    expect(insight.category).toBe("unknown");
    expect(insight.confidence).toBe(0);
    expect(insight.visualFeatures).toEqual(["ok", "also ok"]);
    expect(insight.curiosity?.actionKind).toBe("NOTICE");
    expect(insight.curiosity?.requiresScreen).toBe(false);
    expect(insight.curiosity?.estimatedMinutes).toBe(4);
  });

  it("coerces numeric strings and caps feature lists", () => {
    const insight = ModelInsightSchema.parse({
      confidence: "0.62",
      visualFeatures: Array.from({ length: 12 }, (_, i) => `f${i}`),
    });
    expect(insight.confidence).toBe(0.62);
    expect(insight.visualFeatures.length).toBe(8);
  });
});

describe("extractJsonObject", () => {
  it("parses a plain object", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("unfences markdown code blocks", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("slices an object out of surrounding prose", () => {
    expect(extractJsonObject('Sure! Here it is: {"a":1} — hope that helps.')).toEqual({ a: 1 });
  });

  it("rejects non-JSON, arrays and broken braces", () => {
    expect(extractJsonObject("no json here")).toBeNull();
    expect(extractJsonObject("[1,2,3]")).toBeNull();
    expect(extractJsonObject("{broken")).toBeNull();
  });
});

describe("parseModelInsight & insightHasSubstance", () => {
  it("returns null for unparseable output", () => {
    expect(parseModelInsight("the bird is probably a robin")).toBeNull();
  });

  it("treats a syntactically valid but empty object as no substance", () => {
    const insight = parseModelInsight("{}");
    expect(insight).not.toBeNull();
    expect(insightHasSubstance(insight!)).toBe(false);
  });

  it("counts any real content as substance", () => {
    expect(insightHasSubstance(parseModelInsight('{"commonName":"Robin"}')!)).toBe(true);
    expect(insightHasSubstance(parseModelInsight('{"uncertainty":"too dark to tell"}')!)).toBe(
      true
    );
    expect(insightHasSubstance(parseModelInsight('{"visualFeatures":["orange breast"]}')!)).toBe(
      true
    );
    expect(insightHasSubstance(parseModelInsight('{"curiosityPrompt":"Why now?"}')!)).toBe(true);
  });
});

describe("buildAnalysisMessages", () => {
  const request = {
    observationId: "3d1f8a54-2c0e-4a9e-9c3a-6f2b1d4e5a6b",
    note: "small orange bird on the fence",
    category: "bird" as const,
    expeditionMode: "birding" as const,
    environment: "garden" as const,
    hasImage: true,
  };

  it("forbids ingestion, handling and medicinal claims in the system prompt", () => {
    const [system] = buildAnalysisMessages(request);
    expect(system.role).toBe("system");
    expect(system.content).toContain("Never suggest eating");
    expect(system.content).toContain("Never make medicinal claims");
    expect(system.content).toContain("NOT a certified identification authority");
  });

  it("passes the user's note verbatim and flags the attached image", () => {
    const [, user] = buildAnalysisMessages(request);
    expect(user.content).toContain("small orange bird on the fence");
    expect(user.content).toContain("An image is attached: use it as primary evidence.");
    expect(user.content).toContain("- Expedition mode: birding");
    expect(user.content).toContain("- Environment: garden");
  });

  it("says plainly when there is no image and no note", () => {
    const [, user] = buildAnalysisMessages({ ...request, hasImage: false, note: "" });
    expect(user.content).toContain("- No image attached.");
    expect(user.content).toContain("stay very conservative");
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("LocalGemmaAdapter", () => {
  it("is only 'configured' with an explicit URL", () => {
    expect(new LocalGemmaAdapter().configured()).toBe(false);
  });

  it("probe: READY only when the runtime lists the configured model", async () => {
    vi.stubGlobal("fetch", async () =>
      jsonResponse({ data: [{ id: "llama3:8b" }, { id: "gemma3:4b" }] })
    );
    const probe = await new LocalGemmaAdapter().probe();
    expect(probe.state).toBe("ready");
    expect(probe.models).toContain("gemma3:4b");
    expect(probe.adapterId).toBe(LOCAL_ADAPTER_ID);
  });

  it("probe: MODEL-MISSING when the runtime is up but the model is not loaded", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ data: [{ id: "llama3:8b" }] }));
    const probe = await new LocalGemmaAdapter().probe();
    expect(probe.state).toBe("model-missing");
    expect(probe.detail).toContain("not loaded");
  });

  it("probe: a different tag of the same model family still counts", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ data: [{ id: "gemma3:4b-q4_0" }] }));
    const probe = await new LocalGemmaAdapter().probe();
    expect(probe.state).toBe("ready");
  });

  it("probe: UNREACHABLE when nothing answers — never 'ready by configuration'", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    const probe = await new LocalGemmaAdapter().probe();
    expect(probe.state).toBe("unreachable");
    expect(probe.detail).toContain("127.0.0.1:11434");
  });
});

describe("ServerGemmaAdapter", () => {
  it("is optimistically configured in a browser — probe() is the truth", () => {
    expect(new ServerGemmaAdapter().configured()).toBe(true);
    expect(new ServerGemmaAdapter().modelId()).toBeNull();
  });

  it("probe: passes through a well-formed health probe", async () => {
    const at = new Date().toISOString();
    vi.stubGlobal("fetch", async () =>
      jsonResponse({
        configured: true,
        probe: {
          state: "ready",
          detail: "Server AI is serving gemma3:4b.",
          models: ["gemma3:4b"],
          latencyMs: 12,
          at,
        },
      })
    );
    const probe = await new ServerGemmaAdapter().probe();
    expect(probe.state).toBe("ready");
    expect(probe.models).toEqual(["gemma3:4b"]);
  });

  it("probe: an HTTP error is unreachable with an honest detail", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({}, 500));
    const probe = await new ServerGemmaAdapter().probe();
    expect(probe.state).toBe("unreachable");
    expect(probe.detail).toContain("HTTP 500");
  });

  it("probe: a route that answers without a probe shape is unreachable", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ hello: "world" }));
    const probe = await new ServerGemmaAdapter().probe();
    expect(probe.state).toBe("unreachable");
    expect(probe.detail).toContain("not with a probe result");
  });

  it("analyze: passes a kind:ok body through unchanged", async () => {
    vi.stubGlobal("fetch", async () =>
      jsonResponse({
        kind: "ok",
        insight: ModelInsightSchema.parse({ commonName: "Robin" }),
        model: "gemma3:4b",
        latencyMs: 42,
        via: "gemma-server",
      })
    );
    const result = await new ServerGemmaAdapter().analyze({
      observationId: "3d1f8a54-2c0e-4a9e-9c3a-6f2b1d4e5a6b",
      note: "",
      category: "bird",
      expeditionMode: "nature",
      environment: "unknown",
      hasImage: false,
    });
    expect(result.kind).toBe("ok");
  });

  it("analyze: a non-JSON body degrades to a typed unavailable", async () => {
    vi.stubGlobal("fetch", async () => new Response("<html>bad gateway</html>", { status: 502 }));
    const result = await new ServerGemmaAdapter().analyze({
      observationId: "3d1f8a54-2c0e-4a9e-9c3a-6f2b1d4e5a6b",
      note: "",
      category: "bird",
      expeditionMode: "nature",
      environment: "unknown",
      hasImage: false,
    });
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.noRuntime).toBe(false);
      expect(result.reason).toContain("HTTP 502");
    }
  });
});
