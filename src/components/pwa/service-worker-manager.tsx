"use client";

import * as React from "react";
import { useToast } from "@/components/ui/toast";

/**
 * Registers the service worker in production builds and surfaces update
 * availability honestly: the new worker waits until the user reopens the app,
 * so a field session is never interrupted by a silent swap.
 *
 * Dev is left unregistered on purpose — HMR and a caching SW fight each other.
 */
export function ServiceWorkerManager() {
  const { toast } = useToast();

  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        if (cancelled) return;

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            const hasController = Boolean(navigator.serviceWorker.controller);
            if (installing.state === "installed" && hasController) {
              toast({
                title: "Update ready",
                description: "Close and reopen TerraLens to apply the latest version.",
                variant: "info",
              });
            }
          });
        });
      } catch (error) {
        console.warn("[pwa] service worker registration failed", error);
      }
    };

    void register();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  return null;
}
