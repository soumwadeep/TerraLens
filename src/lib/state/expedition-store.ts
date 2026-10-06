"use client";

/**
 * Expedition store (spec §8–§17).
 *
 * Owns the full expedition loop: start → mission board → capture → adapt →
 * pocket time → wrap-up → deterministic Grass Score (expedition scope) plus a
 * day-scope aggregate across today's expeditions.
 *
 * Every write goes through the validating repositories; every live write
 * queues an idempotent sync op. When IndexedDB is unavailable the loop still
 * runs in memory (the UI layer says so) — nothing pretends to be saved.
 */
import { create } from "zustand";
import {
  AccessibilityPreferencesSchema,
  MissionSchema,
  ObservationSchema,
  type ApproxLocation,
  type CuriosityAction,
  type Environment,
  type Expedition,
  type ExpeditionMode,
  type ExpeditionStats,
  type GrassScore,
  type Mission,
  type Observation,
  type ObservationCategory,
  type ObservationType,
} from "@/lib/domain/types";
import {
  expeditionRepository,
  grassScoreEventRepository,
  grassScoreRepository,
  mediaRepository,
  missionRepository,
  observationRepository,
} from "@/lib/db/repositories";
import {
  adaptMissionsAfterObservation,
  generateMissions,
  missionProgress,
  transitionMission,
  unlockNextMission,
  MAX_MISSIONS,
} from "@/lib/missions/engine";
import { generateCuriosityAction } from "@/lib/curiosity/engine";
import { analyzeObservation, selectAnalysisOrder } from "@/lib/ai/analysis";
import { computeGrassScore, computeStreakDays, grassRankFor } from "@/lib/scoring/grass-score";
import { queueForSync } from "@/lib/sync/queue";
import { recordExpeditionMemory } from "@/lib/memory";
import { startTracker, stopTracker, flushTracker } from "@/lib/state/expedition-tracker";
import { useAppStore } from "@/lib/state/app-store";
import { blobToDataUrl, type ProcessedPhoto, type RecordedAudio } from "@/lib/media/capture";
import { dateKey, nowIso, uuid, clamp } from "@/lib/utils";

export interface StartExpeditionInput {
  mode: ExpeditionMode;
  environment: Environment;
  durationMinutes: number;
  title?: string;
}

export interface CaptureObservationInput {
  type: ObservationType;
  category: ObservationCategory;
  note?: string;
  missionId?: string | null;
  photo?: ProcessedPhoto | null;
  audio?: RecordedAudio | null;
  location?: ApproxLocation | null;
}

export interface CaptureObservationResult {
  observation: Observation;
  curiosityAction: CuriosityAction | null;
  addedMissions: Mission[];
}

export interface EndExpeditionResult {
  expedition: Expedition;
  score: GrassScore;
  dayScore: GrassScore;
}

interface ExpeditionState {
  /** True once we have checked for a resumable active expedition. */
  initialized: boolean;
  /** The single globally-running expedition, if any. */
  active: Expedition | null;
  /** The expedition open on a detail/pocket surface. */
  viewing: Expedition | null;
  missions: Mission[];
  observations: Observation[];
  /** Observations whose AI analysis is currently running (drives "Understanding…"). */
  analyzingObservationIds: string[];
  busy: boolean;
  endResult: EndExpeditionResult | null;

