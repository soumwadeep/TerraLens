/**
 * Bundled field guide (spec §6e) — the offline floor for knowledge retrieval.
 *
 * The same 35-entry seed is also loaded into Tiger Data by
 * `scripts/seed-tiger.mjs`; ids are derived deterministically from the slug so
 * a locally seeded record and its Tiger counterpart share an id.
 */
import { knowledgeRepository } from "@/lib/db/repositories";
import { ObservationCategorySchema, type KnowledgeRecord } from "@/lib/domain/types";
import { nowIso } from "@/lib/utils";
import seed from "./seed.json";

export const SEED_VERSION: string = seed.version;

/** FNV-1a 32-bit — tiny, dependency-free, stable across runtimes. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function hex8(value: number): string {
  return value.toString(16).padStart(8, "0");
}

/**
 * Deterministic UUID (v4 shape) from a slug. Mirrored verbatim in
 * `scripts/seed-tiger.mjs` — change both or neither.
 */
export function seedIdForSlug(slug: string): string {
  const h1 = hex8(fnv1a(`terralens:${slug}:1`));
  const h2 = hex8(fnv1a(`terralens:${slug}:2`));
  const h3 = hex8(fnv1a(`terralens:${slug}:3`));
  const h4 = hex8(fnv1a(`terralens:${slug}:4`));
  return [h1, h2.slice(0, 4), `4${h2.slice(4, 7)}`, `8${h3.slice(1, 4)}`, h3.slice(4) + h4].join(
    "-"
  );
}

interface RawSeedEntry {
  slug: string;
  commonName: string;
  scientificName?: string | null;
  category: string;
  traits?: string[];
  habitat?: string;
  ecology?: string;
  seasonality?: string[];
  safeFacts?: string[];
  region?: string | null;
}

/** Validated bundled records, ready for cache or Tiger upsert. */
export function bundledSeedRecords(createdAt: string = nowIso()): KnowledgeRecord[] {
  const records: KnowledgeRecord[] = [];
  for (const raw of seed.entries as RawSeedEntry[]) {
    const category = ObservationCategorySchema.safeParse(raw.category);
    if (!category.success) {
      console.warn(
        `[knowledge] seed entry "${raw.slug}" has unknown category "${raw.category}" — skipped`
      );
      continue;
    }
    records.push({
      id: seedIdForSlug(raw.slug),
      slug: raw.slug,
      commonName: raw.commonName,
      scientificName: raw.scientificName ?? null,
      category: category.data,
      traits: raw.traits ?? [],
      habitat: raw.habitat ?? "",
      ecology: raw.ecology ?? "",
      seasonality: raw.seasonality ?? [],
      safeFacts: raw.safeFacts ?? [],
      region: raw.region ?? null,
      source: "bundled-seed",
      similarity: null,
      createdAt,
    });
  }
  return records;
}

/**
 * Idempotent first-run seeding of the local knowledge cache. Only writes when
 * the cache is empty, so user-visible data is never clobbered by an upgrade.
 * Returns the number of records written.
 */
export async function ensureSeededKnowledge(): Promise<number> {
  const existing = await knowledgeRepository.count();
  if (existing > 0) return 0;
  return knowledgeRepository.putMany(bundledSeedRecords());
}
