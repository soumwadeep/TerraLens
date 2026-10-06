/**
 * Mission engine (spec §10, §11).
 *
 * Deterministic, offline-first mission generation and lifecycle:
 *  - generation is seeded from the expedition id (same expedition -> same
 *    missions, even offline, even in tests),
 *  - every generated mission passes the deterministic safety layer,
 *  - the state machine has exactly the transitions in the spec and throws on
 *    illegal moves (no silent corruption),
 *  - adaptation after an observation uses authored follow-up templates so the
 *    "AI adapts the next mission" beat works with zero connectivity.
 */
import {
  MissionSchema,
  type Environment,
  type Expedition,
  type ExpeditionMode,
  type Interest,
  type Mission,
  type MissionStatus,
  type MissionType,
  type Observation,
} from "@/lib/domain/types";
import { FOLLOW_UP_TEMPLATES, MISSION_TEMPLATES, templateById } from "@/lib/missions/templates";
import { reviewMissionText } from "@/lib/safety/rules";
import { clamp, nowIso, uuid } from "@/lib/utils";

/** Max missions on a board — keeps the checklist readable while outdoors. */
export const MAX_MISSIONS = 9;

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) — deterministic generation
// ---------------------------------------------------------------------------

function seedFromString(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleSeeded<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Eligibility & selection
// ---------------------------------------------------------------------------

export function templateMatchesMode(
  modes: ExpeditionMode[] | "all",
  expeditionMode: ExpeditionMode
): boolean {
  if (modes === "all") return true;
  if (expeditionMode === "surprise") return true; // wildcard — surprise me
  return modes.includes(expeditionMode);
}

export function templateMatchesEnvironment(
  environments: Environment[] | "all",
  environment: Environment
): boolean {
  if (environments === "all") return true;
  if (environment === "unknown") return true; // don't exclude when user picked "not sure"
  return environments.includes(environment);
}

export function templateMatchesInterests(
  templateInterests: Interest[],
  userInterests: Interest[]
): boolean {
  if (userInterests.length === 0) return true;
  if (userInterests.includes("everything")) return true;
  if (templateInterests.includes("everything")) return true;
  return templateInterests.some((i) => userInterests.includes(i));
}

/** Mission count scales with expedition duration: 15m→3 … 60m→6. */
export function missionCountForDuration(durationMinutes: number): number {
  return clamp(Math.ceil(durationMinutes / 6), 3, 6);
}

interface SelectArgs {
  expeditionId: string;
  mode: ExpeditionMode;
  environment: Environment;
  interests: Interest[];
  count: number;
}

/**
 * Deterministic, type-diverse selection. Type diversity is enforced in two
 * passes (prefer unseen types, then at most one repeat) so a board never
 * becomes "five identical FIND missions".
 */
export function selectTemplates(args: SelectArgs): typeof MISSION_TEMPLATES {
  const rand = seededRandom(seedFromString(`expedition:${args.expeditionId}`));
  const eligible = MISSION_TEMPLATES.filter(
    (t) =>
      templateMatchesMode(t.modes, args.mode) &&
      templateMatchesEnvironment(t.environments, args.environment) &&
      templateMatchesInterests(t.interests, args.interests)
  );

  // Safety: templates that fail the deterministic scan are never selectable.
  const safe = eligible.filter(
    (t) => reviewMissionText(t.title, t.instruction).level !== "blocked"
  );

  const shuffled = shuffleSeeded(safe, rand);
  const picked: typeof MISSION_TEMPLATES = [];
  const typeCount = new Map<MissionType, number>();

  for (const maxPerType of [0, 1]) {
    for (const t of shuffled) {
      if (picked.length >= args.count) break;
      if (picked.includes(t)) continue;
      const used = typeCount.get(t.type) ?? 0;
      if (used > maxPerType) continue;
      picked.push(t);
      typeCount.set(t.type, used + 1);
    }
    if (picked.length >= args.count) break;
  }
  // Backfill if the eligible pool was too small and still diverse-constrained.
  for (const t of shuffled) {
    if (picked.length >= args.count) break;
    if (!picked.includes(t)) picked.push(t);
  }
  return picked;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export function missionFromTemplate(
  templateId: string,
  expeditionId: string,
  orderIndex: number,
  status: MissionStatus = "LOCKED"
): Mission | null {
  const template = templateById(templateId);
  if (!template) return null;
  const safety = reviewMissionText(template.title, template.instruction);
  if (safety.level === "blocked") return null;
  const now = nowIso();
  return MissionSchema.parse({
    id: uuid(),
    expeditionId,
    type: template.type,
    title: template.title,
    instruction: template.instruction,
    whyItMatters: template.whyItMatters,
    estimatedMinutes: template.estimatedMinutes,
    status,
    orderIndex,
    createdAt: now,
    completedAt: null,
    observationIds: [],
    generatedBy: "rules",
    offlineCapable: template.offlineCapable,
    safetyMetadata: safety,
    syncStatus: "local-only",
    origin: "live",
    updatedAt: now,
  });
}

export interface GenerateMissionsArgs {
  expedition: Pick<Expedition, "id" | "mode" | "environment" | "durationMinutes">;
  interests: Interest[];
}

/**
 * Generate the initial mission board: first mission AVAILABLE, the rest LOCKED
 * so the loop is "one clear mission at a time" (spec §12).
 */
export function generateMissions(args: GenerateMissionsArgs): Mission[] {
  const count = missionCountForDuration(args.expedition.durationMinutes);
  const templates = selectTemplates({
    expeditionId: args.expedition.id,
    mode: args.expedition.mode,
    environment: args.expedition.environment,
    interests: args.interests,
    count,
  });
  return templates
    .map((t, i) =>
      missionFromTemplate(t.id, args.expedition.id, i, i === 0 ? "AVAILABLE" : "LOCKED")
    )
    .filter((m): m is Mission => m !== null);
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

const LEGAL_TRANSITIONS: Record<MissionStatus, MissionStatus[]> = {
  LOCKED: ["AVAILABLE", "EXPIRED"],
  AVAILABLE: ["ACTIVE", "COMPLETED", "SKIPPED", "EXPIRED"],
  ACTIVE: ["COMPLETED", "SKIPPED", "EXPIRED"],
  COMPLETED: [],
  SKIPPED: ["ACTIVE", "AVAILABLE"],
  EXPIRED: [],
};

export function canTransition(from: MissionStatus, to: MissionStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

/**
 * Apply a status transition. Throws on illegal moves so a programming error
 * surfaces in tests instead of silently corrupting a mission board.
 */
export function transitionMission(
  mission: Mission,
  next: MissionStatus,
  opts: { at?: string; observationId?: string } = {}
): Mission {
  if (mission.status === next) return mission;
  if (!canTransition(mission.status, next)) {
    throw new Error(`Illegal mission transition ${mission.status} -> ${next} (${mission.id})`);
  }
  const at = opts.at ?? nowIso();
  const updated: Mission = {
    ...mission,
    status: next,
    updatedAt: at,
    completedAt: next === "COMPLETED" ? at : mission.completedAt,
    observationIds: opts.observationId
      ? Array.from(new Set([...mission.observationIds, opts.observationId]))
      : mission.observationIds,
    syncStatus: mission.syncStatus === "synced" ? "queued" : mission.syncStatus,
  };
  return MissionSchema.parse(updated);
}

/**
 * Unlock the next LOCKED mission (in board order) once something completes.
 * Returns the full updated board.
 */
export function unlockNextMission(missions: Mission[]): Mission[] {
  const hasAvailableOrActive = missions.some(
    (m) => m.status === "AVAILABLE" || m.status === "ACTIVE"
  );
  if (hasAvailableOrActive) return missions;
  const next = missions
    .filter((m) => m.status === "LOCKED")
    .sort((a, b) => a.orderIndex - b.orderIndex)[0];
  if (!next) return missions;
  return missions.map((m) => (m.id === next.id ? transitionMission(m, "AVAILABLE") : m));
}

export interface MissionProgress {
  completed: number;
  skipped: number;
  total: number;
  active: number;
  percent: number;
}

export function missionProgress(missions: Mission[]): MissionProgress {
  const total = missions.length;
  const completed = missions.filter((m) => m.status === "COMPLETED").length;
  const skipped = missions.filter((m) => m.status === "SKIPPED").length;
  const active = missions.filter((m) => m.status === "ACTIVE").length;
  return {
    completed,
    skipped,
    total,
    active,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

export function nextFocusMission(missions: Mission[]): Mission | null {
  return (
    missions.find((m) => m.status === "ACTIVE") ??
    missions.find((m) => m.status === "AVAILABLE") ??
    missions.filter((m) => m.status === "LOCKED").sort((a, b) => a.orderIndex - b.orderIndex)[0] ??
    null
  );
}

// ---------------------------------------------------------------------------
// Adaptation after an observation ("AI adapts the next mission", offline path)
// ---------------------------------------------------------------------------

export interface AdaptationResult {
  missions: Mission[];
  added: Mission[];
  reason: string;
}

/**
 * Rules-based adaptation: after an observation, offer authored follow-up
 * missions matching the observed category. Deduped by title, capped at
 * MAX_MISSIONS. (The AI adapter can propose richer adaptations when online;
 * this path guarantees the loop works with zero connectivity — spec §5.)
 */
export function adaptMissionsAfterObservation(
  missions: Mission[],
  observation: Pick<Observation, "category">,
  expeditionId: string
): AdaptationResult {
  if (missions.length >= MAX_MISSIONS) {
    return { missions, added: [], reason: "board-full" };
  }
  const followUps = FOLLOW_UP_TEMPLATES[observation.category] ?? FOLLOW_UP_TEMPLATES.unknown;
  const existingTitles = new Set(missions.map((m) => m.title));
  const added: Mission[] = [];
  let orderIndex = missions.reduce((max, m) => Math.max(max, m.orderIndex), -1) + 1;

  for (const templateId of followUps) {
    if (missions.length + added.length >= MAX_MISSIONS) break;
    const template = templateById(templateId);
    if (!template || existingTitles.has(template.title)) continue;
    const mission = missionFromTemplate(templateId, expeditionId, orderIndex, "AVAILABLE");
    if (!mission) continue;
    existingTitles.add(mission.title);
    added.push(mission);
    orderIndex += 1;
  }

  if (added.length === 0) {
    return { missions, added: [], reason: "no-new-follow-ups" };
  }
  return {
    missions: [...missions, ...added],
    added,
    reason: `follow-up:${observation.category}`,
  };
}

/** Types currently represented on a board — used by diversity metrics/tests. */
export function missionTypeCoverage(missions: Mission[]): MissionType[] {
  return Array.from(new Set(missions.map((m) => m.type)));
}
