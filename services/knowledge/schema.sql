-- TerraLens knowledge base — Tiger Data (Postgres + pgvector), spec §6e.
--
-- Run once against the Tiger Cloud service database:
--   psql "$TIGER_DATABASE_URL" -f services/knowledge/schema.sql
--
-- The app tolerates a missing table (`schema-missing` probe state) and keeps
-- serving the bundled field guide; run this to switch the integration on.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_records (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  common_name text NOT NULL,
  scientific_name text,
  category text NOT NULL,
  traits text[] NOT NULL DEFAULT '{}',
  habitat text NOT NULL DEFAULT '',
  ecology text NOT NULL DEFAULT '',
  seasonality text[] NOT NULL DEFAULT '{}',
  safe_facts text[] NOT NULL DEFAULT '{}',
  region text,
  source text NOT NULL DEFAULT 'tiger-database',
  -- 768 dims matches nomic-embed-text / bge-style runtimes. Changing this
  -- dimension means changing services/knowledge/README.md and re-embedding.
  embedding vector(768),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Lexical fallback — expression must stay in sync with src/lib/server/tiger.ts.
CREATE INDEX IF NOT EXISTS knowledge_fts ON knowledge_records
  USING gin (to_tsvector('english',
    common_name || ' ' || coalesce(scientific_name, '') || ' ' ||
    array_to_string(traits, ' ') || ' ' || habitat || ' ' || ecology
  ));

-- Vector search index (pgvector >= 0.5). Queries still work without it,
-- just with exact (sequential) scan.
CREATE INDEX IF NOT EXISTS knowledge_embedding_hnsw ON knowledge_records
  USING hnsw (embedding vector_cosine_ops);
