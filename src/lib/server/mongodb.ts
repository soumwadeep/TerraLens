/**
 * MongoDB Atlas access (spec §5, §40) — server-only.
 *
 * This module owns the only MongoClient in the process. Honesty contract:
 *  - `mongoConfigured()` is a configuration fact (uri present + flag on).
 *  - Not configured → `getMongoDb()` returns null; nothing is pretended.
 *  - Configured but unreachable → throws `MongoUnavailableError`, which every
 *    route translates into a typed 503 — never into a fabricated success.
 *
 * Indexes are ensured lazily, once per process per database, and are the only
 * schema this deployment imposes (entities are validated before they get here).
 */
import { MongoClient, type Db } from "mongodb";
import { getServerConfig } from "@/lib/config";

export class MongoUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MongoUnavailableError";
  }
}

export function mongoConfigured(): boolean {
  const cfg = getServerConfig();
  return cfg.flags.mongodb && Boolean(cfg.mongo.uri);
}

interface MongoGlobal {
  clientPromise?: Promise<MongoClient>;
  ensured?: Map<string, Promise<void>>;
}

// Survives dev HMR so hot reloads do not leak connection pools.
const globalForMongo = globalThis as unknown as { __terralensMongo?: MongoGlobal };
const state: MongoGlobal = (globalForMongo.__terralensMongo ??= {});

async function connect(dbName: string): Promise<Db> {
  const cfg = getServerConfig();
  if (!cfg.mongo.uri) throw new MongoUnavailableError("MONGODB_URI is not set.");

  if (!state.clientPromise) {
    const client = new MongoClient(cfg.mongo.uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      maxPoolSize: 10,
      appName: "terralens",
    });
    state.clientPromise = client.connect().catch((error: unknown) => {
      // Allow the next request to try again instead of caching the failure.
      state.clientPromise = undefined;
      void client.close().catch(() => undefined);
      throw new MongoUnavailableError(
        error instanceof Error
          ? `MongoDB did not answer: ${error.message}`
          : "MongoDB did not answer."
      );
    });
  }

  let client: MongoClient;
  try {
    client = await state.clientPromise;
  } catch (error) {
    throw error instanceof MongoUnavailableError
      ? error
      : new MongoUnavailableError("MongoDB did not answer.");
  }

  const db = client.db(dbName);
  await ensureIndexes(db);
  return db;
}

/** Lazily created indexes — one promise per database per process. */
function ensureIndexes(db: Db): Promise<void> {
  const cache = (state.ensured ??= new Map<string, Promise<void>>());
  const existing = cache.get(db.databaseName);
  if (existing) return existing;

  const created = (async () => {
    await Promise.all([
      db.collection("expeditions").createIndexes([
        { key: { userId: 1, updatedAt: -1 }, name: "user_recent" },
        { key: { userId: 1, dateKey: 1 }, name: "user_day" },
      ]),
      db
        .collection("missions")
        .createIndexes([{ key: { expeditionId: 1, orderIndex: 1 }, name: "expedition_board" }]),
      db.collection("observations").createIndexes([
        { key: { expeditionId: 1, capturedAt: -1 }, name: "expedition_findings" },
        { key: { userId: 1, capturedAt: -1 }, name: "user_findings" },
      ]),
      db
        .collection("mediaAssets")
        .createIndexes([{ key: { observationId: 1 }, name: "observation_media" }]),
      db
        .collection("grassScores")
        .createIndexes([
          { key: { userId: 1, scope: 1, dateKey: 1 }, name: "user_scope_day", unique: true },
        ]),
      db
        .collection("userPreferences")
        .createIndexes([{ key: { userId: 1 }, name: "user_prefs", unique: true }]),
      db
        .collection("fieldRecaps")
        .createIndexes([
          { key: { userId: 1, expeditionId: 1 }, name: "user_expedition_recap", unique: true },
        ]),
    ]);
  })().catch((error: unknown) => {
    cache.delete(db.databaseName);
    throw new MongoUnavailableError(
      error instanceof Error
        ? `MongoDB index setup failed: ${error.message}`
        : "MongoDB index setup failed."
    );
  });

  cache.set(db.databaseName, created);
  return created;
}

/**
 * The database handle for this deployment, or null when MongoDB is not
 * configured. Throws `MongoUnavailableError` when configured but unreachable.
 */
export async function getMongoDb(): Promise<Db | null> {
  if (!mongoConfigured()) return null;
  return connect(getServerConfig().mongo.dbName);
}
