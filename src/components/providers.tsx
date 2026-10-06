"use client";

import * as React from "react";
import { ThemeProvider } from "next-themes";
import { ToastProvider } from "@/components/ui/toast";
import { ServiceWorkerManager } from "@/components/pwa/service-worker-manager";
import { ExpeditionTracker } from "@/components/expedition-tracker";
import { useAppStore } from "@/lib/state/app-store";
import { useNetworkStore, checkServerHealth } from "@/lib/state/network-store";
import { startSyncEngine } from "@/lib/sync/engine";

/**
 * Applies user accessibility preferences to <html> and keeps the network store
 * wired to real browser events. Also probes the backend once on load (honest
 * reachability, not just navigator.onLine).
 */
function AppEffects() {
  const init = useAppStore((s) => s.init);
  const hydrated = useAppStore((s) => s.hydrated);
  const preferences = useAppStore((s) => s.preferences);
  const setOnline = useNetworkStore((s) => s.setOnline);

  React.useEffect(() => {
    void init();
  }, [init]);

  // Browser connectivity events.
  React.useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [setOnline]);

  // One honest server reachability probe.
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      void checkServerHealth();
    }, 1200);
    return () => window.clearTimeout(t);
  }, []);

  // Sync engine: drains the on-device queue against the deployment's backend,
  // honestly standing down when there is no backend to reach.
  React.useEffect(() => {
    return startSyncEngine();
  }, []);

  // Accessibility + sunlight preferences live as classes on <html>.
  React.useEffect(() => {
    if (!hydrated || !preferences) return;
    const root = document.documentElement;
    const { accessibility } = preferences;
    root.classList.toggle("large-text", accessibility.largeText);
    root.classList.toggle("high-contrast", accessibility.highContrast);
    root.classList.toggle("reduce-motion", accessibility.reducedMotion);
    return () => {
      root.classList.remove("large-text", "high-contrast", "reduce-motion");
    };
  }, [hydrated, preferences]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ToastProvider>
        <AppEffects />
        <ExpeditionTracker />
        <ServiceWorkerManager />
        {children}
      </ToastProvider>
    </ThemeProvider>
  );
}
