"use client";

/**
 * App session store: local user identity + preferences (spec §5, §43).
 *
 * Identity is local-first: a guest user is created on-device with a stable
 * UUID. Signing in later (optional) links the same local data — nothing here
 * requires an account to work offline.
 */
import { create } from "zustand";
import {
  UserPreferencesSchema,
  UserSchema,
  type Interest,
  type User,
  type UserPreferences,
} from "@/lib/domain/types";
import { preferencesRepository, clearAllLocalData } from "@/lib/db/repositories";
import { uuid, nowIso } from "@/lib/utils";

const USER_KEY = "terralens.user";
const GUEST_NAME = "Explorer";

interface PersistedUser {
  id: string;
  displayName: string | null;
  createdAt: string;
}

function loadUser(): PersistedUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedUser;
    if (!parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveUser(user: PersistedUser): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function defaultPreferences(userId: string): UserPreferences {
  const now = nowIso();
  return UserPreferencesSchema.parse({
    id: userId,
    userId,
    interests: [],
    privacyMode: "HYBRID",
    aiRuntimePreference: "AUTO",
    locationMode: "NONE",
    defaultEnvironment: "unknown",
    voice: {},
    accessibility: {},
    onboardingComplete: false,
    createdAt: now,
    updatedAt: now,
  });
}

interface AppState {
  hydrated: boolean;
  user: User | null;
  preferences: UserPreferences | null;
  /** True when IndexedDB could not be opened (private mode, quota) — the app
   *  still works in a degraded in-memory mode and says so instead of lying. */
  storageAvailable: boolean;
  storageError: string | null;
  init: () => Promise<void>;
  updatePreferences: (patch: Partial<UserPreferences>) => Promise<void>;
  setInterests: (interests: Interest[]) => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
  completeOnboarding: (opts: { interests: Interest[]; displayName?: string }) => Promise<void>;
  resetAllData: () => Promise<void>;
}

export const useAppStore = create<AppState>()((set, get) => ({
  hydrated: false,
  user: null,
  preferences: null,
  storageAvailable: true,
  storageError: null,

  init: async () => {
    if (get().hydrated) return;
    try {
      const persisted = loadUser();
      const isNew = !persisted;
      const record: PersistedUser = persisted ?? {
        id: uuid(),
        displayName: null,
        createdAt: nowIso(),
      };
      if (isNew) saveUser(record);

      const user = UserSchema.parse({
        id: record.id,
        kind: "guest",
        email: null,
        displayName: record.displayName,
        createdAt: record.createdAt,
        updatedAt: nowIso(),
      });

      let preferences: UserPreferences | null = null;
      try {
        preferences = await preferencesRepository.get(record.id);
      } catch (error) {
        set({
          storageAvailable: false,
          storageError: error instanceof Error ? error.message : "local storage unavailable",
        });
      }
      preferences ??= defaultPreferences(record.id);
      if (get().storageAvailable) {
        await preferencesRepository.save(preferences);
      }

      set({ hydrated: true, user, preferences });
    } catch (error) {
      // Even if everything fails, the app must render — with a truthful error.
      const id = uuid();
      set({
        hydrated: true,
        user: UserSchema.parse({
          id,
          kind: "guest",
          email: null,
          displayName: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        }),
        preferences: defaultPreferences(id),
        storageAvailable: false,
        storageError: error instanceof Error ? error.message : "unknown storage error",
      });
    }
  },

  updatePreferences: async (patch) => {
    const { preferences } = get();
    if (!preferences) return;
    const next = UserPreferencesSchema.parse({
      ...preferences,
      ...patch,
      updatedAt: nowIso(),
    });
    set({ preferences: next });
    if (get().storageAvailable) {
      await preferencesRepository.save(next);
    }
  },

  setInterests: async (interests) => {
    await get().updatePreferences({ interests });
  },

  updateDisplayName: async (name) => {
    const { user } = get();
    if (!user) return;
    const trimmed = name.trim().slice(0, 80);
    const updated: PersistedUser = {
      id: user.id,
      displayName: trimmed.length > 0 ? trimmed : null,
      createdAt: user.createdAt,
    };
    saveUser(updated);
    set({ user: { ...user, displayName: updated.displayName, updatedAt: nowIso() } });
  },

  completeOnboarding: async ({ interests, displayName }) => {
    const { user } = get();
    if (!user) return;
    if (displayName && displayName.trim().length > 0) {
      const updated: PersistedUser = {
        id: user.id,
        displayName: displayName.trim().slice(0, 80),
        createdAt: user.createdAt,
      };
      saveUser(updated);
      set({ user: { ...user, displayName: updated.displayName, updatedAt: nowIso() } });
    }
    await get().updatePreferences({ interests, onboardingComplete: true });
  },

  resetAllData: async () => {
    try {
      await clearAllLocalData();
    } catch {
      // best effort — clearing memory state below still resets the session
    }
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(USER_KEY);
    }
    set({ hydrated: false, user: null, preferences: null });
    await get().init();
  },
}));

/** Convenience selector for components that need a guaranteed preference set. */
export function usePreferences(): UserPreferences | null {
  return useAppStore((s) => s.preferences);
}

export { GUEST_NAME };
