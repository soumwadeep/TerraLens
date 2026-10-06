"use client";

/**
 * Mounts the global expedition tracker: once app state is hydrated, it looks
 * for a resumable ACTIVE expedition and starts (or continues) attributing
 * time. Rendered from Providers so background tabs keep honest stats.
 */
import * as React from "react";
import { useAppStore } from "@/lib/state/app-store";
import { useExpeditionStore } from "@/lib/state/expedition-store";

export function ExpeditionTracker() {
  const hydrated = useAppStore((s) => s.hydrated);
  const initActive = useExpeditionStore((s) => s.initActive);

  React.useEffect(() => {
    if (hydrated) void initActive();
  }, [hydrated, initActive]);

  return null;
}
