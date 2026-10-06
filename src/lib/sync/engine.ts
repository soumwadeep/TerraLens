"use client";

/**
 * Sync engine driver (spec §5, §27, §40, §41).
 *
 * Drains the on-device sync queue against this deployment's sync backend
 * (`/api/sync`). The honesty rules that shape every branch of this file:
 *
 *  - An operation is marked SYNCED only after the backend acknowledged it.
 *  - When the deployment has no sync backend, operations stay QUEUED and the
 *    UI is told "Not configured" — nothing is ever pretended.
 *  - A failed attempt never loses the operation: attempts/backoff are recorded
 *    and it is retried later.
 *  - Demo-origin operations are never sent anywhere (defensive second gate —
 *    the enqueue path already blocks them).
 *
 * Idempotency comes from the data model itself: entity ids are client UUIDs,
 * so the backend upserts by id and replayed operations are harmless.
 */
import { useAppStore } from "@/lib/state/app-store";
import { useNetworkStore } from "@/lib/state/network-store";
import {
  expeditionRepository,
  mediaRepository,
  missionRepository,
  observationRepository,
  syncEventRepository,
  syncQueueRepository,
} from "@/lib/db/repositories";
import type {
  SyncEntityType,
  SyncEvent,
  SyncOperation,
  SyncOperationName,
} from "@/lib/domain/types";
import { nowIso } from "@/lib/utils";

const BASE_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 10 * 60_000;
const DRAIN_INTERVAL_MS = 30_000;
/** While the backend is known absent, re-probe at most this often. */
const NOT_CONFIGURED_REPROBE_MS = 120_000;
const PROBE_TIMEOUT_MS = 6_000;
const PUSH_TIMEOUT_MS = 20_000;
const BATCH_LIMIT = 25;

// ---------------------------------------------------------------------------
// Wire contract with /api/sync
//
//   POST { userId, operations: WireOperation[] }
//     → { configured: false, note }                          no backend
//     → { configured: true, results: [{ id, status, detail }] } stored
// ---------------------------------------------------------------------------

