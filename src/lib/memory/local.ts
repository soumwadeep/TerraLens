/**
 * On-device memory journal (spec §34).
 *
 * Local memory never leaves the device unless the user explicitly turns on
 * server sharing in settings. Every read/write goes through the IndexedDB
 * `memories` store; nothing here touches the network.
 */
import { MemoryRecordSchema, type MemoryRecord, type UserPreferences } from "@/lib/domain/types";
import { memoryRepository } from "@/lib/db/repositories";
import { uuid, nowIso } from "@/lib/utils";

export const MEMORY_ENABLED_DEFAULT = true;

/** True when on-device memory is switched on for these preferences. */
export function localMemoryEnabled(prefs: UserPreferences | null): boolean {
  return prefs?.memory.enabled ?? MEMORY_ENABLED_DEFAULT;
}

/**
 * True only when the user has both consented to server memory AND is not in
 * a privacy mode that forbids the network.
 */
export function serverMemoryAllowed(prefs: UserPreferences | null): boolean {
  if (!localMemoryEnabled(prefs)) return false;
  if (!prefs?.memory.shareWithServer) return false;
  if (prefs.privacyMode === "LOCAL_ONLY") return false;
  return true;
}

export interface NewMemoryInput {
  userId: string;
  kind: MemoryRecord["kind"];
  title: string;
  body: string;
  tags?: string[];
  expeditionId?: string | null;
  origin: MemoryRecord["origin"];
}

export async function writeLocalMemory(input: NewMemoryInput): Promise<MemoryRecord> {
  const record = MemoryRecordSchema.parse({
    id: uuid(),
    userId: input.userId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    tags: input.tags ?? [],
    expeditionId: input.expeditionId ?? null,
    syncState: "local",
    createdAt: nowIso(),
    origin: input.origin,
  });
  return memoryRepository.put(record);
}

export async function updateLocalMemory(record: MemoryRecord): Promise<MemoryRecord> {
  return memoryRepository.put(record);
}

export async function recentLocalMemories(userId: string, limit = 12): Promise<MemoryRecord[]> {
  return memoryRepository.byUser(userId, limit);
}

export async function countLocalMemories(userId: string): Promise<number> {
  return memoryRepository.countByUser(userId);
}

export async function deleteLocalMemory(id: string): Promise<void> {
  await memoryRepository.remove(id);
}

export async function clearLocalMemories(userId: string): Promise<number> {
  const records = await memoryRepository.byUser(userId, 10_000);
  for (const record of records) {
    await memoryRepository.remove(record.id);
  }
  return records.length;
}

/** Case-insensitive substring match across title, body and tags. */
export async function searchLocalMemories(
  userId: string,
  query: string,
  limit = 8
): Promise<MemoryRecord[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return recentLocalMemories(userId, limit);
  const all = await memoryRepository.byUser(userId, 1_000);
  return all
    .filter((record) => {
      const haystack = `${record.title} ${record.body} ${record.tags.join(" ")}`.toLowerCase();
      return haystack.includes(needle);
    })
    .slice(0, limit);
}
