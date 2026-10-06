# TerraLens knowledge base — Tiger Data

The app ships with a **bundled field guide** (35 curated entries in
`src/lib/knowledge/seed.json`) that works fully offline. This service extends
it with a searchable Postgres + pgvector knowledge base hosted on
[Tiger Data](https://www.tigerdata.com/) (sponsor integration, spec §6e).

Honesty model, same as every other integration:

- Unconfigured → the app says so (`/api/knowledge` reports `configured: false`,
  probe state `not-configured`) and serves the bundled guide only.
- Configured but table missing → probe state `schema-missing`.
- Configured but unreachable → probe state `unreachable`; retrieval quietly
  falls back to the bundled guide.
- `READY` requires a live probe (`GET /api/knowledge?health=1`) that answers
  with a record count and pgvector presence.

## Provisioning

1. Create a free Tiger Cloud service (Timescale/Postgres with pgvector).
2. Copy its connection string into `TIGER_DATABASE_URL` (use the pooled
   connection string; TLS is handled by `sslmode=require` in the URL).
3. Optionally set `ENABLE_TIGER=1` — the flag defaults to off; the URL alone
   is not treated as READY anywhere.
4. Apply the schema:

   ```bash
   psql "$TIGER_DATABASE_URL" -f services/knowledge/schema.sql
   ```

   If `CREATE EXTENSION vector` is rejected, enable pgvector from the Tiger
   Cloud console for the service, then re-run.

5. Seed the knowledge rows (idempotent upsert; deterministic UUIDs shared with
   the on-device bundled guide, so the two never disagree about identity):

   ```bash
   node --env-file=.env.local scripts/seed-tiger.mjs
   ```

## Embeddings (optional)

Without an embedding runtime the app searches with Postgres full-text search
(`plainto_tsquery`) and says so: responses carry `"engine": "lexical"`.

To enable vector search:

- Set `GEMMA_BASE_URL` to an **OpenAI-compatible** runtime that serves an
  embeddings endpoint (`POST {GEMMA_BASE_URL}/embeddings`).
- Set `GEMMA_EMBEDDING_MODEL` (e.g. a 768-dim model — `schema.sql` declares
  `vector(768)`).
- Re-run the seed script: it embeds each entry and upserts the vectors.
- The app then reports `"engine": "pgvector"` and includes `similarity` values
  that the UI renders as a match percentage on Tiger-sourced field notes.

If the embeddings call fails at query time, the search falls back to lexical
and still tells the truth about which engine ran.

## Verifying

```bash
curl -s localhost:3000/api/knowledge | jq          # configured?
curl -s "localhost:3000/api/knowledge?health=1" | jq .probe
curl -s localhost:3000/api/knowledge \
  -H 'content-type: application/json' \
  -d '{"query":"striped yellow and black insect","limit":3}' | jq
```

The same probe feeds the `Tiger Data` row on `/lab/models` via
`/api/integrations`.
