import { describe, expect, it } from "vitest";
import { formatRatio, natureScreenRatio, RATIO_EXPLANATION } from "@/lib/scoring/ratio";

describe("natureScreenRatio", () => {
  it("computes outdoor ÷ screen rounded to one decimal", () => {
    expect(natureScreenRatio(900, 300).ratio).toBe(3);
  });

  it("floors screen time at 60 s so near-zero interaction cannot produce vanity ratios", () => {
    const result = natureScreenRatio(3600, 2);
    expect(result.screenActiveSeconds).toBe(60);
    expect(result.ratio).toBe(60);
  });

  it("never lets outdoor time go negative", () => {
    const result = natureScreenRatio(-500, 600);
    expect(result.outdoorSeconds).toBe(0);
    expect(result.ratio).toBe(0);
  });

  it("rounds fractional screen seconds", () => {
    expect(natureScreenRatio(600, 299.6).screenActiveSeconds).toBe(300);
  });

  it("always reports itself as an estimate", () => {
    expect(natureScreenRatio(100, 100).estimated).toBe(true);
  });
});

describe("formatRatio", () => {
  it("shows one decimal below 100×", () => {
    expect(formatRatio(3)).toBe("3.0×");
    expect(formatRatio(12.34)).toBe("12.3×");
  });

  it("shows whole numbers at 100× and above", () => {
    expect(formatRatio(100)).toBe("100×");
    expect(formatRatio(142.7)).toBe("143×");
  });
});

describe("RATIO_EXPLANATION", () => {
  it("explicitly denies being OS-wide screen time", () => {
    expect(RATIO_EXPLANATION).toContain("not OS-wide screen time");
  });
});
