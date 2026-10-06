/**
 * Telemetry redaction (spec §49) — pure, unit-testable, no side effects.
 *
 * The contract for anything leaving this process toward Sentry:
 *  - content NEVER leaves: photos, audio, notes, story text, transcripts,
 *    prompts, coordinates, emails;
 *  - strings that survive are truncated (they are labels, not content);
 *  - unknown objects are walked with a depth/item cap so a payload can never
 *    balloon telemetry, and sensitive keys become "[redacted]".
 *
 * `captureServerError` is only ever called with engine-generated messages by
 * contract (our code never formats user text into errors).
 */

const MAX_STRING = 200;
const MAX_ITEMS = 20;
const MAX_KEYS = 40;
const MAX_DEPTH = 4;

/** Keys whose values are user content or secrets — always dropped. */
const REDACTED_KEYS = new Set([
  "photo",
  "photos",
  "image",
  "images",
  "audio",
  "blob",
  "blobs",
  "dataurl",
  "base64",
  "note",
  "notes",
  "story",
  "transcript",
  "prompt",
  "prompts",
  "text",
  "content",
  "body",
  "email",
  "displayname",
  "address",
  "coordinates",
  "coordinate",
  "latitude",
  "longitude",
  "lat",
  "lon",
  "lng",
  "geo",
  "geolocation",
  "location",
  "exactlocation",
  "query",
  "token",
  "accesstoken",
  "authtoken",
  "apitoken",
  "apikey",
  "api_key",
  "authorization",
  "password",
  "secret",
  "credential",
  "credentials",
  "accesskey",
  "privatekey",
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string): boolean {
  const k = normalizeKey(key);
  if (k.endsWith("tokens")) return false; // token COUNTS are safe metrics
  return REDACTED_KEYS.has(k);
}

/**
 * Deep-redact any value for telemetry. Returns JSON-safe data where no
 * string exceeds MAX_STRING and sensitive keys are replaced.
 */
export function redactForTelemetry(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.startsWith("data:")) return "[redacted:data-url]";
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (depth >= MAX_DEPTH) return "[redacted:depth]";
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ITEMS).map((item) => redactForTelemetry(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (count >= MAX_KEYS) {
        out["…"] = "[truncated]";
        break;
      }
      count += 1;
      out[key] = isSensitiveKey(key) ? "[redacted]" : redactForTelemetry(item, depth + 1);
    }
    return out;
  }
  return "[redacted:unserializable]";
}

/** Scalar-only attribute map — the only shape captureServerError accepts. */
export function scalarAttributes(
  attributes: Record<string, unknown> | undefined
): Record<string, string | number | boolean> {
  const redacted = redactForTelemetry(attributes ?? {}) as Record<string, unknown>;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(redacted)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else if (value === null || value === undefined) {
      continue;
    }
  }
  return out;
}

/**
 * Sentry `beforeSend`: strip request bodies/cookies/query strings and walk
 * extra/tags/contexts through the same redaction. User id is kept (a UUID is
 * not PII and is the correlation key); email is dropped.
 */
export function redactSentryEvent<T extends Record<string, unknown>>(event: T): T {
  const copy: Record<string, unknown> = { ...event };
  if (copy.request && typeof copy.request === "object") {
    const req = copy.request as Record<string, unknown>;
    copy.request = {
      method: typeof req.method === "string" ? req.method : undefined,
      url: typeof req.url === "string" ? req.url.split("?")[0] : undefined,
    };
  }
  if (copy.user && typeof copy.user === "object") {
    const user = copy.user as Record<string, unknown>;
    copy.user = typeof user.id === "string" ? { id: user.id } : undefined;
  }
  copy.extra = redactForTelemetry(copy.extra ?? {});
  copy.tags = redactForTelemetry(copy.tags ?? {});
  copy.contexts = redactForTelemetry(copy.contexts ?? {});
  return copy as T;
}
