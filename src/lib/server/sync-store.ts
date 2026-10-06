/**
 * Cloud sync store (spec §5, §40) — server-only.
 *
 * Applies a batch of queued client operations to MongoDB and returns one
 * outcome per operation. The honesty rules:
 *
 *  - Every entity is re-validated server-side with the same zod schema the
 *    client uses. A payload that fails validation is an `error` result — it is
 *    never stored and never silently dropped.
 *  - `ok` means the document was really written. `conflict` means the stored
 *    copy is newer than the incoming snapshot (last-write-wins by `updatedAt`,
 *    and the client is told the truth so it can surface it). `error` means the
 *    operation was rejected or storage failed; the client retries with backoff.
 *  - Media bytes are never accepted — UPLOAD_MEDIA has no meaning in this
 *    deployment and is answered with an explicit error, not a pretend success.
 *  - Operations are idempotent: entity ids are client UUIDs and writes are
 *    upserts, so a replayed batch converges to the same state.
 */
import { z } from "zod";
import type { Db } from "mongodb";
import {
  ExpeditionSchema,
  GrassScoreSchema,
  MediaAssetSchema,
  MissionSchema,
  ObservationSchema,
  SYNC_ENTITY_TYPES,
  SyncOperationNameSchema,
  UserPreferencesSchema,
} from "@/lib/domain/types";
import type { SyncEntityType } from "@/lib/domain/types";

export const WireOperationSchema = z.object({
  id: z.uuid(),
  entityId: z.uuid(),
  entityType: z.enum(SYNC_ENTITY_TYPES),
  operation: SyncOperationNameSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().min(1).max(64),
});
export type WireOperation = z.infer<typeof WireOperationSchema>;

export const SyncBatchSchema = z.object({
  userId: z.uuid(),
  operations: z.array(WireOperationSchema).min(1).max(50),
});
export type SyncBatch = z.infer<typeof SyncBatchSchema>;

export interface SyncOpOutcome {
  id: string;
  status: "ok" | "conflict" | "error";
  detail: string | null;
}

/** Stored entities keep the client UUID as `_id` — never an ObjectId. */
interface StoredEntity extends Record<string, unknown> {
  _id: string;
}

interface EntityTarget {
  collection: string;
  schema: z.ZodType<{ id: string; userId: string; updatedAt: string }>;
}

const ENTITY_TARGETS: Record<SyncEntityType, EntityTarget | null> = {
  expedition: {
    collection: "expeditions",
    schema: ExpeditionSchema as unknown as EntityTarget["schema"],
  },
  mission: { collection: "missions", schema: MissionSchema as unknown as EntityTarget["schema"] },
  observation: {
    collection: "observations",
    schema: ObservationSchema as unknown as EntityTarget["schema"],
  },
  media: {
    collection: "mediaAssets",
    schema: MediaAssetSchema as unknown as EntityTarget["schema"],
  },
  grassScore: {
    collection: "grassScores",
    schema: GrassScoreSchema as unknown as EntityTarget["schema"],
  },
  preferences: {
    collection: "userPreferences",
    schema: UserPreferencesSchema as unknown as EntityTarget["schema"],
  },
};

function error(id: string, detail: string): SyncOpOutcome {
  return { id, status: "error", detail };
}

async function applyOne(db: Db, userId: string, op: WireOperation): Promise<SyncOpOutcome> {
  if (op.operation === "UPLOAD_MEDIA") {
    return error(
      op.id,
      "Media bytes are never uploaded by this deployment — photos and audio stay on-device."
    );
  }

  const target = ENTITY_TARGETS[op.entityType];
  if (!target) return error(op.id, `Unknown entity type "${op.entityType}".`);

  const collection = db.collection<StoredEntity>(target.collection);

  if (op.operation === "DELETE") {
    const res = await collection.deleteOne({ _id: op.entityId, userId });
    return {
      id: op.id,
      status: "ok",
      detail: res.deletedCount > 0 ? "Deleted." : "Already absent.",
    };
  }

  if (Object.keys(op.payload).length === 0) {
    return error(op.id, "Operation carries no entity snapshot — nothing to store.");
  }

  const parsed = target.schema.safeParse({ ...op.payload, id: op.entityId });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join(".") ?? "payload";
    return error(op.id, `Snapshot failed validation (${where}: ${issue?.message ?? "invalid"}).`);
  }

  const { syncStatus: _syncStatus, ...entity } = parsed.data as Record<string, unknown> & {
    syncStatus?: unknown;
  };
  const entityUserId = entity.userId;
  if (entityUserId !== userId) {
    return error(
      op.id,
      "Entity belongs to a different user id than the batch — refusing to store."
    );
  }

  const incomingUpdatedAt = String(entity.updatedAt);
  const existing = await collection.findOne(
    { _id: op.entityId },
    { projection: { userId: 1, updatedAt: 1 } }
  );
  if (existing) {
    if (existing.userId !== userId) {
      return error(op.id, "This entity id already belongs to another account on the server.");
    }
    const storedUpdatedAt = typeof existing.updatedAt === "string" ? existing.updatedAt : null;
    if (storedUpdatedAt !== null && storedUpdatedAt > incomingUpdatedAt) {
      return {
        id: op.id,
        status: "conflict",
        detail: "The server copy is newer than this snapshot — the stored copy was kept.",
      };
    }
  }

  await collection.replaceOne(
    { _id: op.entityId },
    { ...entity, _id: op.entityId, userId, serverReceivedAt: new Date().toISOString() },
    { upsert: true }
  );
  return { id: op.id, status: "ok", detail: null };
}

/**
 * Apply a validated batch. Storage-level failures surface per operation as
 * `error` results (the client retries them with backoff) — they are never
 * masked as success.
 */
export async function applySyncBatch(
  db: Db,
  userId: string,
  operations: WireOperation[]
): Promise<SyncOpOutcome[]> {
  const outcomes: SyncOpOutcome[] = [];
  for (const op of operations) {
    try {
      outcomes.push(await applyOne(db, userId, op));
    } catch (cause) {
      const detail =
        cause instanceof Error && cause.message.includes("E11000")
          ? "A record with the same user, scope, and day already exists on the server."
          : "The storage backend rejected this operation.";
      outcomes.push(error(op.id, detail));
    }
  }
  return outcomes;
}
