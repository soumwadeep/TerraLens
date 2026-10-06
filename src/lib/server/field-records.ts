/**
 * Field Agent record storage (spec §5, §34, §49) — server-only.
 *
 * Two collections, both best-effort from callers' perspective:
 *  - `fieldRecaps` — one stored recap per (userId, expeditionId); the unique
 *    index makes upserts idempotent regardless of how many times the workflow
 *    or the client retried.
 *  - `agentTraces` — content-free AgentTrace metadata (whitelisted scalars
 *    only by schema; no prompts, no model text, no user content).
 *
 * A stored document carries `userId` and `serverReceivedAt`, which the shared
 * zod schemas strip on parse — stored shape flows into domain shape cleanly.
 */
import { getMongoDb } from "@/lib/server/mongodb";
import {
  StoredFieldRecapSchema,
  type StoredFieldRecap,
  type RecapEngine,
  type FieldRecap,
} from "@/lib/ai/recap";
import { AgentTraceSchema, type AgentTrace } from "@/lib/domain/types";
import { nowIso, uuid } from "@/lib/utils";

/** This deployment uses client UUIDs as `_id` — never ObjectIds. */
interface StoredDoc extends Record<string, unknown> {
  _id: string;
}

export interface SaveFieldRecapInput {
  userId: string;
  expeditionId: string;
  recap: FieldRecap;
  engine: RecapEngine;
  model: string | null;
}

/**
 * Upsert the recap for an expedition. Returns the stored record, or null when
 * MongoDB is not configured (callers treat null as "not persisted", never as
 * an error the user must see).
 */
export async function saveFieldRecap(input: SaveFieldRecapInput): Promise<StoredFieldRecap | null> {
  const db = await getMongoDb();
  if (!db) return null;

  const recap = StoredFieldRecapSchema.parse({
    id: uuid(),
    userId: input.userId,
    expeditionId: input.expeditionId,
    recap: input.recap,
    engine: input.engine,
    model: input.model,
    createdAt: nowIso(),
  });

  await db.collection<StoredDoc>("fieldRecaps").updateOne(
    { userId: recap.userId, expeditionId: recap.expeditionId },
    {
      $set: { ...recap, serverReceivedAt: nowIso() },
      $setOnInsert: { _id: recap.id },
    },
    { upsert: true }
  );

  return recap;
}

/** The stored recap for one expedition, or null when absent/unconfigured. */
export async function getFieldRecapForExpedition(
  userId: string,
  expeditionId: string
): Promise<StoredFieldRecap | null> {
  const db = await getMongoDb();
  if (!db) return null;

  const doc = await db.collection<StoredDoc>("fieldRecaps").findOne({ userId, expeditionId });
  if (!doc) return null;

  const parsed = StoredFieldRecapSchema.safeParse(doc);
  return parsed.success ? parsed.data : null;
}

/**
 * Persist content-free trace metadata. Failures are swallowed by callers'
 * convention: tracing must never break the recap path.
 */
export async function saveAgentTrace(trace: AgentTrace): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  const parsed = AgentTraceSchema.safeParse(trace);
  if (!parsed.success) return;
  await db
    .collection<StoredDoc>("agentTraces")
    .insertOne({ ...parsed.data, _id: parsed.data.id, serverReceivedAt: nowIso() });
}
