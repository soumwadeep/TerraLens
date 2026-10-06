/**
 * Nature / Screen Ratio (spec §17).
 *
 *   estimated outdoor exploration time  ÷  active application interaction time
 *
 * Higher is better. This is an estimate based on in-app activity (the
 * visibility API and interaction tracking in this app), NOT OS-wide screen
 * time — the UI must always say so.
 */

export interface NatureScreenRatio {
  /** Ratio value; screen time is floored at 60 s to keep the number meaningful. */
  ratio: number;
  outdoorSeconds: number;
  screenActiveSeconds: number;
  estimated: true;
}

export function natureScreenRatio(
  outdoorSeconds: number,
  screenActiveSeconds: number
): NatureScreenRatio {
  const outdoor = Math.max(0, outdoorSeconds);
  // Floor screen time at one minute: sub-minute interaction is rounding noise,
  // and dividing by ~0 would produce absurd vanity ratios.
  const screen = Math.max(60, Math.round(screenActiveSeconds));
  return {
    ratio: Math.round((outdoor / screen) * 10) / 10,
    outdoorSeconds: outdoor,
    screenActiveSeconds: screen,
    estimated: true,
  };
}

export function formatRatio(ratio: number): string {
  if (ratio >= 100) return `${Math.round(ratio)}×`;
  return `${ratio.toFixed(1)}×`;
}

export const RATIO_EXPLANATION =
  "Estimated from the time this app spent outdoors versus in your hands — not OS-wide screen time.";
