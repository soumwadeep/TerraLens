/**
 * One-shot geolocation helper for observation capture (spec §21, §43).
 *
 * Honest by design: returns null when permission is denied, unavailable, or
 * times out — never a fabricated position. APPROXIMATE mode deliberately
 * rounds coordinates to ~100 m before anything is stored.
 */
import type { ApproxLocation, LocationMode } from "@/lib/domain/types";

export type GeoCoords = { lat: number; lon: number; accuracyMeters: number | null };

export async function currentGeoCoords(timeoutMs = 8000): Promise<GeoCoords | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise<GeoCoords | null>((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracyMeters: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : null,
        });
      },
      () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, maximumAge: 30000, timeout: timeoutMs }
    );
  });
}

/** Round coordinates to the storage precision the user's mode allows. */
export function toApproxLocation(coords: GeoCoords, mode: LocationMode): ApproxLocation | null {
  if (mode === "NONE") return null;
  if (mode === "APPROXIMATE") {
    return {
      mode: "APPROXIMATE",
      lat: Math.round(coords.lat * 1000) / 1000,
      lon: Math.round(coords.lon * 1000) / 1000,
      accuracyMeters: null,
    };
  }
  return {
    mode: "PRECISE",
    lat: coords.lat,
    lon: coords.lon,
    accuracyMeters: coords.accuracyMeters,
  };
}
