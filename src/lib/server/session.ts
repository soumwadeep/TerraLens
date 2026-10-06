/**
 * Sync session (spec §5, §40, §43) — server-only.
 *
 * Cloud sync buckets are keyed by the device's local-first user id. To keep
 * that honest without pretending a full account system exists, the server
 * binds a bucket to its device with a signed, httpOnly cookie:
 *
 *  - First sync from a device: a session is minted for the user id the client
 *    presented, and every later request must present the same session.
 *  - A request whose body targets a different user id than the session is
 *    rejected (403) — one device cannot silently write into another's bucket.
 *  - No AUTH_SECRET → no sessions at all, and the sync route reports itself as
 *    not configured (the same state validateConfig() warns about).
 */
import { SignJWT, jwtVerify } from "jose";
import { getServerConfig } from "@/lib/config";

const COOKIE_NAME = "tl_sync_session";
const ALG = "HS256";

export interface SyncSession {
  userId: string;
}

function secretKey(): Uint8Array | null {
  const secret = getServerConfig().auth.secret;
  if (!secret || secret.length === 0) return null;
  return new TextEncoder().encode(secret);
}

export function sessionsConfigured(): boolean {
  return getServerConfig().auth.secret !== null;
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return part.slice(eq + 1).trim();
      }
    }
  }
  return null;
}

/** The session presented by this request, or null when absent/invalid. */
export async function readSyncSession(request: Request): Promise<SyncSession | null> {
  const key = secretKey();
  if (!key) return null;
  const token = readCookie(request.headers.get("cookie"), COOKIE_NAME);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: [ALG] });
    const userId = typeof payload.uid === "string" ? payload.uid : payload.sub;
    return typeof userId === "string" && userId.length > 0 ? { userId } : null;
  } catch {
    return null;
  }
}

export interface MintedSession {
  name: string;
  value: string;
  maxAgeSeconds: number;
}

/** Mint a signed session cookie for a device presenting this user id. */
export async function mintSyncSession(userId: string): Promise<MintedSession | null> {
  const key = secretKey();
  if (!key) return null;
  const days = Math.max(1, getServerConfig().auth.sessionDays);
  const value = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: ALG })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(key);
  return { name: COOKIE_NAME, value, maxAgeSeconds: days * 24 * 60 * 60 };
}