interface WireOperation {
  id: string;
  entityId: string;
  entityType: SyncEntityType;
  operation: SyncOperationName;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface ParsedResult {
  status: "ok" | "conflict" | "error";
  detail: string | null;
}

function toWire(op: SyncOperation): WireOperation {
  return {
    id: op.id,
    entityId: op.entityId,
    entityType: op.entityType,
    operation: op.operation,
    payload: op.payload,
    createdAt: op.createdAt,
  };
}

function parseResults(body: unknown): Map<string, ParsedResult> {
  const out = new Map<string, ParsedResult>();
  if (body === null || typeof body !== "object") return out;
  const results = (body as { results?: unknown }).results;
  if (!Array.isArray(results)) return out;
  for (const item of results) {
    if (item === null || typeof item !== "object") continue;
    const { id, status, detail } = item as { id?: unknown; status?: unknown; detail?: unknown };
    if (typeof id !== "string") continue;
    if (status !== "ok" && status !== "conflict" && status !== "error") continue;
    out.set(id, { status, detail: typeof detail === "string" ? detail : null });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bookkeeping helpers
// ---------------------------------------------------------------------------

function backoffMs(attempts: number): number {
  const exp = Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
  return Math.round(exp * (1 + Math.random() * 0.25));
}

async function refreshQueueCounts(): Promise<void> {
  try {
    useNetworkStore.getState().setPending(await syncQueueRepository.pendingCount());
  } catch {
    /* storage unavailable — the badge simply keeps its last value */
  }
}

async function logEvent(
  kind: SyncEvent["kind"],
  detail: string,
  operations: number
): Promise<void> {
  const userId = useAppStore.getState().user?.id;
  if (!userId) return;
  try {
    await syncEventRepository.add({
      userId,
      expeditionId: null,
      kind,
      detail: detail.slice(0, 500),
      operations,
    });
  } catch {
    /* diagnostics are best-effort and must never break syncing */
  }
}

async function penalize(op: SyncOperation, detail: string): Promise<void> {
  const attempts = op.attempts + 1;
  try {
    await syncQueueRepository.save({
      ...op,
      attempts,
      lastAttempt: nowIso(),
      nextAttemptAt: new Date(Date.now() + backoffMs(attempts)).toISOString(),
      status: "FAILED",
      lastError: detail.slice(0, 500),
    });
  } catch {
    /* storage unavailable — the op stays as-is and is simply retried later */
  }
}

async function penalizeAll(ops: SyncOperation[], detail: string): Promise<void> {
  for (const op of ops) await penalize(op, detail);
}

/**
 * Flip an entity to "synced" after the backend acknowledged its operation.
 * Skipped when the entity changed locally after the operation was queued —
 * a newer local mutation has its own queued operation and must not be
 * overwritten as "synced".
 */
async function markEntitySynced(op: SyncOperation): Promise<void> {
  try {
    if (op.entityType === "expedition") {
      const entity = await expeditionRepository.get(op.entityId);
      if (entity && entity.syncStatus !== "synced" && entity.updatedAt <= op.createdAt) {
        await expeditionRepository.save({ ...entity, syncStatus: "synced" });
      }
    } else if (op.entityType === "mission") {
      const entity = await missionRepository.get(op.entityId);
      if (entity && entity.syncStatus !== "synced" && entity.updatedAt <= op.createdAt) {
        await missionRepository.save({ ...entity, syncStatus: "synced" });
      }
    } else if (op.entityType === "observation") {
      const entity = await observationRepository.get(op.entityId);
      if (entity && entity.syncStatus !== "synced" && entity.updatedAt <= op.createdAt) {
        await observationRepository.save({ ...entity, syncStatus: "synced" });
      }
    } else if (op.entityType === "media" && op.operation === "UPLOAD_MEDIA") {
      const asset = await mediaRepository.getAsset(op.entityId);
      if (asset && asset.uploadedAt === null) {
        await mediaRepository.saveAsset({
          ...asset,
          storage: "cloud",
          uploadedAt: nowIso(),
        });
      }
    }
    // grassScore / preferences carry no per-record syncStatus — removing the
    // operation from the queue is the acknowledgement.
  } catch {
    /* metadata refresh is best-effort; the operation was still synced */
  }
}

/** Second line of defense: demo-origin operations must never leave the device. */
async function purgeDemoOps(): Promise<void> {
  try {
    const all = await syncQueueRepository.all();
    for (const op of all) {
      if (op.origin === "demo") {
        console.warn("[sync] removing demo-origin operation from queue:", op.id);
        await syncQueueRepository.remove(op.id);
      }
    }
  } catch {
    /* storage unavailable — nothing to purge */
  }
}

// ---------------------------------------------------------------------------
// Backend probe
// ---------------------------------------------------------------------------

let lastNotConfiguredProbeAt = 0;

export type SyncBackendProbeResult = "configured" | "not-configured" | "unreachable";

/**
 * Ask the deployment whether it has a real sync backend. The result is
 * recorded in the network store — "configured" here means the route answered,
 * which is the strongest claim a probe can honestly make.
 */
export async function probeSyncBackend(): Promise<SyncBackendProbeResult> {
  const store = useNetworkStore.getState();
  try {
    const res = await fetch("/api/sync", {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    store.setServerReachable(true);
    if (res.status === 404 || res.status === 405 || res.status === 501) {
      store.setSyncBackend("not-configured");
      lastNotConfiguredProbeAt = Date.now();
      return "not-configured";
    }
    if (!res.ok) {
      // The route exists and answered — the POST will surface the real error.
      store.setSyncBackend("configured");
      return "configured";
    }
    const body = (await res.json().catch(() => null)) as { configured?: unknown } | null;
    if (body && body.configured === false) {
      store.setSyncBackend("not-configured");
      lastNotConfiguredProbeAt = Date.now();
      return "not-configured";
    }
    store.setSyncBackend("configured");
    return "configured";
  } catch {
    store.setServerReachable(false);
    store.setSyncBackend("unknown");
    return "unreachable";
  }
}

// ---------------------------------------------------------------------------
// Drain
// ---------------------------------------------------------------------------

let drainPromise: Promise<void> | null = null;
let kickQueued = false;
let stopFn: (() => void) | null = null;

/**
 * Request a drain now. Single-flight: if a drain is running, exactly one
 * follow-up drain is queued so a burst of writes cannot pile up timelines.
 */
export function kickSync(): void {
  if (typeof window === "undefined") return;
  if (drainPromise) {
    kickQueued = true;
    return;
  }
  drainPromise = drain()
    .catch(() => undefined)
    .finally(() => {
      drainPromise = null;
      if (kickQueued) {
        kickQueued = false;
        kickSync();
      }
    });
}

async function drain(): Promise<void> {
  const net = useNetworkStore.getState();
  if (!net.online) {
    await refreshQueueCounts();
    return;
  }

  // Operations carry entity snapshots and belong to the local user identity.
  // Without an identity (mid-onboarding) there is nothing to attribute them
  // to — wait, with zero penalty, rather than sending anonymous writes.
  const userId = useAppStore.getState().user?.id ?? null;
  if (!userId) {
    await refreshQueueCounts();
    return;
  }

  await purgeDemoOps();
  await refreshQueueCounts();

  const ready = await syncQueueRepository.ready(nowIso()).then((ops) => ops.slice(0, BATCH_LIMIT));
  if (ready.length === 0) return;

  // While the backend is known absent, probe at a slower cadence.
  if (
    useNetworkStore.getState().syncBackend === "not-configured" &&
    Date.now() - lastNotConfiguredProbeAt < NOT_CONFIGURED_REPROBE_MS
  ) {
    return;
  }

  const backend = await probeSyncBackend();
  if (backend === "not-configured") {
    // Ops stay QUEUED with no attempt penalty: nothing was wrong with them,
    // the deployment simply has nowhere to send them yet.
    return;
  }
  if (backend === "unreachable") {
    const detail = "No sync backend answered — the operations will be retried.";
    await penalizeAll(ready, detail);
    await logEvent("sync-failed", detail, ready.length);
    useNetworkStore.getState().setLastSync(null, detail);
    await refreshQueueCounts();
    return;
  }

  const store = useNetworkStore.getState();
  store.setSyncing(true);
  await logEvent("sync-start", `Pushing ${ready.length} queued operation(s).`, ready.length);

  let synced = 0;
  let failed = 0;
  let conflicts = 0;
  let transportError: string | null = null;

  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, operations: ready.map(toWire) }),
      cache: "no-store",
      signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
    });

    if (!res.ok) {
      transportError = `Sync backend responded HTTP ${res.status}.`;
      await penalizeAll(ready, transportError);
      failed = ready.length;
    } else {
      const body: unknown = await res.json().catch(() => null);
      if (
        body !== null &&
        typeof body === "object" &&
        (body as { configured?: unknown }).configured === false
      ) {
        // Backend exists but is not configured — same honesty as the probe.
        store.setSyncBackend("not-configured");
        lastNotConfiguredProbeAt = Date.now();
        return;
      }

      const results = parseResults(body);
      for (const op of ready) {
        const result = results.get(op.id);
        if (!result) {
          await penalize(op, "The sync backend returned no result for this operation.");
          failed += 1;
          continue;
        }
        if (result.status === "ok") {
          await markEntitySynced(op);
          await syncQueueRepository.remove(op.id);
          synced += 1;
        } else if (result.status === "conflict") {
          await syncQueueRepository.save({
            ...op,
            status: "CONFLICT",
            lastAttempt: nowIso(),
            lastError: result.detail ?? "Conflict reported by the sync backend.",
          });
          conflicts += 1;
        } else {
          await penalize(op, result.detail ?? "The sync backend rejected this operation.");
          failed += 1;
        }
      }
    }
  } catch {
    transportError = "Sync request failed — the connection dropped mid-flight.";
    await penalizeAll(ready, transportError);
    failed = ready.length;
  } finally {
    store.setSyncing(false);
  }

