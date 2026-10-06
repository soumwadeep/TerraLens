import { afterEach, describe, expect, it, vi } from "vitest";
import { currentGeoCoords, toApproxLocation, type GeoCoords } from "@/lib/media/geo";

const coords: GeoCoords = { lat: 52.3702157, lon: 4.8951679, accuracyMeters: 12 };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("toApproxLocation (spec §21, §43)", () => {
  it("returns null when the user's mode is NONE — nothing fabricated", () => {
    expect(toApproxLocation(coords, "NONE")).toBeNull();
  });

  it("rounds to ~100 m resolution in APPROXIMATE mode and drops accuracy", () => {
    const approx = toApproxLocation(coords, "APPROXIMATE");
    expect(approx).toEqual({
      mode: "APPROXIMATE",
      lat: 52.37,
      lon: 4.895,
      accuracyMeters: null,
    });
  });

  it("keeps full coordinates in PRECISE mode, including accuracy", () => {
    const precise = toApproxLocation(coords, "PRECISE");
    expect(precise).toEqual({
      mode: "PRECISE",
      lat: coords.lat,
      lon: coords.lon,
      accuracyMeters: 12,
    });
  });

  it("handles negative coordinates in APPROXIMATE mode", () => {
    const approx = toApproxLocation(
      { lat: -33.86882, lon: 151.20929, accuracyMeters: null },
      "APPROXIMATE"
    );
    expect(approx?.lat).toBe(-33.869);
    expect(approx?.lon).toBe(151.209);
  });
});

describe("currentGeoCoords", () => {
  it("resolves null when the browser has no geolocation", async () => {
    vi.stubGlobal("navigator", {});
    await expect(currentGeoCoords()).resolves.toBeNull();
  });

  it("resolves coordinates from a granted permission", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({
            coords: { latitude: 52.37, longitude: 4.895, accuracy: 12 },
          } as GeolocationPosition),
      },
    });
    await expect(currentGeoCoords()).resolves.toEqual({
      lat: 52.37,
      lon: 4.895,
      accuracyMeters: 12,
    });
  });

  it("normalises a non-finite accuracy to null", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({
            coords: { latitude: 1, longitude: 2, accuracy: Number.NaN },
          } as GeolocationPosition),
      },
    });
    const result = await currentGeoCoords();
    expect(result?.accuracyMeters).toBeNull();
  });

  it("resolves null when permission is denied — never a guess", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (_ok: PositionCallback, fail?: PositionErrorCallback) =>
          fail?.({
            code: 1,
            message: "denied",
          } as GeolocationPositionError),
      },
    });
    await expect(currentGeoCoords()).resolves.toBeNull();
  });

  it("resolves null on timeout instead of hanging", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: () => {
          /* never calls back — simulates a silent device */
        },
      },
    });
    const promise = currentGeoCoords(1000);
    await vi.advanceTimersByTimeAsync(1600);
    await expect(promise).resolves.toBeNull();
  });
});
