/**
 * Sync enqueue helper (spec §5, §40).
 *
 * Every live entity change queues an idempotent operation (entity id = UUID,
 * carried in the payload). Demo-origin data NEVER enqueues — the sync engine
 * must never see it. When local storage is unavailable the enqueue degrades
 * quietly (the entity simply stays "local-only"), because the app still works
 * in the degraded in-memory mode.
 */
import { syncQueueRepository } from "@/lib/db/repositories";
import { kickSync } from "@/lib/sync/engine";
import type { SyncEntityType, SyncOperationName, SyncStatus } from "@/lib/domain/types";

export interface QueueSyncInput {
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperationName;
  origin?: "live" | "demo";
  payload?: Record<string, unknown>;
}

/**
 * Queue an operation and return the sync status the entity should carry.
 * Never throws — sync bookkeeping must not break the offline-first writes.
 */
export async function queueForSync(input: QueueSyncInput): Promise<SyncStatus> {
  if ((input.origin ?? "live") === "demo") return "local-only";
  try {
    await syncQueueRepository.enqueue({
      entityType: input.entityType,
      entityId: input.entityId,
      operation: input.operation,
      origin: input.origin ?? "live",
      payload: input.payload,
    });
    // Nudge the engine: if online it drains soon; the queue is the source of
    // truth, so a dropped nudge self-heals on the next interval.
    kickSync();
    return "queued";
  } catch {
    return "local-only";
  }
}