  initActive: () => Promise<void>;
  start: (input: StartExpeditionInput) => Promise<Expedition | null>;
  ensureLoaded: (id: string) => Promise<Expedition | null>;
  unloadViewing: () => void;
  activateMission: (missionId: string) => Promise<void>;
  completeMission: (missionId: string, observationId?: string) => Promise<void>;
  skipMission: (missionId: string) => Promise<void>;
  retryMission: (missionId: string) => Promise<void>;
  captureObservation: (input: CaptureObservationInput) => Promise<CaptureObservationResult | null>;
  endExpedition: (opts?: { story?: string }) => Promise<EndExpeditionResult | null>;
  abandonExpedition: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function storageAvailable(): boolean {
  return useAppStore.getState().storageAvailable;
}

function currentUserId(): string | null {
  return useAppStore.getState().user?.id ?? null;
}

/**
 * Entity snapshot for the sync queue. The queue stores what the backend must
 * persist; transport bookkeeping (`syncStatus`) is not part of the entity.
 */
function syncPayload(entity: object): Record<string, unknown> {
  const { syncStatus: _syncStatus, ...rest } = entity as { syncStatus?: unknown };
  return rest as Record<string, unknown>;
}

async function persistExpedition(
  next: Expedition,
  operation: "CREATE" | "UPDATE"
): Promise<Expedition> {
  const updatedAt = nowIso();
  const syncStatus = await queueForSync({
    entityType: "expedition",
    entityId: next.id,
    operation,
    origin: next.origin,
    payload: syncPayload({ ...next, updatedAt }),
  });
  const value = { ...next, syncStatus, updatedAt } as Expedition;
  if (storageAvailable()) {
    try {
      await expeditionRepository.save(value);
    } catch {
      // degraded mode — the in-memory state remains authoritative
    }
  }
  return value;
}

async function persistMissions(missions: Mission[]): Promise<Mission[]> {
  const out: Mission[] = [];
  for (const m of missions) {
    const syncStatus = await queueForSync({
      entityType: "mission",
      entityId: m.id,
      operation: "UPDATE",
      origin: m.origin,
      payload: syncPayload(m),
    });
    out.push(MissionSchema.parse({ ...m, syncStatus }));
  }
  if (storageAvailable()) {
    try {
      await missionRepository.saveMany(out);
    } catch {
      // degraded mode
    }
  }
  return out;
}

function uniqueCategories(observations: Observation[]): number {
  return new Set(observations.map((o) => o.category).filter((c) => c !== "unknown")).size;
}

function uniqueTags(observations: Observation[]): number {
  return new Set(observations.flatMap((o) => o.tags)).size;
}

/** Observations bringing a first-time category or tag (10 pts each upstream). */
function countNewDiscoveries(target: Observation[], prior: Observation[]): number {
  const seenCategories = new Set(prior.map((o) => o.category));
  const seenTags = new Set(prior.flatMap((o) => o.tags));
  let count = 0;
  for (const o of target) {
    const newCategory = o.category !== "unknown" && !seenCategories.has(o.category);
    const newTag = o.tags.some((t) => !seenTags.has(t));
    if (newCategory || newTag) count += 1;
    seenCategories.add(o.category);
    for (const t of o.tags) seenTags.add(t);
  }
  return count;
}

/** Update the in-memory copies when an entity we track changes. */
function patchTracked(
  state: Pick<ExpeditionState, "active" | "viewing">,
  updated: Expedition
): { active: Expedition | null; viewing: Expedition | null } {
  return {
    active: state.active?.id === updated.id ? updated : state.active,
    viewing: state.viewing?.id === updated.id ? updated : state.viewing,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useExpeditionStore = create<ExpeditionState>()((set, get) => ({
  initialized: false,
  active: null,
  viewing: null,
  missions: [],
  observations: [],
  analyzingObservationIds: [],
  busy: false,
  endResult: null,

  initActive: async () => {
    if (get().initialized) return;
    if (!storageAvailable()) {
      set({ initialized: true });
      return;
    }
    try {
      const active = await expeditionRepository.active();
      set({ initialized: true, active });
      if (active) {
        startTracking(active, get, set);
      }
    } catch {
      set({ initialized: true });
    }
  },

  start: async (input) => {
    const userId = currentUserId();
    if (!userId) return null;
    const { active } = get();
    if (active) return active; // one expedition at a time — resume the running one

    const now = nowIso();
    const preferences = useAppStore.getState().preferences;
    const expeditionRecord: Expedition = {
      id: uuid(),
      userId,
      title:
        input.title?.trim().slice(0, 120) ||
        `${input.mode === "surprise" ? "Mystery walk" : "Expedition"} · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
      durationMinutes: clamp(Math.round(input.durationMinutes), 1, 480),
      mode: input.mode,
      environment: input.environment,
      status: "ACTIVE",
      startedAt: now,
      endedAt: null,
      dateKey: dateKey(new Date()),
      stats: {
        elapsedSeconds: 0,
        pocketSeconds: 0,
        screenActiveSeconds: 0,
        distanceMeters: null,
        lastStatsAt: now,
        interruptions: 0,
      },
      story: null,
      grassScoreId: null,
      syncStatus: "local-only",
      origin: "live",
      createdAt: now,
      updatedAt: now,
    };

    const saved = await persistExpedition(expeditionRecord, "CREATE");
    const missions = generateMissions({
      expedition: saved,
      interests: preferences?.interests ?? [],
    });
    const savedMissions = await persistMissions(missions);

    set({
      active: saved,
      viewing: saved,
      missions: savedMissions,
      observations: [],
      endResult: null,
    });
    startTracking(saved, get, set);
    return saved;
  },

  ensureLoaded: async (id) => {
    const existing = get().viewing;
    if (existing?.id === id) return existing;
    // A different expedition is loaded — clear stale board content first.
    set({ viewing: null, missions: [], observations: [], endResult: null });

    let expedition: Expedition | null = null;
    if (storageAvailable()) {
      try {
        expedition = await expeditionRepository.get(id);
      } catch {
        expedition = null;
      }
    }
    // The just-ended expedition lives in memory only when storage is missing.
    if (!expedition && get().endResult?.expedition.id === id) {
      expedition = get().endResult!.expedition;
    }
    if (!expedition && get().active?.id === id) {
      expedition = get().active;
    }
    if (!expedition) return null;

    let missions: Mission[] = [];
    let observations: Observation[] = [];
    let endResult = get().endResult?.expedition.id === id ? get().endResult : null;
    if (storageAvailable()) {
      try {
        [missions, observations] = await Promise.all([
          missionRepository.byExpedition(id),
          observationRepository.byExpedition(id),
        ]);
        if (expedition.status === "COMPLETED" && !endResult) {
          const [score, dayScores] = await Promise.all([
            grassScoreRepository.byExpedition(id),
            grassScoreRepository.byDateKey(expedition.dateKey),
          ]);
          if (score) {
            endResult = {
              expedition,
              score,
              dayScore: dayScores.find((s) => s.scope === "day") ?? score,
            };
          }
        }
      } catch {
        // degraded — show what we have
      }
    }
    set({ viewing: expedition, missions, observations, endResult });
    if (expedition.status === "ACTIVE" && get().active?.id === expedition.id) {
      startTracking(expedition, get, set);
    }
    return expedition;
  },

  unloadViewing: () => set({ viewing: null, missions: [], observations: [] }),

  activateMission: async (missionId) => {
    const { missions } = get();
    const mission = missions.find((m) => m.id === missionId);
    if (!mission || (mission.status !== "AVAILABLE" && mission.status !== "LOCKED")) return;
    const next =
      mission.status === "LOCKED"
        ? transitionMission(transitionMission(mission, "AVAILABLE"), "ACTIVE")
        : transitionMission(mission, "ACTIVE");
    const updated = await persistMissions([next]);
    set({ missions: missions.map((m) => (m.id === missionId ? updated[0]! : m)) });
  },

  completeMission: async (missionId, observationId) => {
    const { missions } = get();
    const mission = missions.find((m) => m.id === missionId);
    if (!mission || mission.status === "COMPLETED" || mission.status === "EXPIRED") return;
    const completed = transitionMission(mission, "COMPLETED", { observationId });
    const board = missions.map((m) => (m.id === missionId ? completed : m));
    const unlocked = unlockNextMission(board);
    const changed = unlocked.filter((m) => {
      const before = missions.find((x) => x.id === m.id);
      return (
        !before ||
        before.status !== m.status ||
        before.observationIds.join() !== m.observationIds.join()
      );
    });
    const saved = await persistMissions(changed);
    const savedById = new Map(saved.map((m) => [m.id, m]));
    set({ missions: unlocked.map((m) => savedById.get(m.id) ?? m) });

    const userId = currentUserId();
    if (userId && storageAvailable()) {
      try {
        await grassScoreEventRepository.add({
          id: uuid(),
          userId,
          expeditionId: mission.expeditionId,
          type: "mission",
          points: 50,
          detail: `Mission completed: ${mission.title} (counts toward the 200-pt ceiling)`,
          createdAt: nowIso(),
          origin: "live",
        });
      } catch {
        // event log is best-effort
      }
    }
  },

  skipMission: async (missionId) => {
    const { missions } = get();
    const mission = missions.find((m) => m.id === missionId);
    if (!mission || (mission.status !== "AVAILABLE" && mission.status !== "ACTIVE")) return;
    const skipped = transitionMission(mission, "SKIPPED");
    const board = missions.map((m) => (m.id === missionId ? skipped : m));
    const unlocked = unlockNextMission(board);
    const changed = unlocked.filter((m) => {
      const before = missions.find((x) => x.id === m.id);
      return !before || before.status !== m.status;
    });
    const saved = await persistMissions(changed);
    const savedById = new Map(saved.map((m) => [m.id, m]));
    set({ missions: unlocked.map((m) => savedById.get(m.id) ?? m) });
  },

  retryMission: async (missionId) => {
    const { missions } = get();
    const mission = missions.find((m) => m.id === missionId);
    if (!mission || mission.status !== "SKIPPED") return;
    const retried = transitionMission(mission, "ACTIVE");
    const saved = await persistMissions([retried]);
    set({ missions: missions.map((m) => (m.id === missionId ? saved[0]! : m)) });
  },

  captureObservation: async (input) => {
    const { viewing, active, missions } = get();
    const expedition = viewing?.status === "ACTIVE" ? viewing : active;
    const userId = currentUserId();
    if (!expedition || expedition.status !== "ACTIVE" || !userId) return null;

    const now = nowIso();
    const observationId = uuid();

    // --- media (device-local by default) -----------------------------------
    const mediaIds: string[] = [];
    if (input.type === "photo" && input.photo) {
      const photo = input.photo;
      const mediaId = uuid();
      const blobKey = `media/${observationId}/${mediaId}`;
      if (storageAvailable()) {
        try {
          await mediaRepository.putBlob({
            key: blobKey,
            observationId,
            mimeType: photo.mimeType,
            blob: photo.blob,
            sizeBytes: photo.sizeBytes,
          });
          await mediaRepository.saveAsset({
            id: mediaId,
            observationId,
            kind: "photo",
            mimeType: photo.mimeType,
            sizeBytes: photo.sizeBytes,
            durationMs: null,
            width: photo.width,
            height: photo.height,
            blobKey,
            sha256: photo.sha256,
            storage: "indexeddb",
            uploadedAt: null,
            createdAt: now,
          });
          mediaIds.push(mediaId);
        } catch {
          // storage degraded — capture still recorded as a metadata note
        }
      }
    }
    if (input.type === "audio" && input.audio) {
      const audio = input.audio;
      const mediaId = uuid();
      const blobKey = `media/${observationId}/${mediaId}`;
      if (storageAvailable()) {
        try {
          await mediaRepository.putBlob({
            key: blobKey,
            observationId,
            mimeType: audio.mimeType,
            blob: audio.blob,
            sizeBytes: audio.sizeBytes,
          });
          await mediaRepository.saveAsset({
            id: mediaId,
            observationId,
            kind: "audio",
            mimeType: audio.mimeType,
            sizeBytes: audio.sizeBytes,
            durationMs: audio.durationMs,
            width: null,
            height: null,
            blobKey,
            sha256: audio.sha256,
            storage: "indexeddb",
            uploadedAt: null,
            createdAt: now,
          });
          mediaIds.push(mediaId);
        } catch {
          // degraded
        }
      }
    }

    // --- observation record --------------------------------------------------
    const observation: Observation = {
      id: observationId,
      expeditionId: expedition.id,
      missionId: input.missionId ?? null,
      userId,
      type: input.type,
      capturedAt: now,
      note: (input.note ?? "").trim().slice(0, 4000),
      tags: [],
      category: input.category,
      mediaIds,
      analysis: null, // Phase 3 adapters fill this — never fabricated here
      userCorrection: null,
      privacy: "local-only",
      location: input.location ?? null,
      syncStatus: "local-only",
      origin: "live",
      createdAt: now,
      updatedAt: now,
    };
    const syncStatus = await queueForSync({
      entityType: "observation",
      entityId: observation.id,
      operation: "CREATE",
      payload: syncPayload(observation),
    });
    const savedObservation: Observation = { ...observation, syncStatus };
    if (storageAvailable()) {
      try {
        await observationRepository.save(savedObservation);
      } catch {
        // degraded
      }
    }

    // --- link to mission (without completing it) -----------------------------
    let nextMissions = missions;
    if (input.missionId) {
      const mission = missions.find((m) => m.id === input.missionId);
      if (mission && !mission.observationIds.includes(observation.id)) {
        const linked: Mission = MissionSchema.parse({
          ...mission,
          observationIds: [...mission.observationIds, observation.id],
          updatedAt: now,
        });
        const saved = await persistMissions([linked]);
        nextMissions = missions.map((m) => (m.id === linked.id ? saved[0]! : m));
      }
    }

    // --- curiosity action (rules path; AI adapter plugs in later) ------------
    const preferences = useAppStore.getState().preferences;
    const priorObservations = get().observations;
    const minutesRemaining = Math.max(
      0,
      expedition.durationMinutes - Math.floor((expedition.stats.elapsedSeconds || 0) / 60)
    );
    let curiosityAction: CuriosityAction | null = null;
    try {
      curiosityAction = generateCuriosityAction({
        observation: {
          id: observation.id,
          category: observation.category,
          note: observation.note,
        },
        expedition: {
          mode: expedition.mode,
          environment: expedition.environment,
          title: expedition.title,
        },
        recentCategories: priorObservations.map((o) => o.category),
        completedMissionTypes: nextMissions
          .filter((m) => m.status === "COMPLETED")
          .map((m) => m.type),
        accessibility: preferences?.accessibility ?? AccessibilityPreferencesSchema.parse({}),
        minutesRemaining,
      });
    } catch {
      curiosityAction = null; // rules path failure must never block a capture
    }

    // --- adapt the mission board (offline-authored follow-ups) --------------
    let addedMissions: Mission[] = [];
    try {
      const adapted = adaptMissionsAfterObservation(
        nextMissions,
        { category: observation.category },
        expedition.id
      );
      if (adapted.added.length > 0) {
        addedMissions = await persistMissions(adapted.added);
        nextMissions = [...nextMissions, ...addedMissions];
      }
    } catch {
      // adaptation is additive only — a failure changes nothing
    }

    set({
      missions: nextMissions,
      observations: [...get().observations, savedObservation],
    });

    // --- AI understanding (async; the loop never waits on it) ----------------
    const photoBlob =
      input.type === "photo" && input.photo && input.photo.blob.size > 0 ? input.photo.blob : null;
    void runPostCaptureAnalysis(savedObservation, expedition, photoBlob);

    return { observation: savedObservation, curiosityAction, addedMissions };
  },

  endExpedition: async (opts) => {
    const { viewing, active, missions: boardMissions } = get();
    const expedition = viewing?.status === "ACTIVE" ? viewing : active;
    if (!expedition || get().busy) return null;
    set({ busy: true });
    try {
      const finalStats: ExpeditionStats = stopTracker() ?? expedition.stats;
      const userId = currentUserId();
      if (!userId) return null;
      const now = nowIso();

      // Ensure we score a complete board even if only the active ref was set.
      let missions = boardMissions;
      let observations = get().observations;
      if (storageAvailable()) {
        try {
          if (missions.length === 0 || missions[0]?.expeditionId !== expedition.id) {
            missions = await missionRepository.byExpedition(expedition.id);
          }
          if (observations.length === 0 || observations[0]?.expeditionId !== expedition.id) {
            observations = await observationRepository.byExpedition(expedition.id);
          }
        } catch {
          // degraded — score what we hold in memory
        }
      }

      const finishedBase: Expedition = {
        ...expedition,
        status: "COMPLETED",
        endedAt: now,
        story: opts?.story?.trim().slice(0, 4000) || null,
        stats: finalStats,
      };
      const finished = await persistExpedition(finishedBase, "UPDATE");

      // --- history (before today) for novelty + diversity ---------------------
      let historyObservations: Observation[] = [];
      const todayKey = finished.dateKey;
      if (storageAvailable()) {
        try {
          const allExpeditions = (await expeditionRepository.all()).filter(
            (e) => e.origin === "live" && e.status === "COMPLETED"
          );
          const earlier = allExpeditions.filter((e) => e.dateKey < todayKey);
          const histories = await Promise.all(
            earlier.map((e) => observationRepository.byExpedition(e.id))
          );
          historyObservations = histories.flat().filter((o) => o.origin === "live");
        } catch {
          historyObservations = [];
        }
      }

      const todayObservations = observations.filter((o) => o.origin === "live");
      const completed = missions.filter((m) => m.status === "COMPLETED").length;
      const skipped = missions.filter((m) => m.status === "SKIPPED").length;

      const scoreDateKeys = new Set<string>([todayKey]);
      if (storageAvailable()) {
        try {
          const scores = await grassScoreRepository.all();
          for (const s of scores) {
            if (s.origin === "live") scoreDateKeys.add(s.dateKey);
          }
        } catch {
          // streak falls back to today alone
        }
      }
      const streakDays = computeStreakDays(Array.from(scoreDateKeys), todayKey);

      // --- expedition-scope score --------------------------------------------
      const expeditionResult = computeGrassScore({
        outdoorSeconds: finalStats.elapsedSeconds,
        pocketSeconds: finalStats.pocketSeconds,
        screenActiveSeconds: finalStats.screenActiveSeconds,
        distanceMeters: finalStats.distanceMeters,
        missionsCompleted: completed,
        missionsSkipped: skipped,
        observationCount: todayObservations.length,
        uniqueCategories: uniqueCategories(todayObservations),
        uniqueTags: uniqueTags(todayObservations),
        newDiscoveries: countNewDiscoveries(todayObservations, historyObservations),
        streakDays,
        environment: finished.environment,
        interruptionHeavy: finalStats.interruptions >= 8,
      });

      const expeditionScore: GrassScore = {
        id: uuid(),
        userId,
        expeditionId: finished.id,
        scope: "expedition",
        dateKey: todayKey,
        score: expeditionResult.score,
        rank: expeditionResult.rank,
        components: expeditionResult.components,
        notes: expeditionResult.notes,
        gpsAvailable: expeditionResult.gpsAvailable,
        computedAt: now,
        origin: "live",
      };
      if (storageAvailable()) {
        try {
          await grassScoreRepository.save(expeditionScore);
        } catch {
          // degraded
        }
      }
      await queueForSync({
        entityType: "grassScore",
        entityId: expeditionScore.id,
        operation: "CREATE",
        payload: syncPayload(expeditionScore),
      });

      // --- day-scope aggregate across today's completed expeditions -----------
      let dayScore: GrassScore = expeditionScore;
      if (storageAvailable()) {
        try {
          const allExpeditions = (await expeditionRepository.all()).filter(
            (e) => e.origin === "live" && e.status === "COMPLETED" && e.dateKey === todayKey
          );
          const perExpedition = await Promise.all(
            allExpeditions.map(async (e) => ({
              expedition: e,
              missions: await missionRepository.byExpedition(e.id),
              observations: (await observationRepository.byExpedition(e.id)).filter(
                (o) => o.origin === "live"
              ),
            }))
          );
          const dayObservations = perExpedition.flatMap((p) => p.observations);
          const distances = perExpedition
            .map((p) => p.expedition.stats.distanceMeters)
            .filter((d): d is number => d !== null);
          const dayInputs = {
            outdoorSeconds: perExpedition.reduce(
              (sum, p) => sum + p.expedition.stats.elapsedSeconds,
              0
            ),
            pocketSeconds: perExpedition.reduce(
              (sum, p) => sum + p.expedition.stats.pocketSeconds,
              0
            ),
            screenActiveSeconds: perExpedition.reduce(
              (sum, p) => sum + p.expedition.stats.screenActiveSeconds,
              0
            ),
            distanceMeters: distances.length > 0 ? distances.reduce((a, b) => a + b, 0) : null,
            missionsCompleted: perExpedition.reduce(
              (sum, p) => sum + p.missions.filter((m) => m.status === "COMPLETED").length,
              0
            ),
            missionsSkipped: perExpedition.reduce(
              (sum, p) => sum + p.missions.filter((m) => m.status === "SKIPPED").length,
              0
            ),
            observationCount: dayObservations.length,
            uniqueCategories: uniqueCategories(dayObservations),
            uniqueTags: uniqueTags(dayObservations),
            newDiscoveries: countNewDiscoveries(dayObservations, historyObservations),
            streakDays,
            environment: finished.environment,
            interruptionHeavy:
              perExpedition.reduce((sum, p) => sum + p.expedition.stats.interruptions, 0) >= 8,
          };
          const dayResult = computeGrassScore(dayInputs);
          const existingDay = (await grassScoreRepository.byDateKey(todayKey)).find(
            (s) => s.scope === "day"
          );
          dayScore = {
            id: existingDay?.id ?? uuid(),
            userId,
            expeditionId: null,
            scope: "day",
            dateKey: todayKey,
            score: dayResult.score,
            rank: dayResult.rank,
            components: dayResult.components,
            notes: dayResult.notes,
            gpsAvailable: dayResult.gpsAvailable,
            computedAt: now,
            origin: "live",
          };
          await grassScoreRepository.save(dayScore);
          await queueForSync({
            entityType: "grassScore",
            entityId: dayScore.id,
            operation: existingDay ? "UPDATE" : "CREATE",
            payload: syncPayload(dayScore),
          });
          await grassScoreEventRepository.add({
            id: uuid(),
            userId,
            expeditionId: finished.id,
            type: "expedition",
            points: expeditionResult.score,
            detail: `${finished.title} — ${grassRankFor(expeditionResult.score)} (${expeditionResult.score}/1000)`,
            createdAt: now,
            origin: "live",
          });
          if (streakDays >= 2) {
            await grassScoreEventRepository.add({
              id: uuid(),
              userId,
              expeditionId: finished.id,
              type: "streak",
              points: streakDays * 10,
              detail: `${streakDays}-day exploration streak — today counts.`,
              createdAt: now,
              origin: "live",
            });
          }
        } catch {
          // day aggregation is a bonus view — the expedition score still stands
        }
      }

      const finalExpedition = await persistExpedition(
        { ...finished, grassScoreId: expeditionScore.id },
        "UPDATE"
      );

      // --- long-term memory (fire-and-forget; spec §33) ----------------------
      // Local write when memory is enabled; server mirror only with explicit
      // opt-in. Additive only — a failure changes nothing about the wrap-up.
      void recordExpeditionMemory({
        userId,
        expeditionId: finalExpedition.id,
        title: finalExpedition.title,
        environment: finalExpedition.environment,
        observationCount: todayObservations.length,
        durationMinutes: finalStats.elapsedSeconds > 0 ? finalStats.elapsedSeconds / 60 : null,
        grassScore: expeditionResult.score,
        origin: finalExpedition.origin,
        prefs: useAppStore.getState().preferences,
      }).catch(() => {
        // never blocks the expedition wrap-up
      });

      const result: EndExpeditionResult = {
        expedition: finalExpedition,
        score: expeditionScore,
        dayScore,
      };
      set((state) => ({
        ...patchTracked(state, finalExpedition),
        active: state.active?.id === finalExpedition.id ? null : state.active,
        viewing: finalExpedition,
        missions,
        observations,
        endResult: result,
      }));
      return result;
    } finally {
      set({ busy: false });
    }
  },

  abandonExpedition: async () => {
    const { viewing, active } = get();
    const expedition = viewing?.status === "ACTIVE" ? viewing : active;
    if (!expedition) return;
    const finalStats = stopTracker() ?? expedition.stats;
    const abandoned: Expedition = {
      ...expedition,
      status: "ABANDONED",
      endedAt: nowIso(),
      stats: finalStats,
    };
    const saved = await persistExpedition(abandoned, "UPDATE");
    set((state) => ({
      ...patchTracked(state, saved),
      active: state.active?.id === saved.id ? null : state.active,
      viewing: state.viewing?.id === saved.id ? saved : state.viewing,
    }));
  },
}));

// ---------------------------------------------------------------------------
// Tracking glue — persists throttled stats while the expedition is ACTIVE
// ---------------------------------------------------------------------------

const PERSIST_THROTTLE_MS = 15000;

function startTracking(
  expedition: Expedition,
  get: () => ExpeditionState,
  set: (
    partial: Partial<ExpeditionState> | ((s: ExpeditionState) => Partial<ExpeditionState>)
  ) => void
): void {
  const preferences = useAppStore.getState().preferences;
  let lastPersist = 0;

  const applyStats = (stats: ExpeditionStats): void => {
    const current = get().active ?? get().viewing;
    if (!current || current.id !== expedition.id) return;
    const next = { ...current, stats };
    set((state) => patchTracked(state, next));
  };

  startTracker({
    expeditionId: expedition.id,
    stats: expedition.stats,
    locationMode: preferences?.locationMode ?? "NONE",
    callbacks: {
      onTick: (stats) => {
        applyStats(stats);
        const now = Date.now();
        if (now - lastPersist >= PERSIST_THROTTLE_MS) {
          lastPersist = now;
          void persistStatsThrottled(expedition.id, stats, get);
        }
      },
      onFlush: (stats) => {
        applyStats(stats);
        lastPersist = Date.now();
        void persistStatsThrottled(expedition.id, stats, get);
      },
    },
  });
}

async function persistStatsThrottled(
  expeditionId: string,
  stats: ExpeditionStats,
  get: () => ExpeditionState
): Promise<void> {
  if (!storageAvailable()) return;
  const current =
    get().active?.id === expeditionId
      ? get().active
      : get().viewing?.id === expeditionId
        ? get().viewing
        : null;
  if (!current || current.status !== "ACTIVE") return;
  try {
    await expeditionRepository.save({ ...current, stats, updatedAt: nowIso() });
  } catch {
    // stats are recomputable from wall clock — never block the UI on this
  }
}

/**
 * Post-capture AI understanding (spec §24–§27).
 *
 * Runs AFTER the capture has already been persisted and shown, so the
 * expedition loop never waits on a model. Behaviour that is deliberately
 * absent here: silently dropping or inventing an analysis. Every outcome is
 * either a persisted AIAnalysis or — when nothing was configured at all —
 * a quiet no-op (the user sees no "unavailable" noise for a runtime they
 * never asked for).
 */
async function runPostCaptureAnalysis(
  observation: Observation,
  expedition: Expedition,
  photoBlob: Blob | null
): Promise<void> {
  const appState = useAppStore.getState();
  const preferences = appState.preferences;
  if (!preferences) return;

  const set = useExpeditionStore.setState;
  const get = useExpeditionStore.getState;
  set((s) => ({
    analyzingObservationIds: Array.from(new Set([...s.analyzingObservationIds, observation.id])),
  }));

  try {
    // Image bytes only ever move toward the on-device adapter; when the order
    // has no local step, don't even build the data URL.
    const mayUseLocal = selectAnalysisOrder(preferences).includes("local");
    const imageDataUrl = mayUseLocal && photoBlob ? await blobToDataUrl(photoBlob) : null;

    const board = get().missions;
    const outcome = await analyzeObservation({
      observation: { id: observation.id, category: observation.category, note: observation.note },
      expedition: { id: expedition.id, mode: expedition.mode, environment: expedition.environment },
      preferences: {
        aiRuntimePreference: preferences.aiRuntimePreference,
        privacyMode: preferences.privacyMode,
      },
      imageDataUrl,
      boardTitles: board.map((m) => m.title),
      boardCount: board.length,
      nextOrderIndex: board.reduce((max, m) => Math.max(max, m.orderIndex), -1) + 1,
    });

    // Nothing was configured or reachable: stay silent rather than storing a
    // "no runtime" note the user never asked for.
    if (outcome.unavailability?.noRuntime) return;

    // --- persist the analysis on the observation ----------------------------
    const current = get().observations.find((o) => o.id === observation.id) ?? observation;
    const mergedTags = Array.from(
      new Set([
        ...current.tags,
        ...(outcome.analysis.commonName ? [outcome.analysis.commonName.toLowerCase()] : []),
        ...(outcome.analysis.category !== "unknown" ? [outcome.analysis.category] : []),
      ])
    )
      .map((t) => t.trim().toLowerCase().slice(0, 60))
      .filter((t) => t.length > 0)
      .slice(0, 30);

    const updatedAt = nowIso();
    const syncStatus = await queueForSync({
      entityType: "observation",
      entityId: current.id,
      operation: "UPDATE",
      origin: current.origin,
      payload: syncPayload({
        ...current,
        analysis: outcome.analysis,
        tags: mergedTags,
        updatedAt,
      }),
    });
    const updated = ObservationSchema.parse({
      ...current,
      analysis: outcome.analysis,
      tags: mergedTags,
      syncStatus,
      updatedAt,
    });
    if (storageAvailable()) {
      try {
        await observationRepository.save(updated);
      } catch {
        // degraded mode keeps the in-memory copy
      }
    }
    set((s) => ({
      observations: s.observations.map((o) => (o.id === updated.id ? updated : o)),
    }));

    // --- add the AI-suggested mission (same gates as any mission) -----------
    const candidate = outcome.suggestedMission;
    if (!candidate) return;
    const state = get();
    const expeditionStillRunning =
      state.active?.id === expedition.id && state.active?.status === "ACTIVE";
    if (!expeditionStillRunning) return;
    const liveBoard = state.missions;
    const duplicate = liveBoard.some(
      (m) => m.title.trim().toLowerCase() === candidate.title.trim().toLowerCase()
    );
    if (duplicate || liveBoard.length >= MAX_MISSIONS) return;
    const saved = await persistMissions([candidate]);
    if (saved.length > 0) {
      set((s) => ({ missions: [...s.missions, saved[0]!] }));
    }
  } catch {
    // AI understanding is an enhancement — a failure never breaks the loop.
  } finally {
    set((s) => ({
      analyzingObservationIds: s.analyzingObservationIds.filter((id) => id !== observation.id),
    }));
  }
}

/** Convenience selectors */
export function useActiveExpedition(): Expedition | null {
  return useExpeditionStore((s) => s.active);
}

export function useMissionProgress(): ReturnType<typeof missionProgress> {
  return useExpeditionStore((s) => missionProgress(s.missions));
}

/** True while the AI is understanding this observation ("Understanding…" chip). */
export function useObservationAnalyzing(observationId: string): boolean {
  return useExpeditionStore((s) => s.analyzingObservationIds.includes(observationId));
}

/** Flush helper used by pages that unmount mid-expedition (no-op when idle). */
export function flushExpeditionStats(): void {
  flushTracker();
}