  if (synced > 0 || failed > 0 || conflicts > 0) {
    await logEvent("sync-complete", `Synced ${synced} operation(s).`, synced);
  }
  if (conflicts > 0) {
    await logEvent(
      "conflict",
      `${conflicts} operation(s) conflict with the server copy.`,
      conflicts
    );
  }
  if (failed > 0) {
    await logEvent("sync-failed", `${failed} operation(s) failed and will be retried.`, failed);
  }

  const parts: string[] = [];
  if (failed > 0) parts.push(`${failed} failed — retrying with backoff`);
  if (conflicts > 0) parts.push(`${conflicts} conflict${conflicts > 1 ? "s" : ""} need attention`);
  useNetworkStore.getState().setLastSync(nowIso(), parts.length > 0 ? parts.join("; ") : null);

  await refreshQueueCounts();

  // A full batch means there is likely more waiting — continue immediately.
  if (ready.length === BATCH_LIMIT && failed === 0 && conflicts === 0) {
    await logEvent("sync-complete", "More operations remain — continuing.", 0);
    kickSync();
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Start the sync engine: drain now, whenever connectivity returns, when the
 * tab becomes visible again, and on a steady interval. Returns a stop
 * function (idempotent start; safe under HMR).
 */
export function startSyncEngine(): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (stopFn) return stopFn;

  const unsubNetwork = useNetworkStore.subscribe((state, prev) => {
    if (state.online && !prev.online) {
      void logEvent("reconnect", "Connection restored — syncing queued changes.", 0);
      kickSync();
    } else if (state.serverReachable === true && prev.serverReachable !== true) {
      kickSync();
    }
  });

  const onVisible = () => {
    if (document.visibilityState === "visible") kickSync();
  };
  document.addEventListener("visibilitychange", onVisible);
  const interval = window.setInterval(() => kickSync(), DRAIN_INTERVAL_MS);

  void refreshQueueCounts();
  kickSync();

  stopFn = () => {
    unsubNetwork();
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(interval);
    stopFn = null;
  };
  return stopFn;
}
