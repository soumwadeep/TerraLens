#!/usr/bin/env node
/**
 * Seed the Tiger Data knowledge base from the bundled field guide.
 *
 *   node --env-file=.env.local scripts/seed-tiger.mjs
 *
 * Reads src/lib/knowledge/seed.json, upserts every entry into
 * knowledge_records (idempotent — ids are derived from the slug with the
 * exact same FNV-1a recipe as src/lib/knowledge/seed.ts; change both or
 * neither), and optionally computes embeddings when GEMMA_BASE_URL and
 * GEMMA_EMBEDDING_MODEL are set.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const EMBED_DIM = 768;

// --- identical to src/lib/knowledge/seed.ts ---------------------------------

function fnv1a(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function hex8(value) {
  return value.toString(16).padStart(8, "0");
}

function seedIdForSlug(slug) {
  const h1 = hex8(fnv1a(`terralens:${slug}:1`));
  const h2 = hex8(fnv1a(`terralens:${slug}:2`));
  const h3 = hex8(fnv1a(`terralens:${slug}:3`));
  const h4 = hex8(fnv1a(`terralens:${slug}:4`));
  return [h1, h2.slice(0, 4), `4${h2.slice(4, 7)}`, `8${h3.slice(1, 4)}`, h3.slice(4) + h4].join(
    "-"
  );
}

// ----------------------------------------------------------------------------

const url = process.env.TIGER_DATABASE_URL?.trim();
if (!url) {
  console.error("TIGER_DATABASE_URL is not set. Nothing was written.");
  process.exit(1);
}

const seedPath = fileURLToPath(new URL("../src/lib/knowledge/seed.json", import.meta.url));
const seed = JSON.parse(readFileSync(seedPath, "utf8"));
const entries = Array.isArray(seed.entries) ? seed.entries : [];
if (entries.length === 0) {
  console.error("seed.json has no entries. Nothing was written.");
  process.exit(1);
}

const gemmaBase = process.env.GEMMA_BASE_URL?.trim()?.replace(/\/$/, "");
const embeddingModel = process.env.GEMMA_EMBEDDING_MODEL?.trim();
const gemmaKey = process.env.GEMMA_API_KEY?.trim();
const embed = Boolean(gemmaBase && embeddingModel);

async function embedText(text) {
  const response = await fetch(`${gemmaBase}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(gemmaKey ? { Authorization: `Bearer ${gemmaKey}` } : {}),
    },
    body: JSON.stringify({ model: embeddingModel, input: text }),
  });
  if (!response.ok) {
    throw new Error(`embeddings endpoint answered HTTP ${response.status}`);
  }
  const body = await response.json();
  const vector = body?.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error("embeddings endpoint returned no vector");
  }
  if (vector.length !== EMBED_DIM) {
    throw new Error(
      `embedding has ${vector.length} dims but schema.sql declares vector(${EMBED_DIM}) — ` +
        "update services/knowledge/schema.sql and re-run"
    );
  }
  return vector;
}

const pool = new Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 8000 });

let upserted = 0;
let embedded = 0;

try {
  for (const entry of entries) {
    const id = seedIdForSlug(entry.slug);
    let vector = null;
    if (embed) {
      const text = [
        entry.commonName,
        entry.scientificName ?? "",
        (entry.traits ?? []).join(" "),
        entry.habitat ?? "",
        entry.ecology ?? "",
      ].join(" ");
      vector = await embedText(text);
      embedded += 1;
    }
    await pool.query(
      `INSERT INTO knowledge_records
         (id, slug, common_name, scientific_name, category, traits, habitat, ecology,
          seasonality, safe_facts, region, source, embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'tiger-database', $12)
       ON CONFLICT (id) DO UPDATE SET
         slug = EXCLUDED.slug,
         common_name = EXCLUDED.common_name,
         scientific_name = EXCLUDED.scientific_name,
         category = EXCLUDED.category,
         traits = EXCLUDED.traits,
         habitat = EXCLUDED.habitat,
         ecology = EXCLUDED.ecology,
         seasonality = EXCLUDED.seasonality,
         safe_facts = EXCLUDED.safe_facts,
         region = EXCLUDED.region,
         embedding = COALESCE(EXCLUDED.embedding, knowledge_records.embedding)`,
      [
        id,
        entry.slug,
        entry.commonName,
        entry.scientificName ?? null,
        entry.category,
        entry.traits ?? [],
        entry.habitat ?? "",
        entry.ecology ?? "",
        entry.seasonality ?? [],
        entry.safeFacts ?? [],
        entry.region ?? null,
        vector ? `[${vector.join(",")}]` : null,
      ]
    );
    upserted += 1;
  }

  const { rows } = await pool.query("SELECT count(*)::int AS count FROM knowledge_records");
  console.log(
    `Seeded ${upserted} entries (version ${seed.version}); ` +
      `${embed ? `${embedded} embeddings computed` : "embeddings skipped — GEMMA_EMBEDDING_MODEL/GEMMA_BASE_URL not set"}.`
  );
  console.log(`knowledge_records now holds ${rows[0].count} rows.`);
} catch (error) {
  console.error(`Seeding failed after ${upserted} entries: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
