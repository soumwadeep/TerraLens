"use client";

/**
 * Long-term memory settings (spec §33).
 *
 * Two separate consents, never bundled:
 *  - keep a private on-device journal;
 *  - share it with this deployment's memory server (Backboard), which is
 *    simply disabled under Local-only privacy mode.
 *
 * The server status chip only says Ready after a live check answered.
 */
import * as React from "react";
import { Brain, CircleAlert, CircleCheck, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useAppStore } from "@/lib/state/app-store";
import {
  countMemories,
  eraseMemories,
  mirrorUnsyncedMemories,
  probeMemoryServer,
  type MemoryProbe,
} from "@/lib/memory";

const PROBE_LABEL: Record<string, string> = {
  ready: "Ready",
  "not-configured": "Not configured",
  "no-assistant": "No assistant set",
  unauthorized: "Key rejected",
  unreachable: "Unreachable",
};

function probeBadge(state: string): "success" | "warning" | "muted" {
  if (state === "ready") return "success";
  if (state === "not-configured") return "muted";
  return "warning";
}

export function MemoryCard() {
  const user = useAppStore((s) => s.user);
  const preferences = useAppStore((s) => s.preferences);
  const updatePreferences = useAppStore((s) => s.updatePreferences);
  const { toast } = useToast();
  const [count, setCount] = React.useState<number | null>(null);
  const [probe, setProbe] = React.useState<MemoryProbe>(null);
  const [checking, setChecking] = React.useState(false);
  const [confirmErase, setConfirmErase] = React.useState(false);
  const [erasing, setErasing] = React.useState(false);

  const userId = user?.id ?? null;

  const refreshCount = React.useCallback(async () => {
    if (!userId) return;
    try {
      setCount(await countMemories(userId));
    } catch {
      setCount(null); // storage degraded — no invented number
    }
  }, [userId]);

  React.useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  // While sharing is on, retry pending mirrors whenever these settings open.
  // The façade serialises concurrent runs, so this can't double-push.
  const sharingOn =
    preferences?.memory.shareWithServer === true && preferences.privacyMode !== "LOCAL_ONLY";
  React.useEffect(() => {
    if (!userId || !sharingOn) return;
    void mirrorUnsyncedMemories(userId, useAppStore.getState().preferences);
  }, [userId, sharingOn]);

  if (!preferences || !userId) return null;

  const memory = preferences.memory;
  const localOnly = preferences.privacyMode === "LOCAL_ONLY";
  // Captured locals keep the null-narrowing inside the hoisted handlers.
  const prefs = preferences;
  const uid = userId;

  async function setEnabled(enabled: boolean) {
    await updatePreferences({ memory: { ...memory, enabled } });
    if (!enabled) setProbe(null);
  }

  async function setSharing(share: boolean) {
    const next = { ...prefs, memory: { ...memory, shareWithServer: share } };
    await updatePreferences({ memory: next.memory });
    if (!share) return;
    const outcome = await mirrorUnsyncedMemories(uid, next);
    if (outcome.pushed > 0) {
      toast({
        title: `${outcome.pushed} ${outcome.pushed === 1 ? "memory" : "memories"} shared`,
        description:
          outcome.pending > 0
            ? `${outcome.pending} older ${outcome.pending === 1 ? "memory is" : "memories are"} still waiting for the server.`
            : "The journal was mirrored to the memory server.",
        variant: "success",
      });
    } else if (outcome.pending > 0 && !outcome.serverReached) {
      toast({
        title: "Sharing is on, but the server didn't answer",
        description: `${outcome.pending} ${outcome.pending === 1 ? "memory stays" : "memories stay"} on this device — ${
          outcome.pending === 1 ? "it'll" : "they'll"
        } be tried again when you open these settings.`,
        variant: "warning",
      });
    } else {
      toast({
        title: "Sharing is on",
        description: "Nothing was waiting to sync — new walks will be mirrored.",
        variant: "info",
      });
    }
    void refreshCount();
  }

  async function checkServer() {
    setChecking(true);
    try {
      const result = await probeMemoryServer();
      setProbe(result);
      if (result === null) {
        toast({
          title: "The memory route did not answer",
          description: "That is a fact about this deployment, not a failure of your data.",
          variant: "warning",
        });
      }
    } finally {
      setChecking(false);
    }
  }

  async function doErase() {
    setErasing(true);
    try {
      const erased = await eraseMemories(uid);
      await refreshCount();
      setConfirmErase(false);
      toast({
        title: erased === 1 ? "1 memory erased" : `${erased} memories erased`,
        description: "The on-device journal is empty.",
        variant: "success",
      });
    } finally {
      setErasing(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="h-4 w-4 text-forest" aria-hidden />
          Long-term memory
        </CardTitle>
        <CardDescription>
          A short journal line for each completed walk, so TerraLens remembers where you&apos;ve
          been — on this device first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-xl border p-3.5">
          <div>
            <p className="text-sm font-medium">Remember my walks</p>
            <p className="text-pretty text-xs text-muted-foreground">
              Title, duration, observation count and score. No photos, no notes, no coordinates.
            </p>
          </div>
          <Switch
            checked={memory.enabled}
            onCheckedChange={(on) => void setEnabled(on)}
            aria-label="Remember my walks"
          />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border p-3.5">
          <div>
            <p className="text-sm font-medium">Share with the memory server</p>
            <p className="text-pretty text-xs text-muted-foreground">
              {localOnly
                ? "Unavailable while privacy mode is Local only — memories never leave this device."
                : "Off by default. When on, memories are mirrored to this deployment's Backboard assistant so answers can recall them."}
            </p>
          </div>
          <Switch
            checked={memory.shareWithServer && !localOnly}
            disabled={localOnly || !memory.enabled}
            onCheckedChange={(on) => void setSharing(on)}
            aria-label="Share with the memory server"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium">On this device</p>
            <p className="text-xs text-muted-foreground">
              {count === null
                ? "Count unavailable — local storage is degraded."
                : count === 1
                  ? "1 memory in the journal."
                  : `${count ?? 0} memories in the journal.`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmErase(true)}
            disabled={count === null || count === 0}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Erase journal
          </Button>
        </div>

        <div className="space-y-2 rounded-xl border p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Memory server</p>
              <p className="text-pretty text-xs text-muted-foreground">
                Backboard assistant for this deployment. A test runs a live check — configuration
                alone is never shown as working.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void checkServer()}
              disabled={checking}
            >
              {checking ? (
                <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              )}
              Check server
            </Button>
          </div>
          {probe ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={probeBadge(probe.state)} className="gap-1 text-[10px]">
                {probe.state === "ready" ? (
                  <CircleCheck className="h-3 w-3" aria-hidden />
                ) : (
                  <CircleAlert className="h-3 w-3" aria-hidden />
                )}
                {PROBE_LABEL[probe.state] ?? probe.state}
              </Badge>
              {typeof probe.latencyMs === "number" ? (
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {probe.latencyMs} ms
                </span>
              ) : null}
              {typeof probe.totalCount === "number" ? (
                <span className="text-[10px] text-muted-foreground">
                  {probe.totalCount} stored server-side
                </span>
              ) : null}
              <p className="w-full text-pretty text-xs text-muted-foreground">{probe.detail}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Not checked yet — run a test to see the honest state.
            </p>
          )}
        </div>
      </CardContent>

      <Dialog
        open={confirmErase}
        onOpenChange={setConfirmErase}
        title="Erase the memory journal?"
        description="Every memory stored on this device will be deleted. This cannot be undone."
        footer={
          <>
            <Button variant="destructive" onClick={() => void doErase()} disabled={erasing}>
              {erasing ? "Erasing…" : "Yes, erase the journal"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmErase(false)}>
              Keep my memories
            </Button>
          </>
        }
      >
        <p className="text-pretty text-sm text-muted-foreground">
          Memories already mirrored to the memory server are not removed by this — erase those from
          the server deployment if needed.
        </p>
      </Dialog>
    </Card>
  );
}
