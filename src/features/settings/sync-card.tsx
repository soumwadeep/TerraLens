"use client";

/**
 * Offline & sync settings (spec §5, §27, §40).
 *
 * The card's whole job is to tell the truth about sync in this deployment:
 *  - "Synced" is never displayed unless a real backend acknowledged changes.
 *  - When there is no sync backend, that is stated plainly — queued changes
 *    stay safe on-device and the expedition loop is unaffected.
 */
import * as React from "react";
import {
  CircleCheck,
  CircleHelp,
  CloudOff,
  LoaderCircle,
  RefreshCw,
  UploadCloud,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { kickSync, probeSyncBackend } from "@/lib/sync/engine";
import { useAppStore } from "@/lib/state/app-store";
import { useNetworkStore } from "@/lib/state/network-store";

function relativeTime(iso: string, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function SyncCard() {
  const online = useNetworkStore((s) => s.online);
  const pendingOps = useNetworkStore((s) => s.pendingOps);
  const syncing = useNetworkStore((s) => s.syncing);
  const lastSyncAt = useNetworkStore((s) => s.lastSyncAt);
  const lastSyncError = useNetworkStore((s) => s.lastSyncError);
  const syncBackend = useNetworkStore((s) => s.syncBackend);
  const storageAvailable = useAppStore((s) => s.storageAvailable);

  const [checking, setChecking] = React.useState(false);
  // Time rendering happens after mount so server and client HTML always match.
  const [nowMs, setNowMs] = React.useState<number | null>(null);

  React.useEffect(() => {
    setNowMs(Date.now());
    const t = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  async function checkBackend() {
    setChecking(true);
    try {
      await probeSyncBackend();
    } finally {
      setChecking(false);
    }
  }

  const backendBadge =
    syncBackend === "configured" ? (
      <Badge variant="success" className="gap-1">
        <CircleCheck className="h-3 w-3" aria-hidden />
        Backend configured
      </Badge>
    ) : syncBackend === "not-configured" ? (
      <Badge variant="muted" className="gap-1">
        <CloudOff className="h-3 w-3" aria-hidden />
        No sync backend
      </Badge>
    ) : (
      <Badge variant="muted" className="gap-1">
        <CircleHelp className="h-3 w-3" aria-hidden />
        Not checked yet
      </Badge>
    );

  const pendingLine = !storageAvailable
    ? "Local storage is unavailable this session — changes live in memory only."
    : pendingOps > 0
      ? `${pendingOps} change${pendingOps === 1 ? "" : "s"} queued on this device, waiting to sync.`
      : syncBackend === "configured"
        ? "Nothing waiting — every change has been acknowledged by the backend."
        : "Nothing queued. Expeditions this session are stored on-device.";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UploadCloud className="h-4 w-4 text-forest" aria-hidden />
          Offline &amp; sync
        </CardTitle>
        <CardDescription>
          The expedition loop never needs the network. Changes queue here and sync only when a real
          backend exists.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">{backendBadge}</div>
            <p className="mt-1 text-pretty text-xs text-muted-foreground">
              {syncBackend === "configured"
                ? "This deployment has sync storage — queued changes are delivered there."
                : syncBackend === "not-configured"
                  ? "This deployment keeps everything on-device, like Local-only mode. Nothing is lost; there is simply nowhere to send changes yet."
                  : "Run a check to see whether this deployment has a sync backend."}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void checkBackend()}
              disabled={checking || !online}
            >
              {checking ? (
                <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              )}
              Check
            </Button>
            <Button
              size="sm"
              onClick={() => kickSync()}
              disabled={!online || pendingOps === 0 || !storageAvailable}
            >
              {syncing ? (
                <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <UploadCloud className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              )}
              Sync now
            </Button>
          </div>
        </div>

        <div className="rounded-xl border p-3.5">
          <p className="text-sm">{pendingLine}</p>
          <p className="mt-1 text-pretty text-xs text-muted-foreground">
            {lastSyncError
              ? lastSyncError
              : lastSyncAt && nowMs !== null
                ? `Last sync attempt ${relativeTime(lastSyncAt, nowMs)}.`
                : "No sync attempt has been made yet."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
