/**
 * Knowledge retrieval (spec §6e) — client-side.
 *
 * Two honest sources, merged best-first:
 *  1. The bundled field guide, seeded into IndexedDB on first use and scored
 *     locally by token overlap (works fully offline).
 *  2. The deployment's Tiger Data knowledge base, queried only when the
 *     privacy mode allows server calls. Its records are cached locally with
 *     their `tiger-database` source and similarity preserved.
 *
 * When Tiger is unconfigured or unreachable the local guide is the whole
 * answer — the retrieval still succeeds, and the source badge on each hit
 * tells the truth about where it came from.
 */
import { knowledgeRepository } from "@/lib/db/repositories";
import type { AIAnalysis, KnowledgeRecord, ObservationCategory } from "@/lib/domain/types";
import { KnowledgeRecordSchema } from "@/lib/domain/types";
import { bundledSeedRecords, ensureSeededKnowledge } from "./seed";

export interface KnowledgeHit {
  record: KnowledgeRecord;
  /** Local token-overlap score (higher is stronger); server hits rank above ties. */
  score: number;
}

export interface KnowledgeRetrieval {
  hits: KnowledgeHit[];
  engine: "local" | "tiger-pgvector" | "tiger-lexical";
  serverState: "ok" | "unavailable" | "skipped";
}

export interface RetrieveKnowledgeInput {
  query: string;
  category?: ObservationCategory;
  limit?: number;
  /** False under LOCAL_ONLY — the local guide still answers. */
  allowServer: boolean;
}

/** Combine a note and any AI analysis into one query string. */
export function observationQuery(
  note: string | null | undefined,
  analysis: AIAnalysis | null | undefined
): string {
  const parts: string[] = [];
  if (note) parts.push(note);
  if (analysis && analysis.status !== "unavailable") {
    if (analysis.commonName) parts.push(analysis.commonName);
    if (analysis.scientificName) parts.push(analysis.scientificName);
    if (analysis.category !== "unknown") parts.push(analysis.category);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 300);
}

function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 3)
    )
  ).slice(0, 12);
}

const FIELD_WEIGHTS: Array<{ weight: number; text: (record: KnowledgeRecord) => string }> = [
  { weight: 3, text: (r) => r.commonName },
  { weight: 2, text: (r) => r.scientificName ?? "" },
  { weight: 2, text: (r) => r.category },
  { weight: 1.5, text: (r) => r.traits.join(" ") },
  { weight: 1, text: (r) => r.habitat },
  { weight: 1, text: (r) => r.ecology },
  { weight: 1, text: (r) => r.safeFacts.join(" ") },
  { weight: 0.75, text: (r) => r.seasonality.join(" ") },
  { weight: 0.5, text: (r) => r.region ?? "" },
];

function scoreRecord(
  record: KnowledgeRecord,
  tokens: string[],
  category?: ObservationCategory
): number {
  let score = category && record.category === category ? 2 : 0;
  for (const { weight, text } of FIELD_WEIGHTS) {
    const fieldTokens = new Set(tokenize(text(record)));
    for (const token of tokens) {
      if (fieldTokens.has(token)) score += weight;
    }
  }
  return score;
}

interface ServerKnowledgeResponse {
  kind?: string;
  records?: unknown;
  engine?: string;
}

/**
 * Query the deployment's Tiger Data knowledge base through /api/knowledge.
 * Returns null when there is nothing honest to add (skipped or unavailable).
 */
async function serverHits(
  query: string,
  limit: number
): Promise<{ hits: KnowledgeHit[]; engine: "tiger-pgvector" | "tiger-lexical" | null } | null> {
  let body: ServerKnowledgeResponse;
  try {
    const response = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit }),
    });
    if (!response.ok) return null;
    body = (await response.json()) as ServerKnowledgeResponse;
  } catch {
    return null;
  }
  if (body.kind !== "ok" || !Array.isArray(body.records)) return null;

  const records: KnowledgeRecord[] = [];
  for (const raw of body.records) {
    const parsed = KnowledgeRecordSchema.safeParse(raw);
    if (parsed.success) records.push(parsed.data);
  }
  if (records.length === 0) return null;

  // Cache server knowledge offline — ids match the bundled seed for shared
  // slugs, so putMany dedupes and the richer server copy wins.
  try {
    await knowledgeRepository.putMany(records);
  } catch {
    // cache is best-effort; the hits themselves still render
  }

  const engine = body.engine === "pgvector" ? "tiger-pgvector" : "tiger-lexical";
  return {
    hits: records.map((record, index) => ({
      record,
      // Server order is the server's ranking; keep it, reward similarity.
      score: 3 + (record.similarity ?? 0) * 2 - index * 0.01,
    })),
    engine,
  };
}

export async function retrieveKnowledge(
  input: RetrieveKnowledgeInput
): Promise<KnowledgeRetrieval> {
  const limit = input.limit ?? 3;
  const tokens = tokenize(input.query);
  if (tokens.length === 0) {
    return { hits: [], engine: "local", serverState: "skipped" };
  }

  try {
    await ensureSeededKnowledge();
  } catch {
    // Seeding is best-effort; bundledSeedRecords below still allows a fallback.
  }

  let local: KnowledgeRecord[];
  try {
    local = await knowledgeRepository.all();
  } catch {
    local = [];
  }
  if (local.length === 0) local = bundledSeedRecords();

  const scored = local
    .map((record) => ({ record, score: scoreRecord(record, tokens, input.category) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.record.commonName.localeCompare(b.record.commonName))
    .slice(0, limit);

  const merged = new Map<string, KnowledgeHit>(scored.map((hit) => [hit.record.id, hit]));
  let serverState: KnowledgeRetrieval["serverState"] = "skipped";
  let engine: KnowledgeRetrieval["engine"] = "local";

  if (input.allowServer) {
    const server = await serverHits(input.query, limit);
    if (server) {
      serverState = "ok";
      engine = server.engine ?? "local";
      for (const hit of server.hits) {
        const existing = merged.get(hit.record.id);
        if (existing) {
          existing.record = hit.record;
          existing.score = Math.max(existing.score, hit.score);
        } else {
          merged.set(hit.record.id, hit);
        }
      }
    } else {
      serverState = "unavailable";
    }
  }

  const hits = Array.from(merged.values())
    .sort((a, b) => b.score - a.score || a.record.commonName.localeCompare(b.record.commonName))
    .slice(0, limit);

  return { hits, engine, serverState };
}
