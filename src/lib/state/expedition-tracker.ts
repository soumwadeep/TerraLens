/**
 * Expedition tracker — module-scoped, framework-free (spec §16).
 *
 * Runs while an expedition is ACTIVE and turns wall-clock time into honest
 * stats:
 *
 *   - every 5 s tick adds the real elapsed delta to `elapsedSeconds`;
 *   - the delta is attributed to `pocketSeconds` when the app was hidden
 *     (visibility API) or when the gap is large (tab discarded / reload /
 *     phone pocketed between sessions) — otherwise to `screenActiveSeconds`;
 *   - each hide event increments `interruptions` (anti-gaming input);
 *   - GPS fixes accumulate `distanceMeters` with a jitter floor (>10 m) and
 *     poor-accuracy rejection. Distance stays `null` when permission is
 *     denied — never an invented zero;
 *   - flushes on pagehide/visibilitychange so a closed tab loses nothing.
 *
 * The tracker owns no persistence: it reports snapshots through callbacks and
 * the expedition store decides when to write (throttled + on flush).
 */
import type { ExpeditionStats, LocationMode } from "@/lib/domain/types";
import { haversineMeters } from "@/lib/media/capture";

const TICK_MS = 5000;
/** A gap larger than this can't be screen time — the app was away. */
const GAP_POCKET_THRESHOLD_S = 20;
/** GPS jitter floor: deltas under this are noise, not walking. */
const MIN_GPS_DELTA_M = 10;
/** Fixes worse than this are discarded entirely. */
const MAX_GPS_ACCURACY_M = 60;

export interface TrackerCallbacks {
  /** In-memory update every tick (cheap; drives the live stats UI). */
  onTick: (stats: ExpeditionStats) => void;
  /** Timely update that must be persisted (hidden / pagehide / stop). */
  onFlush: (stats: ExpeditionStats) => void;
}

interface TrackerState {
  expeditionId: string;
  stats: ExpeditionStats;
  callbacks: TrackerCallbacks;
  locationMode: LocationMode;
  lastTickAt: number;
  tickHandle: number | null;
  watchHandle: number | null;
  hiddenHandle: (() => void) | null;
  pageHideHandle: (() => void) | null;
  lastFix: { lat: number; lon: number } | null;
}

let state: TrackerState | null = null;

function attribute(stats: ExpeditionStats, deltaS: number, pocket: boolean): ExpeditionStats {
  const delta = Math.max(0, deltaS);
  return {
    ...stats,
    elapsedSeconds: stats.elapsedSeconds + delta,
    pocketSeconds: stats.pocketSeconds + (pocket ? delta : 0),
    screenActiveSeconds: stats.screenActiveSeconds + (pocket ? 0 : delta),
    lastStatsAt: new Date().toISOString(),
  };
}

function tick(): void {
  if (!state) return;
  const now = Date.now();
  const deltaS = (now - state.lastTickAt) / 1000;
  state.lastTickAt = now;
  const pocketWhenHidden = typeof document !== "undefined" && document.visibilityState === "hidden";
  const pocket = pocketWhenHidden || deltaS > GAP_POCKET_THRESHOLD_S;
  state.stats = attribute(state.stats, deltaS, pocket);
  state.callbacks.onTick(state.stats);
}

function flush(): ExpeditionStats | null {
  if (!state) return null;
  tick();
  state.callbacks.onFlush(state.stats);
  return state.stats;
}

function startGpsWatch(expeditionId: string, mode: LocationMode): number | null {
  if (mode === "NONE" || typeof navigator === "undefined" || !navigator.geolocation) {
    return null;
  }
  try {
    return navigator.geolocation.watchPosition(
      (position) => {
        if (!state || state.expeditionId !== expeditionId) return;
        const accuracy = position.coords.accuracy;
        if (Number.isFinite(accuracy) && accuracy > MAX_GPS_ACCURACY_M) return;
        const fix = { lat: position.coords.latitude, lon: position.coords.longitude };
        if (state.lastFix) {
          const delta = haversineMeters(state.lastFix, fix);
          if (delta >= MIN_GPS_DELTA_M) {
            state.stats = {
              ...state.stats,
              distanceMeters: (state.stats.distanceMeters ?? 0) + delta,
            };
          }
        }
        state.lastFix = fix;
      },
      () => {
        // Permission denied / unavailable: distance stays null — honest zero.
      },
      { enableHighAccuracy: mode === "PRECISE", maximumAge: 5000, timeout: 20000 }
    );
  } catch {
    return null;
  }
}

/**
 * Start (or re-attach to) the tracker for an expedition. Calling it again for
 * the same expedition only refreshes the callbacks — timers are not doubled.
 */
export function startTracker(opts: {
  expeditionId: string;
  stats: ExpeditionStats;
  locationMode: LocationMode;
  callbacks: TrackerCallbacks;
}): void {
  if (typeof window === "undefined") return;
  if (state && state.expeditionId === opts.expeditionId) {
    state.callbacks = opts.callbacks;
    state.locationMode = opts.locationMode;
    return;
  }
  stopTracker();

  // A reload / cold start after a long gap means the phone was away: the
  // persisted `lastStatsAt` lets us attribute the missing span to pocket time
  // instead of silently dropping it.
  let initialStats = opts.stats;
  const persistedAt = opts.stats.lastStatsAt ? Date.parse(opts.stats.lastStatsAt) : NaN;
  if (Number.isFinite(persistedAt)) {
    const gapS = (Date.now() - persistedAt) / 1000;
    if (gapS > GAP_POCKET_THRESHOLD_S) {
      initialStats = attribute(initialStats, gapS, true);
    }
  }

  state = {
    expeditionId: opts.expeditionId,
    stats: initialStats,
    callbacks: opts.callbacks,
    locationMode: opts.locationMode,
    lastTickAt: Date.now(),
    tickHandle: null,
    watchHandle: null,
    hiddenHandle: null,
    pageHideHandle: null,
    lastFix: null,
  };

  state.tickHandle = window.setInterval(tick, TICK_MS);

  state.hiddenHandle = () => {
    if (!state) return;
    if (document.visibilityState === "hidden") {
      state.stats = { ...state.stats, interruptions: state.stats.interruptions + 1 };
    }
    flush();
  };
  document.addEventListener("visibilitychange", state.hiddenHandle);

  state.pageHideHandle = () => {
    flush();
  };
  window.addEventListener("pagehide", state.pageHideHandle);

  state.watchHandle = startGpsWatch(opts.expeditionId, opts.locationMode);
}

/** Flush the final delta and return the snapshot, keeping the tracker alive. */
export function flushTracker(): ExpeditionStats | null {
  return flush();
}

/** Stop the tracker, returning the final stats snapshot. */
export function stopTracker(): ExpeditionStats | null {
  if (!state) return null;
  const final = flush();
  if (state.tickHandle !== null) window.clearInterval(state.tickHandle);
  if (state.watchHandle !== null) navigator.geolocation?.clearWatch(state.watchHandle);
  if (state.hiddenHandle) document.removeEventListener("visibilitychange", state.hiddenHandle);
  if (state.pageHideHandle) window.removeEventListener("pagehide", state.pageHideHandle);
  state = null;
  return final;
}

export function isTrackerRunning(expeditionId?: string): boolean {
  if (!state) return false;
  return expeditionId === undefined || state.expeditionId === expeditionId;
}
