"use client";

import { CloudOff, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useNetworkStore } from "@/lib/state/network-store";
import { cn } from "@/lib/utils";

/**
 * Honest connectivity chip. Offline is never an error state in TerraLens —
 * it's the normal state outdoors, so it is displayed calmly.
 */
export function NetworkBadge({ className }: { className?: string }) {
  const online = useNetworkStore((s) => s.online);
  const serverReachable = useNetworkStore((s) => s.serverReachable);
  const pendingOps = useNetworkStore((s) => s.pendingOps);
  const syncing = useNetworkStore((s) => s.syncing);

  if (syncing) {
    return (
      <Badge variant="sky" className={cn("gap-1.5", className)}>
        <RefreshCw className="size-3 animate-spin" />
        Syncing
        {pendingOps > 0 ? ` ${pendingOps}` : ""}
      </Badge>
    );
  }

  if (!online) {
    return (
      <Badge variant="warning" className={cn("gap-1.5", className)}>
        <WifiOff className="size-3" />
        Offline
        {pendingOps > 0 ? ` · ${pendingOps} queued` : ""}
      </Badge>
    );
  }

  if (serverReachable === false) {
    return (
      <Badge variant="muted" className={cn("gap-1.5", className)}>
        <CloudOff className="size-3" />
        Local mode
      </Badge>
    );
  }

  return (
    <Badge variant="success" className={cn("gap-1.5", className)}>
      {serverReachable === null ? <Wifi className="size-3" /> : <Wifi className="size-3" />}
      Online
      {pendingOps > 0 ? ` · ${pendingOps} queued` : ""}
    </Badge>
  );
}
