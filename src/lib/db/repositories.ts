/**
 * IndexedDB repositories (spec §5, §44).
 *
 * Every read and write validates through the Zod domain schema, so corrupt or
 * legacy records can never leak into the app as untyped objects. Components and
 * state stores depend on these repositories — never on `idb` directly.
 */
import type { IDBPDatabase } from "idb";
import { z } from "zod";
import {
  getDB,
  ALL_STORES,
  type IndexName,
  type MediaBlobRecord,
  type StoreName,
  type TerraLensDB,
} from "@/lib/db/schema";
import {
  ExpeditionSchema,
  GrassScoreEventSchema,
  GrassScoreSchema,
  KnowledgeRecordSchema,
  MediaAssetSchema,
  MemoryRecordSchema,
  MissionSchema,
  ObservationSchema,
  SyncEventSchema,
  SyncOperationSchema,
  UserPreferencesSchema,
  AgentTraceSchema,
  type Expedition,
  type GrassScore,
  type GrassScoreEvent,
  type KnowledgeRecord,
  type MediaAsset,
  type MemoryRecord,
  type Mission,
  type Observation,
  type SyncEvent,
  type SyncOperation,
  type UserPreferences,
  type AgentTrace,
  type SyncEntityType,
  type SyncOperationName,
} from "@/lib/domain/types";
import { uuid } from "@/lib/utils";

async function withDb<T>(fn: (db: IDBPDatabase<TerraLensDB>) => Promise<T>): Promise<T> {
  const db = await getDB();
  return fn(db);
}

