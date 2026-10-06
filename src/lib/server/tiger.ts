/**
 * Tiger Data (Postgres + pgvector) knowledge base (spec §6e) — server-only.
 *
 * Honesty contract, same as mongodb.ts:
 *  - `tigerConfigured()` is a configuration fact (url present + flag on).
 *  - Not configured → typed `not-configured`; unreachable → `unreachable`;
 *    missing table → `schema-missing`. Never a fabricated result set.
 *  - Vector search runs only when an embedding model is configured AND the
 *    embedding call succeeds; otherwise the response says `lexical`, because
 *    that is what actually ran.
 */
import { Pool } from "pg";
import { getServerConfig } from "@/lib/config";
import { ObservationCategorySchema, type KnowledgeRecord } from "@/lib/domain/types";

export type TigerProbeState = "ready" | "not-configured" | "schema-missing" | "unreachable";

export interface TigerProbe {
  state: TigerProbeState;
  detail: string;
  records: number | null;
  pgvector: boolean | null;
}

export class TigerUnavailableError extends Error {
  readonly state: Exclude<TigerProbeState, "ready">;
  constructor(state: Exclude<TigerProbeState, "ready">, message: string) {
    super(message);
    this.name = "TigerUnavailableError";
    this.state = state;
  }
}

interface TigerGlobal {
  pool?: Pool;
}

// Survives dev HMR so hot reloads do not leak connection pools.
const globalForTiger = globalThis as unknown as { __terralensTiger?: TigerGlobal };
const state: TigerGlobal = (globalForTiger.__terralensTiger ??= {});

export function tigerConfigured(): boolean {
  const cfg = getServerConfig();
  return cfg.flags.tiger && Boolean(cfg.tiger.url);
}

function getPool(): Pool {
  const cfg = getServerConfig();
  if (!cfg.tiger.url)
    throw new TigerUnavailableError("not-configured", "TIGER_DATABASE_URL is not set.");
  state.pool ??= new Pool({
    connectionString: cfg.tiger.url,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 8000,
    application_name: "terralens",
  });
  return state.pool;
}

function classifyError(error: unknown): TigerUnavailableError {
  if (error instanceof TigerUnavailableError) return error;
  const code = (error as { code?: string } | null)?.code;
  const message = error instanceof Error ? error.message : "Tiger Data did not answer.";
  if (code === "42P01") {
    return new TigerUnavailableError(
      "schema-missing",
      "knowledge_records table not found — run services/knowledge/schema.sql."
    );
  }
  return new TigerUnavailableError("unreachable", `Tiger Data did not answer: ${message}`);
}

interface KnowledgeRow {
  id: string;
  slug: string;
  common_name: string;
  scientific_name: string | null;
  category: string;
  traits: string[] | null;
  habitat: string | null;
  ecology: string | null;
  seasonality: string[] | null;
  safe_facts: string[] | null;
  region: string | null;
  created_at: Date | string;
  similarity?: number | null;
}

/** DB row → KnowledgeRecord-shaped JSON (the route zod-validates it downstream). */
function toRecord(row: KnowledgeRow): KnowledgeRecord {
  const category = ObservationCategorySchema.safeParse(row.category);
  const createdAt =
    row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
  return {
    id: row.id,
    slug: row.slug,
    commonName: row.common_name,
    scientificName: row.scientific_name,
    category: category.success ? category.data : "unknown",
    traits: row.traits ?? [],
    habitat: row.habitat ?? "",
    ecology: row.ecology ?? "",
    seasonality: row.seasonality ?? [],
    safeFacts: row.safe_facts ?? [],
    region: row.region,
    source: "tiger-database",
    similarity: typeof row.similarity === "number" ? row.similarity : null,
    createdAt,
  };
}

const SELECT_COLUMNS = `
  id, slug, common_name, scientific_name, category, traits, habitat, ecology,
  seasonality, safe_facts, region, created_at
`;

/** Live health check — the only way this integration is ever called READY. */
export async function probeTiger(): Promise<TigerProbe> {
  if (!tigerConfigured()) {
    return {
      state: "not-configured",
      detail: "TIGER_DATABASE_URL is not set (or ENABLE_TIGER is off).",
      records: null,
      pgvector: null,
    };
  }
  try {
    const pool = getPool();
    const [{ rows: countRows }, { rows: extRows }] = await Promise.all([
      pool.query<{ count: number }>("SELECT count(*)::int AS count FROM knowledge_records"),
      pool.query<{ has_vector: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') AS has_vector"
      ),
    ]);
    return {
      state: "ready",
      detail: "Tiger Data answered and knowledge_records exists.",
      records: countRows[0]?.count ?? 0,
      pgvector: extRows[0]?.has_vector ?? false,
    };
  } catch (error) {
    const classified = classifyError(error);
    return {
      state: classified.state,
      detail: classified.message,
      records: null,
      pgvector: null,
    };
  }
}

/** OpenAI-compatible embeddings call against the configured Gemma runtime. */
async function embedQuery(query: string): Promise<number[] | null> {
  const cfg = getServerConfig();
  if (!cfg.gemma.embeddingModel || !cfg.gemma.baseUrl) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${cfg.gemma.baseUrl.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.gemma.apiKey ? { Authorization: `Bearer ${cfg.gemma.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: cfg.gemma.embeddingModel, input: query }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
    const vector = body.data?.[0]?.embedding;
    return Array.isArray(vector) && vector.length > 0 ? vector : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface TigerSearchResult {
  records: KnowledgeRecord[];
  engine: "pgvector" | "lexical";
}

export async function searchTigerKnowledge(
  query: string,
  limit: number
): Promise<TigerSearchResult> {
  if (!tigerConfigured()) {
    throw new TigerUnavailableError(
      "not-configured",
      "TIGER_DATABASE_URL is not set (or ENABLE_TIGER is off)."
    );
  }

  const pool = getPool();
  try {
    const embedding = await embedQuery(query);
    if (embedding) {
      const vectorLiteral = `[${embedding.map((v) => (Number.isFinite(v) ? v : 0)).join(",")}]`;
      const { rows } = await pool.query<KnowledgeRow>(
        `SELECT ${SELECT_COLUMNS}, 1 - (embedding <=> $1::vector) AS similarity
         FROM knowledge_records
         WHERE embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT $2`,
        [vectorLiteral, limit]
      );
      if (rows.length > 0) {
        return { records: rows.map(toRecord), engine: "pgvector" };
      }
      // Embeddings enabled but no rows carry one — fall through to lexical.
    }

    const { rows } = await pool.query<KnowledgeRow>(
      `SELECT ${SELECT_COLUMNS}
       FROM knowledge_records
       WHERE to_tsvector('english',
               common_name || ' ' || coalesce(scientific_name, '') || ' ' ||
               array_to_string(traits, ' ') || ' ' || habitat || ' ' || ecology
             ) @@ plainto_tsquery('english', $1)
       ORDER BY ts_rank(
         to_tsvector('english',
           common_name || ' ' || coalesce(scientific_name, '') || ' ' ||
           array_to_string(traits, ' ') || ' ' || habitat || ' ' || ecology
         ),
         plainto_tsquery('english', $1)
       ) DESC
       LIMIT $2`,
      [query, limit]
    );
    return { records: rows.map(toRecord), engine: "lexical" };
  } catch (error) {
    throw classifyError(error);
  }
}
