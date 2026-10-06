"use client";

/**
 * Settings — profile, privacy, AI runtime, accessibility and data control.
 * Everything here writes to on-device storage; nothing leaves the device
 * unless the user explicitly chooses a cloud mode.
 */
import * as React from "react";
import Link from "next/link";
import {
  Accessibility,
  CloudOff,
  Database,
  Download,
  Leaf,
  Lock,
  ShieldCheck,
  Trash2,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/layout/app-shell";
import { AIRuntimeCard } from "@/features/settings/ai-runtime-card";
import { MemoryCard } from "@/features/settings/memory-card";
import { SyncCard } from "@/features/settings/sync-card";
import { useAppStore } from "@/lib/state/app-store";
import { localStorageStats } from "@/lib/db/repositories";
import { getDB, ALL_STORES } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import type { Interest, PrivacyMode } from "@/lib/domain/types";

const INTEREST_OPTIONS: Array<{ value: Interest; label: string }> = [
  { value: "plants", label: "Plants" },
  { value: "birds", label: "Birds" },
  { value: "photography", label: "Photography" },
  { value: "walking", label: "Walking" },
  { value: "science", label: "Science" },
  { value: "sounds", label: "Sounds" },
  { value: "mindfulness", label: "Mindfulness" },
  { value: "everything", label: "Everything" },
];

const PRIVACY_OPTIONS: Array<{ value: PrivacyMode; label: string; hint: string }> = [
  { value: "LOCAL_ONLY", label: "Local only", hint: "Nothing ever leaves this device." },
  {
    value: "HYBRID",
    label: "Hybrid",
    hint: "On-device first; server fallback for analysis when needed.",
  },
  { value: "CLOUD_ENHANCED", label: "Cloud enhanced", hint: "Richer AI when online." },
];

export default function SettingsPage() {
  const { toast } = useToast();
  const hydrated = useAppStore((s) => s.hydrated);
  const user = useAppStore((s) => s.user);
  const preferences = useAppStore((s) => s.preferences);
  const updatePreferences = useAppStore((s) => s.updatePreferences);
  const updateDisplayName = useAppStore((s) => s.updateDisplayName);
  const resetAllData = useAppStore((s) => s.resetAllData);
  const storageAvailable = useAppStore((s) => s.storageAvailable);
  const storageError = useAppStore((s) => s.storageError);

  const [name, setName] = React.useState("");
  const [stats, setStats] = React.useState<Awaited<ReturnType<typeof localStorageStats>> | null>(
    null
  );
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);

  React.useEffect(() => {
    if (user) setName(user.displayName ?? "");
  }, [user]);

  const refreshStats = React.useCallback(async () => {
    if (!storageAvailable) return;
    try {
      setStats(await localStorageStats());
    } catch {
      setStats(null);
    }
  }, [storageAvailable]);

  React.useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  async function exportData() {
    try {
      const db = await getDB();
      const dump: Record<string, unknown> = {
        app: "TerraLens",
        exportedAt: new Date().toISOString(),
        note: "Media blobs are not included in this export. This file never left your device.",
      };
      for (const store of ALL_STORES) {
        if (store === "mediaBlobs") continue;
        // Narrow structural read: idb resolves store names for literals only.
        const rows = await (
          db as unknown as { getAll(storeName: string): Promise<unknown[]> }
        ).getAll(store);
        dump[store] = rows;
      }
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `terralens-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export ready", description: "Saved as a JSON file on your device." });
    } catch {
      toast({
        title: "Export failed",
        description: "Local storage is unavailable in this browser session.",
        variant: "error",
      });
    }
  }

  async function doReset() {
    setResetting(true);
    await resetAllData();
    setResetting(false);
    setConfirmReset(false);
    void refreshStats();
    toast({ title: "All local data cleared", description: "TerraLens is fresh again." });
  }

  if (!hydrated || !preferences) {
    return (
      <div>
        <PageHeader title="Settings" />
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader title="Settings" description="Preferences stay on this device." />

      {!storageAvailable ? (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="p-4 pt-4 text-sm">
            <p className="font-medium">Local storage unavailable</p>
            <p className="mt-1 text-pretty text-muted-foreground">
              {storageError ?? "IndexedDB could not be opened."} Preferences changed here work for
              this session but won&apos;t persist.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* Profile */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>
            Guest mode — no account needed, and none is created behind your back.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="display-name">Display name</Label>
            <div className="flex gap-2">
              <Input
                id="display-name"
                value={name}
                maxLength={80}
                placeholder="Explorer"
                onChange={(e) => setName(e.target.value)}
              />
              <Button
                variant="outline"
                onClick={() => {
                  void updateDisplayName(name);
                  toast({ title: "Name saved" });
                }}
                disabled={name === (user?.displayName ?? "")}
              >
                Save
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-forest" aria-hidden />
            <span>
              User ID{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">{user?.id.slice(0, 8)}…</code> —
              pseudonymous, stored locally.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Interests */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Interests</CardTitle>
          <CardDescription>Missions lean toward what you pick.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map(({ value, label }) => {
              const selected = preferences.interests.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    const next = selected
                      ? preferences.interests.filter((i) => i !== value)
                      : [...preferences.interests, value];
                    void updatePreferences({ interests: next });
                  }}
                  className={cn(
                    "tap-target rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                    selected
                      ? "border-forest bg-forest/10 text-forest"
                      : "bg-card hover:bg-muted/60"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Privacy */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4 text-forest" aria-hidden />
            Privacy
          </CardTitle>
          <CardDescription>
            Local-only is fully supported — the expedition loop never needs the network.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {PRIVACY_OPTIONS.map(({ value, label, hint }) => {
              const selected = preferences.privacyMode === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => void updatePreferences({ privacyMode: value })}
                  className={cn(
                    "tap-target flex w-full items-center justify-between rounded-xl border p-3.5 text-left transition-colors",
                    selected ? "border-forest bg-forest/10" : "bg-card hover:bg-muted/60"
                  )}
                >
                  <span>
                    <span className="block text-sm font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                  {selected ? <Badge variant="success">Active</Badge> : null}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border p-3.5">
            <div>
              <p className="text-sm font-medium">Approximate location</p>
              <p className="text-pretty text-xs text-muted-foreground">
                Off by default. Never used unless a mission benefits from it.
              </p>
            </div>
            <Switch
              checked={preferences.locationMode !== "NONE"}
              onCheckedChange={(on) =>
                void updatePreferences({ locationMode: on ? "APPROXIMATE" : "NONE" })
              }
              aria-label="Approximate location"
            />
          </div>
        </CardContent>
      </Card>

      {/* AI runtime */}
      <AIRuntimeCard />

      {/* Voice */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Volume2 className="h-4 w-4 text-forest" aria-hidden />
            Voice
          </CardTitle>
          <CardDescription>Spoken guidance so your phone can stay in your pocket.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border p-3.5">
            <div>
              <p className="text-sm font-medium">Voice guidance</p>
              <p className="text-xs text-muted-foreground">
                Reads missions and curiosity prompts aloud.
              </p>
            </div>
            <Switch
              checked={preferences.voice.enabled}
              onCheckedChange={(enabled) =>
                void updatePreferences({ voice: { ...preferences.voice, enabled } })
              }
              aria-label="Voice guidance"
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border p-3.5">
            <div>
              <p className="text-sm font-medium">Voice source</p>
              <p className="text-pretty text-xs text-muted-foreground">
                ElevenLabs keys live on the server only — if they aren&apos;t configured, the
                browser voice is used and labeled as such.
              </p>
            </div>
            <div className="flex rounded-lg border p-0.5">
              {(["browser", "elevenlabs"] as const).map((provider) => (
                <button
                  key={provider}
                  type="button"
                  onClick={() =>
                    void updatePreferences({
                      voice: { ...preferences.voice, provider },
                    })
                  }
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    preferences.voice.provider === provider
                      ? "bg-forest text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {provider === "elevenlabs" ? "ElevenLabs" : "Browser"}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Long-term memory */}
      <MemoryCard />

      {/* Accessibility */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Accessibility className="h-4 w-4 text-forest" aria-hidden />
            Accessibility
          </CardTitle>
          <CardDescription>Comfort outdoors matters — sun, gloves, glances.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(
            [
              { key: "largeText", label: "Larger text", hint: "Readable in bright sunlight." },
              {
                key: "largeTouchTargets",
                label: "Larger tap targets",
                hint: "Easier one-handed use.",
              },
              {
                key: "highContrast",
                label: "High contrast",
                hint: "Stronger contrast between elements.",
              },
              { key: "reducedMotion", label: "Reduce motion", hint: "Calmer transitions." },
              { key: "captions", label: "Captions", hint: "Show text with every sound." },
            ] as const
          ).map(({ key, label, hint }) => (
            <div
              key={key}
              className="flex items-center justify-between gap-3 rounded-xl border p-3.5"
            >
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{hint}</p>
              </div>
              <Switch
                checked={preferences.accessibility[key]}
                onCheckedChange={(checked) =>
                  void updatePreferences({
                    accessibility: { ...preferences.accessibility, [key]: checked },
                  })
                }
                aria-label={label}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Data */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-forest" aria-hidden />
            Your data
          </CardTitle>
          <CardDescription>
            Stored locally in your browser. Export or erase it whenever you want.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {stats ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {(
                [
                  ["Expeditions", stats.expeditions],
                  ["Missions", stats.missions],
                  ["Observations", stats.observations],
                  ["Media", stats.media],
                  ["Queued", stats.queued],
                  ["Knowledge", stats.knowledge],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-xl border bg-muted/40 p-2.5 text-center">
                  <p className="font-display text-lg font-semibold tabular-nums">{value}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => void exportData()}
              disabled={!storageAvailable}
            >
              <Download className="mr-2 h-4 w-4" aria-hidden />
              Export JSON
            </Button>
            <Button
              variant="destructive"
              onClick={() => setConfirmReset(true)}
              disabled={!storageAvailable}
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden />
              Erase all local data
            </Button>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CloudOff className="h-3.5 w-3.5" aria-hidden />
            No account, no cloud copy — what you see here is all that exists.
          </p>
        </CardContent>
      </Card>

      {/* Offline & sync */}
      <SyncCard />

      {/* About links */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 pt-4 text-sm">
          <Link className="text-forest underline-offset-4 hover:underline" href="/about">
            About
          </Link>
          <Link className="text-forest underline-offset-4 hover:underline" href="/privacy">
            Privacy
          </Link>
          <Link className="text-forest underline-offset-4 hover:underline" href="/open">
            Open source
          </Link>
          <Link className="text-forest underline-offset-4 hover:underline" href="/lab">
            Model Lab
          </Link>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Leaf className="h-3.5 w-3.5 text-fern" aria-hidden />
            TerraLens v0.1.0
          </span>
        </CardContent>
      </Card>

      <Dialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Erase everything?"
        description="Every expedition, mission, observation and score on this device will be deleted. This cannot be undone."
        footer={
          <>
            <Button variant="destructive" onClick={() => void doReset()} disabled={resetting}>
              {resetting ? "Erasing…" : "Yes, erase it all"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Keep my data
            </Button>
          </>
        }
      >
        <p className="text-pretty text-sm text-muted-foreground">
          Consider exporting a JSON copy first if you want to keep a record.
        </p>
      </Dialog>
    </div>
  );
}
