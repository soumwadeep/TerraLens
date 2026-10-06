/**
 * IndexedDB schema (spec §5, §44).
 *
 * All local-first data lives here. Components never touch IndexedDB directly —
 * they go through repositories (src/lib/db/repositories.ts).
 *
 * Notes on store choices:
 *  - `observations` holds photo/audio/note records; audio does NOT get a second
 *    store because the observation + `mediaAssets` pair already describes it
 *    (a duplicate store would risk divergence).
 *  - `pendingUploads` from the spec's suggested list is represented by
 *    `syncQueue` entries with operation "UPLOAD_MEDIA" + `mediaBlobs`.
 *  - `modelMetadata` records the local model pack state without ever claiming
 *    a model exists unless a file was actually verified.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export const DB_NAME = "terralens";
export const DB_VERSION = 2;

export interface MediaBlobRecord {
  key: string;
  observationId: string;
  mimeType: string;
  blob: Blob;
  sizeBytes: number;
  createdAt: string;
}

export interface TerraLensDB extends DBSchema {
  userPreferences: { key: string; value: Record<string, unknown> };
  expeditions: {
    key: string;
    value: Record<string, unknown>;
    indexes: { "by-dateKey": string; "by-status": string };
  };
  missions: {
    key: string;
    value: Record<string, unknown>;
    indexes: { "by-expeditionId": string };
  };
  observations: {
    key: string;
    value: Record<string, unknown>;
    indexes: { "by-expeditionId": string; "by-capturedAt": string };
  };
  mediaAssets: {
    key: string;
    value: Record<string, unknown>;
    indexes: { "by-observationId": string };
  };
  mediaBlobs: { key: string; value: MediaBlobRecord };
  syncQueue: {
    key: string;
    value: Record<string, unknown>;
    indexes: { "by-status": string; "by-entityId": string };
  };
  syncEvents: { key: string; value: Record<string, unknown> };
  grassScores: {
    key: string;
    value: Record<string, unknown>;
    indexes: { "by-dateKey": string; "by-expeditionId": string };
  };
  grassScoreEvents: {
    key: string;
    value: Record<string, unknown>;
    indexes: { "by-expeditionId": string };
  };
  modelMetadata: { key: string; value: Record<string, unknown> };
  cachedKnowledge: {
    key: string;
    value: Record<string, unknown>;
    indexes: { "by-slug": string };
  };
  agentTraces: { key: string; value: Record<string, unknown> };
  memories: {
    key: string;
    value: Record<string, unknown>;
    indexes: { "by-userId": string; "by-createdAt": string };
  };
}

let dbPromise: Promise<IDBPDatabase<TerraLensDB>> | null = null;

/**
 * Explicit store-name union. `keyof TerraLensDB` degrades to `string` because
 * DBSchema carries an index signature, so the literal union is spelled out.
 */
export type StoreName =
  | "userPreferences"
  | "expeditions"
  | "missions"
  | "observations"
  | "mediaAssets"
  | "mediaBlobs"
  | "syncQueue"
  | "syncEvents"
  | "grassScores"
  | "grassScoreEvents"
  | "modelMetadata"
  | "cachedKnowledge"
  | "agentTraces"
  | "memories";

export const ALL_STORES: StoreName[] = [
  "userPreferences",
  "expeditions",
  "missions",
  "observations",
  "mediaAssets",
  "mediaBlobs",
  "syncQueue",
  "syncEvents",
  "grassScores",
  "grassScoreEvents",
  "modelMetadata",
  "cachedKnowledge",
  "agentTraces",
  "memories",
];

/** Every index declared above (all string keys). */
export type IndexName =
  | "by-dateKey"
  | "by-status"
  | "by-expeditionId"
  | "by-capturedAt"
  | "by-observationId"
  | "by-slug"
  | "by-userId"
  | "by-createdAt";

export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export function getDB(): Promise<IDBPDatabase<TerraLensDB>> {
  if (!isIndexedDBAvailable()) {
    return Promise.reject(new Error("IndexedDB is not available in this environment"));
  }
  if (!dbPromise) {
    dbPromise = openDB<TerraLensDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("userPreferences")) {
          db.createObjectStore("userPreferences", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("expeditions")) {
          const s = db.createObjectStore("expeditions", { keyPath: "id" });
          s.createIndex("by-dateKey", "dateKey");
          s.createIndex("by-status", "status");
        }
        if (!db.objectStoreNames.contains("missions")) {
          const s = db.createObjectStore("missions", { keyPath: "id" });
          s.createIndex("by-expeditionId", "expeditionId");
        }
        if (!db.objectStoreNames.contains("observations")) {
          const s = db.createObjectStore("observations", { keyPath: "id" });
          s.createIndex("by-expeditionId", "expeditionId");
          s.createIndex("by-capturedAt", "capturedAt");
        }
        if (!db.objectStoreNames.contains("mediaAssets")) {
          const s = db.createObjectStore("mediaAssets", { keyPath: "id" });
          s.createIndex("by-observationId", "observationId");
        }
        if (!db.objectStoreNames.contains("mediaBlobs")) {
          db.createObjectStore("mediaBlobs", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("syncQueue")) {
          const s = db.createObjectStore("syncQueue", { keyPath: "id" });
          s.createIndex("by-status", "status");
          s.createIndex("by-entityId", "entityId");
        }
        if (!db.objectStoreNames.contains("syncEvents")) {
          db.createObjectStore("syncEvents", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("grassScores")) {
          const s = db.createObjectStore("grassScores", { keyPath: "id" });
          s.createIndex("by-dateKey", "dateKey");
          s.createIndex("by-expeditionId", "expeditionId");
        }
        if (!db.objectStoreNames.contains("grassScoreEvents")) {
          const s = db.createObjectStore("grassScoreEvents", { keyPath: "id" });
          s.createIndex("by-expeditionId", "expeditionId");
        }
        if (!db.objectStoreNames.contains("modelMetadata")) {
          db.createObjectStore("modelMetadata", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("cachedKnowledge")) {
          const s = db.createObjectStore("cachedKnowledge", { keyPath: "id" });
          s.createIndex("by-slug", "slug");
        }
        if (!db.objectStoreNames.contains("agentTraces")) {
          db.createObjectStore("agentTraces", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("memories")) {
          const s = db.createObjectStore("memories", { keyPath: "id" });
          s.createIndex("by-userId", "userId");
          s.createIndex("by-createdAt", "createdAt");
        }
      },
      blocked() {
        // Another tab holds an older version open; the app keeps working on
        // the previous connection and retries on next load.
      },
      terminated() {
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

/** Test/utility helper: wipe everything (demo reset, diagnostics). */
export async function deleteDatabase(): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("deleteDatabase failed"));
    req.onblocked = () => resolve();
  });
}
