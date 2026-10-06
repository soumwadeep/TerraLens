/**
 * Sync backend route (spec §5, §40).
 *
 * Contract with the client sync engine (src/lib/sync/engine.ts):
 *   GET  → { configured: boolean, note }
 *   POST { userId, operations } →
 *        { configured: false, note }                       no backend
 *        { configured: true, results: [{id, status, detail}] }  stored
 *
 * Honesty rules baked in here:
 *  - "Configured" means a real storage backend exists (MongoDB + auth secret
 *    present). It is NEVER derived from the route merely answering.
 *  - When no backend is configured, operations are not accepted and not
 *    acknowledged — the client keeps them queued with zero attempt penalty.
 *  - When storage is configured but unreachable, the answer is a typed 503;
 *    nothing is ever silently dropped or reported as synced.
 *  - Every operation gets its own result row: stored (ok), newer-copy-exists
 *    (conflict), or rejected (error). `ok` is only ever written for a document
 *    that was really persisted.
 *  - Media blobs are never accepted here: photos and audio stay on-device,
 *    and UPLOAD_MEDIA is answered with an explicit error.
 *
 * Device identity: buckets are keyed by the client's local-first user id,
 * bound to the device by a signed httpOnly cookie (src/lib/server/session.ts).
 * A session never silently re-binds to a different user id: a mismatch is a
 * typed 403 and the stale cookie is cleared, so the device re-establishes a
 * session on the next retry. This is device binding, not account auth — it is
 * described plainly wherever the UI discusses cloud sync.
 */
import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/config";
import { MongoUnavailableError, getMongoDb } from "@/lib/server/mongodb";
import { mintSyncSession, readSyncSession } from "@/lib/server/session";
import { SyncBatchSchema, applySyncBatch } from "@/lib/server/sync-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_BACKEND_NOTE = "This deployment has no sync backend — every expedition stays on-device.";

function hasBackend(): boolean {
  const cfg = getServerConfig();
  return cfg.flags.mongodb && Boolean(cfg.mongo.uri) && Boolean(cfg.auth.secret);
}

export async function GET() {
  const configured = hasBackend();
  return NextResponse.json({
    configured,
    at: new Date().toISOString(),
    note: configured ? "Sync storage is configured for this deployment." : NO_BACKEND_NOTE,
  });
}

export async function POST(request: Request) {
  if (!hasBackend()) {
    return NextResponse.json({ configured: false, note: NO_BACKEND_NOTE });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const parsed = SyncBatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid sync batch.", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 }
    );
  }
  const { userId, operations } = parsed.data;

  const session = await readSyncSession(request);
  if (session && session.userId !== userId) {
    // The device's signed session belongs to a different identity. Do not
    // write anything; clear the stale cookie so the next retry can bind a
    // fresh session for the new identity instead of failing forever.
    const res = NextResponse.json(
      {
        configured: true,
        error: "session-mismatch",
        detail:
          "This device's sync session belongs to a different user id. The stale session was cleared — retry to re-establish one.",
      },
      { status: 403 }
    );
    res.cookies.set({ name: "tl_sync_session", value: "", path: "/", maxAge: 0 });
    return res;
  }

  let db;
  try {
    db = await getMongoDb();
  } catch (cause) {
    const detail =
      cause instanceof MongoUnavailableError
        ? cause.message
        : "Sync storage did not answer — the operations will be retried.";
    return NextResponse.json({ configured: true, error: "unavailable", detail }, { status: 503 });
  }
  if (!db) {
    // Configuration changed mid-request — same honesty as the probe.
    return NextResponse.json({ configured: false, note: NO_BACKEND_NOTE });
  }

  const results = await applySyncBatch(db, userId, operations);
  const res = NextResponse.json({
    configured: true,
    at: new Date().toISOString(),
    results,
  });

  if (!session) {
    const minted = await mintSyncSession(userId);
    if (minted) {
      res.cookies.set({
        name: minted.name,
        value: minted.value,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: minted.maxAgeSeconds,
      });
    }
  }
  return res;
}
