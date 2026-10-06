"use client";

/**
 * Network + sync state (spec §5, §27).
 *
 * `online` reflects the browser's connectivity signal; `serverReachable`
 * reflects an actual health check — the UI shows them separately because
 * "connected to Wi-Fi" is not the same as "the backend answers".
 */
import { create } from "zustand";

/**
 * Honest sync backend state.
 *  - "unknown":       not checked yet (or the check failed at transport level)
 *  - "configured":    the deployment has a real sync backend (it answered)
 *  - "not-configured": the deployment has no sync backend — ops stay queued
 *                      on-device and NOTHING is ever marked synced
 */
export type SyncBackendState = "unknown" | "configured" | "not-configured";

interface NetworkState {
  online: boolean;
  serverReachable: boolean | null;
  lastCheckedAt: string | null;
  /** Pending sync operations waiting in the IndexedDB queue. */
  pendingOps: number;
  syncing: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  /** Whether the deployment has a live sync backend (honest, never assumed). */
  syncBackend: SyncBackendState;
  /** Set true briefly after a reconnect so the UI can show "CONNECTIVITY RESTORED". */
  reconnectNotice: boolean;

  setOnline: (online: boolean) => void;
  setServerReachable: (reachable: boolean | null) => void;
  setPending: (n: number) => void;
  setSyncing: (syncing: boolean) => void;
  setLastSync: (at: string | null, error?: string | null) => void;
  setSyncBackend: (state: SyncBackendState) => void;
  clearReconnectNotice: () => void;
}

export const useNetworkStore = create<NetworkState>()((set, get) => ({
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  serverReachable: null,
  lastCheckedAt: null,
  pendingOps: 0,
  syncing: false,
  lastSyncAt: null,
  lastSyncError: null,
  syncBackend: "unknown",
  reconnectNotice: false,

  setOnline: (online) => {
    const wasOffline = !get().online;
    set({
      online,
      reconnectNotice: online && wasOffline,
      serverReachable: online ? get().serverReachable : false,
    });
  },
  setServerReachable: (serverReachable) =>
    set({ serverReachable, lastCheckedAt: new Date().toISOString() }),
  setPending: (pendingOps) => set({ pendingOps }),
  setSyncing: (syncing) => set({ syncing }),
  setLastSync: (at, error = null) => set({ lastSyncAt: at, lastSyncError: error }),
  setSyncBackend: (syncBackend) => set({ syncBackend }),
  clearReconnectNotice: () => set({ reconnectNotice: false }),
}));

/**
 * Probe the backend health endpoint. Never marks the server reachable when the
 * request fails — a null result means "not checked / not reachable yet".
 */
export async function checkServerHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch("/api/health", { signal: controller.signal, cache: "no-store" });
    clearTimeout(timeout);
    const ok = res.ok;
    useNetworkStore.getState().setServerReachable(ok);
    return ok;
  } catch {
    useNetworkStore.getState().setServerReachable(false);
    return false;
  }
}
