import { describe, expect, it } from "vitest";
import { redactForTelemetry, redactSentryEvent, scalarAttributes } from "@/lib/telemetry/redact";

describe("redactForTelemetry (spec §49)", () => {
  it("passes null, undefined and scalars through", () => {
    expect(redactForTelemetry(null)).toBeNull();
    expect(redactForTelemetry(undefined)).toBeUndefined();
    expect(redactForTelemetry(42)).toBe(42);
    expect(redactForTelemetry(true)).toBe(true);
    expect(redactForTelemetry("short")).toBe("short");
  });

  it("truncates long strings — they are labels, not content", () => {
    const long = "x".repeat(500);
    const result = redactForTelemetry(long) as string;
    expect(result.length).toBe(201); // 200 chars + ellipsis
    expect(result.endsWith("…")).toBe(true);
  });

  it("drops data URLs entirely", () => {
    expect(redactForTelemetry("data:image/png;base64,AAAA")).toBe("[redacted:data-url]");
  });

  it("replaces sensitive keys regardless of case or separators", () => {
    const result = redactForTelemetry({
      photo: "blob",
      NOTE: "my private note",
      api_key: "sk-123",
      "API-KEY": "sk-456",
      email: "a@b.c",
      latitude: 52.37,
      longitude: 4.89,
      displayName: "Sam",
      nested: { transcript: "words" },
    }) as Record<string, unknown>;
    expect(result.photo).toBe("[redacted]");
    expect(result.NOTE).toBe("[redacted]");
    expect(result.api_key).toBe("[redacted]");
    expect(result["API-KEY"]).toBe("[redacted]");
    expect(result.email).toBe("[redacted]");
    expect(result.latitude).toBe("[redacted]");
    expect(result.longitude).toBe("[redacted]");
    expect(result.displayName).toBe("[redacted]");
    expect((result.nested as Record<string, unknown>).transcript).toBe("[redacted]");
  });

  it("keeps token COUNTS — they are safe metrics", () => {
    const result = redactForTelemetry({
      estimatedTokens: 120,
      prompt_tokens: 42,
      token: "secret-value",
    }) as Record<string, unknown>;
    expect(result.estimatedTokens).toBe(120);
    expect(result.prompt_tokens).toBe(42);
    expect(result.token).toBe("[redacted]");
  });

  it("caps arrays at 20 items", () => {
    const result = redactForTelemetry(Array.from({ length: 50 }, (_, i) => i)) as number[];
    expect(result.length).toBe(20);
    expect(result[19]).toBe(19);
  });

  it("caps objects at 40 keys with a truncation marker", () => {
    const big: Record<string, number> = {};
    for (let i = 0; i < 60; i++) big[`key${i}`] = i;
    const result = redactForTelemetry(big) as Record<string, unknown>;
    const keys = Object.keys(result);
    expect(keys.length).toBe(41); // 40 kept + "…"
    expect(result["…"]).toBe("[truncated]");
  });

  it("stops at depth 4", () => {
    const deep = redactForTelemetry({ a: { b: { c: { d: { e: 1 } } } } }) as Record<
      string,
      Record<string, Record<string, Record<string, unknown>>>
    >;
    expect(deep.a.b.c.d).toBe("[redacted:depth]");
  });

  it("marks functions and symbols unserializable", () => {
    expect(redactForTelemetry(() => 1)).toBe("[redacted:unserializable]");
    expect(redactForTelemetry(Symbol("s"))).toBe("[redacted:unserializable]");
  });
});

describe("scalarAttributes", () => {
  it("keeps only scalars and applies the same redaction", () => {
    const result = scalarAttributes({
      adapter: "gemma-local",
      latencyMs: 812,
      ok: true,
      note: "private words",
      nested: { a: 1 },
      list: [1, 2],
      nothing: null,
      missing: undefined,
    });
    expect(result).toEqual({
      adapter: "gemma-local",
      latencyMs: 812,
      ok: true,
      note: "[redacted]",
    });
  });

  it("handles undefined input", () => {
    expect(scalarAttributes(undefined)).toEqual({});
  });
});

describe("redactSentryEvent", () => {
  it("strips request bodies, cookies and query strings", () => {
    const event = redactSentryEvent({
      request: {
        method: "GET",
        url: "https://terralens.app/api/analyze?key=secret&q=notes",
        headers: { cookie: "session=abc" },
        data: { note: "private" },
      },
    }) as { request: { method: string; url: string } };
    expect(event.request).toEqual({
      method: "GET",
      url: "https://terralens.app/api/analyze",
    });
  });

  it("keeps only the user id — email and username are dropped", () => {
    const event = redactSentryEvent({
      user: { id: "3d1f8a54-2c0e-4a9e-9c3a-6f2b1d4e5a6b", email: "a@b.c", username: "sam" },
    }) as { user: Record<string, unknown> };
    expect(event.user).toEqual({ id: "3d1f8a54-2c0e-4a9e-9c3a-6f2b1d4e5a6b" });
  });

  it("redacts extra, tags and contexts", () => {
    const event = redactSentryEvent({
      extra: { photoCount: 2, coordinates: "52.37,4.89" },
      tags: { story: "words" },
      contexts: { note: "content" },
    }) as Record<string, Record<string, unknown>>;
    expect(event.extra.photoCount).toBe(2);
    expect(event.extra.coordinates).toBe("[redacted]");
    expect(event.tags.story).toBe("[redacted]");
    expect(event.contexts.note).toBe("[redacted]");
  });

  it("does not mutate the input event", () => {
    const original = { extra: { email: "a@b.c" }, request: { url: "https://x?q=1" } };
    redactSentryEvent(original);
    expect(original.extra.email).toBe("a@b.c");
    expect(original.request.url).toBe("https://x?q=1");
  });

  it("tolerates missing sections", () => {
    const event = redactSentryEvent({ message: "boom" }) as Record<string, unknown>;
    expect(event.message).toBe("boom");
    expect(event.extra).toEqual({});
  });
});