/** Validating accessor for whole-store reads. */
async function readAll<T>(store: StoreName, schema: z.ZodType<T>): Promise<T[]> {
  const raw = await withDb((db) => db.getAll(store));
  const out: T[] = [];
  for (const item of raw) {
    const parsed = schema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

async function readByIndex<T>(
  store: StoreName,
  index: IndexName,
  key: string,
  schema: z.ZodType<T>
): Promise<T[]> {
  const raw = await withDb<unknown[]>((db) =>
    // idb requires a concrete store literal to resolve index names; this is the
    // single place the type is relaxed, and callers pass declared indexes only.
    (
      db as unknown as {
        getAllFromIndex(storeName: string, indexName: string, query: string): Promise<unknown[]>;
      }
    ).getAllFromIndex(store, index, key)
  );
  const out: T[] = [];
  for (const item of raw) {
    const parsed = schema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export const preferencesRepository = {
  async get(userId: string): Promise<UserPreferences | null> {
    const raw = await withDb((db) => db.get("userPreferences", userId));
    if (!raw) return null;
    const parsed = UserPreferencesSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  },
  async save(prefs: UserPreferences): Promise<UserPreferences> {
    const value = UserPreferencesSchema.parse(prefs);
    await withDb((db) => db.put("userPreferences", value));
    return value;
  },
  async all(): Promise<UserPreferences[]> {
    return readAll("userPreferences", UserPreferencesSchema);
  },
};

// ---------------------------------------------------------------------------
// Expeditions
// ---------------------------------------------------------------------------

export const expeditionRepository = {
  async get(id: string): Promise<Expedition | null> {
    const raw = await withDb((db) => db.get("expeditions", id));
    if (!raw) return null;
    const parsed = ExpeditionSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  },
  async save(expedition: Expedition): Promise<Expedition> {
    const value = ExpeditionSchema.parse(expedition);
    await withDb((db) => db.put("expeditions", value));
    return value;
  },
  async all(): Promise<Expedition[]> {
    const all = await readAll("expeditions", ExpeditionSchema);
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async byStatus(status: Expedition["status"]): Promise<Expedition[]> {
    return readByIndex("expeditions", "by-status", status, ExpeditionSchema);
  },
  async active(): Promise<Expedition | null> {
    const actives = await readByIndex("expeditions", "by-status", "ACTIVE", ExpeditionSchema);
    if (actives.length === 0) return null;
    return actives.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  },
  async byDateKey(dateKey: string): Promise<Expedition[]> {
    return readByIndex("expeditions", "by-dateKey", dateKey, ExpeditionSchema);
  },
  async delete(id: string): Promise<void> {
    await withDb((db) => db.delete("expeditions", id));
  },
};

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

export const missionRepository = {
  async get(id: string): Promise<Mission | null> {
    const raw = await withDb((db) => db.get("missions", id));
    if (!raw) return null;
    const parsed = MissionSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  },
  async save(mission: Mission): Promise<Mission> {
    const value = MissionSchema.parse(mission);
    await withDb((db) => db.put("missions", value));
    return value;
  },
  async saveMany(missions: Mission[]): Promise<Mission[]> {
    const values = missions.map((m) => MissionSchema.parse(m));
    const tx = (await getDB()).transaction("missions", "readwrite");
    for (const v of values) await tx.store.put(v);
    await tx.done;
    return values;
  },
  async byExpedition(expeditionId: string): Promise<Mission[]> {
    const list = await readByIndex("missions", "by-expeditionId", expeditionId, MissionSchema);
    return list.sort((a, b) => a.orderIndex - b.orderIndex);
  },
  async all(): Promise<Mission[]> {
    return readAll("missions", MissionSchema);
  },
};

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

export const observationRepository = {
  async get(id: string): Promise<Observation | null> {
    const raw = await withDb((db) => db.get("observations", id));
    if (!raw) return null;
    const parsed = ObservationSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  },
  async save(observation: Observation): Promise<Observation> {
    const value = ObservationSchema.parse(observation);
    await withDb((db) => db.put("observations", value));
    return value;
  },
  async byExpedition(expeditionId: string): Promise<Observation[]> {
    const list = await readByIndex(
      "observations",
      "by-expeditionId",
      expeditionId,
      ObservationSchema
    );
    return list.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  },
  async all(): Promise<Observation[]> {
    const all = await readAll("observations", ObservationSchema);
    return all.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  },
  async recent(limit: number): Promise<Observation[]> {
    const all = await observationRepository.all();
    return all.slice(0, limit);
  },
  async delete(id: string): Promise<void> {
    await withDb((db) => db.delete("observations", id));
  },
};

// ---------------------------------------------------------------------------
// Media assets + blobs
// ---------------------------------------------------------------------------

export const mediaRepository = {
  async getAsset(id: string): Promise<MediaAsset | null> {
    const raw = await withDb((db) => db.get("mediaAssets", id));
    if (!raw) return null;
    const parsed = MediaAssetSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  },
  async saveAsset(asset: MediaAsset): Promise<MediaAsset> {
    const value = MediaAssetSchema.parse(asset);
    await withDb((db) => db.put("mediaAssets", value));
    return value;
  },
  async byObservation(observationId: string): Promise<MediaAsset[]> {
    return readByIndex("mediaAssets", "by-observationId", observationId, MediaAssetSchema);
  },
  async putBlob(
    record: Omit<MediaBlobRecord, "createdAt"> & { createdAt?: string }
  ): Promise<void> {
    await withDb((db) =>
      db.put("mediaBlobs", { ...record, createdAt: record.createdAt ?? new Date().toISOString() })
    );
  },
  async getBlob(key: string): Promise<MediaBlobRecord | null> {
    const raw = await withDb((db) => db.get("mediaBlobs", key));
    return raw ?? null;
  },
  async deleteBlob(key: string): Promise<void> {
    await withDb((db) => db.delete("mediaBlobs", key));
  },
  async deleteAssetsForObservation(observationId: string): Promise<void> {
    const assets = await mediaRepository.byObservation(observationId);
    const db = await getDB();
    const tx = db.transaction(["mediaAssets", "mediaBlobs"], "readwrite");
    for (const asset of assets) {
      await tx.objectStore("mediaAssets").delete(asset.id);
      await tx.objectStore("mediaBlobs").delete(asset.blobKey);
    }
    await tx.done;
  },
};

// ---------------------------------------------------------------------------
// Sync queue + events
// ---------------------------------------------------------------------------

export const syncQueueRepository = {
  async enqueue(input: {
    entityId: string;
    entityType: SyncEntityType;
    operation: SyncOperationName;
    payload?: Record<string, unknown>;
    origin?: "live" | "demo";
  }): Promise<SyncOperation> {
    const op = SyncOperationSchema.parse({
      id: uuid(),
      entityId: input.entityId,
      entityType: input.entityType,
      operation: input.operation,
      payload: input.payload ?? {},
      createdAt: new Date().toISOString(),
      attempts: 0,
      lastAttempt: null,
      nextAttemptAt: null,
      status: "QUEUED",
      lastError: null,
      origin: input.origin ?? "live",
    });
    await withDb((db) => db.put("syncQueue", op));
    return op;
  },
  async save(op: SyncOperation): Promise<SyncOperation> {
    const value = SyncOperationSchema.parse(op);
    await withDb((db) => db.put("syncQueue", value));
    return value;
  },
  async all(): Promise<SyncOperation[]> {
    const all = await readAll("syncQueue", SyncOperationSchema);
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async byStatus(status: SyncOperation["status"]): Promise<SyncOperation[]> {
    return readByIndex("syncQueue", "by-status", status, SyncOperationSchema);
  },
  async pendingCount(): Promise<number> {
    const all = await syncQueueRepository.all();
    return all.filter(
      (op) => op.status === "QUEUED" || op.status === "FAILED" || op.status === "SYNCING"
    ).length;
  },
  /** Ops whose backoff window has elapsed and can be attempted now. */
  async ready(nowIso: string): Promise<SyncOperation[]> {
    const all = await syncQueueRepository.all();
    return all.filter(
      (op) =>
        (op.status === "QUEUED" || op.status === "FAILED") &&
        (!op.nextAttemptAt || op.nextAttemptAt <= nowIso)
    );
  },
  async remove(id: string): Promise<void> {
    await withDb((db) => db.delete("syncQueue", id));
  },
  async clear(): Promise<void> {
    await withDb((db) => db.clear("syncQueue"));
  },
};

export const syncEventRepository = {
  async add(
    event: Omit<SyncEvent, "id" | "createdAt"> & Partial<Pick<SyncEvent, "id" | "createdAt">>
  ): Promise<SyncEvent> {
    const value = SyncEventSchema.parse({
      id: event.id ?? uuid(),
      createdAt: event.createdAt ?? new Date().toISOString(),
      ...event,
    });
    await withDb((db) => db.put("syncEvents", value));
    return value;
  },
  async recent(limit = 20): Promise<SyncEvent[]> {
    const all = await readAll("syncEvents", SyncEventSchema);
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  },
};

// ---------------------------------------------------------------------------
// Grass Score
// ---------------------------------------------------------------------------

export const grassScoreRepository = {
  async save(score: GrassScore): Promise<GrassScore> {
    const value = GrassScoreSchema.parse(score);
    await withDb((db) => db.put("grassScores", value));
    return value;
  },
  async byDateKey(dateKey: string): Promise<GrassScore[]> {
    return readByIndex("grassScores", "by-dateKey", dateKey, GrassScoreSchema);
  },
  async byExpedition(expeditionId: string): Promise<GrassScore | null> {
    const list = await readByIndex(
      "grassScores",
      "by-expeditionId",
      expeditionId,
      GrassScoreSchema
    );
    return list[0] ?? null;
  },
  async all(): Promise<GrassScore[]> {
    const all = await readAll("grassScores", GrassScoreSchema);
    return all.sort((a, b) => a.computedAt.localeCompare(b.computedAt));
  },
  async personalBest(): Promise<number> {
    const all = await grassScoreRepository.all();
    return all.reduce((best, s) => Math.max(best, s.score), 0);
  },
};

export const grassScoreEventRepository = {
  async add(event: GrassScoreEvent): Promise<GrassScoreEvent> {
    const value = GrassScoreEventSchema.parse(event);
    await withDb((db) => db.put("grassScoreEvents", value));
    return value;
  },
  async byExpedition(expeditionId: string): Promise<GrassScoreEvent[]> {
    return readByIndex("grassScoreEvents", "by-expeditionId", expeditionId, GrassScoreEventSchema);
  },
  async recent(limit = 30): Promise<GrassScoreEvent[]> {
    const all = await readAll("grassScoreEvents", GrassScoreEventSchema);
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  },
};

// ---------------------------------------------------------------------------
// Model metadata, knowledge cache, agent traces
// ---------------------------------------------------------------------------

export const modelMetadataRepository = {
  async get(id: string): Promise<Record<string, unknown> | null> {
    const raw = await withDb((db) => db.get("modelMetadata", id));
    return raw ?? null;
  },
  async save(id: string, value: Record<string, unknown>): Promise<void> {
    await withDb((db) => db.put("modelMetadata", { id, ...value }));
  },
  async all(): Promise<Array<Record<string, unknown>>> {
    return withDb((db) => db.getAll("modelMetadata"));
  },
};

export const knowledgeRepository = {
  async putMany(records: KnowledgeRecord[]): Promise<number> {
    const values = records.map((r) => KnowledgeRecordSchema.parse(r));
    const tx = (await getDB()).transaction("cachedKnowledge", "readwrite");
    for (const v of values) await tx.store.put(v);
    await tx.done;
    return values.length;
  },
  async all(): Promise<KnowledgeRecord[]> {
    return readAll("cachedKnowledge", KnowledgeRecordSchema);
  },
  async bySlug(slug: string): Promise<KnowledgeRecord | null> {
    const list = await readByIndex("cachedKnowledge", "by-slug", slug, KnowledgeRecordSchema);
    return list[0] ?? null;
  },
  async count(): Promise<number> {
    return withDb((db) => db.count("cachedKnowledge"));
  },
};

export const agentTraceRepository = {
  async add(trace: AgentTrace): Promise<AgentTrace> {
    const value = AgentTraceSchema.parse(trace);
    await withDb((db) => db.put("agentTraces", value));
    return value;
  },
  async recent(limit = 20): Promise<AgentTrace[]> {
    const all = await readAll("agentTraces", AgentTraceSchema);
    return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
  },
};

export const memoryRepository = {
  async put(record: MemoryRecord): Promise<MemoryRecord> {
    const value = MemoryRecordSchema.parse(record);
    await withDb((db) => db.put("memories", value));
    return value;
  },
  /** Newest first. */
  async byUser(userId: string, limit = 100): Promise<MemoryRecord[]> {
    const list = await readByIndex("memories", "by-userId", userId, MemoryRecordSchema);
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  },
  async forExpedition(expeditionId: string): Promise<MemoryRecord[]> {
    const all = await readAll("memories", MemoryRecordSchema);
    return all.filter((m) => m.expeditionId === expeditionId);
  },
  async remove(id: string): Promise<void> {
    await withDb((db) => db.delete("memories", id));
  },
  async countByUser(userId: string): Promise<number> {
    const list = await readByIndex("memories", "by-userId", userId, MemoryRecordSchema);
    return list.length;
  },
};

// ---------------------------------------------------------------------------
// Full local wipe (settings "delete my data" + diagnostics reset)
// ---------------------------------------------------------------------------

export async function clearAllLocalData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(ALL_STORES, "readwrite");
  for (const store of ALL_STORES) {
    await tx.objectStore(store).clear();
  }
  await tx.done;
}

export async function localStorageStats(): Promise<{
  expeditions: number;
  missions: number;
  observations: number;
  media: number;
  queued: number;
  knowledge: number;
}> {
  const db = await getDB();
  const [expeditions, missions, observations, media, queued, knowledge] = await Promise.all([
    db.count("expeditions"),
    db.count("missions"),
    db.count("observations"),
    db.count("mediaAssets"),
    db.count("syncQueue"),
    db.count("cachedKnowledge"),
  ]);
  return { expeditions, missions, observations, media, queued, knowledge };
}
