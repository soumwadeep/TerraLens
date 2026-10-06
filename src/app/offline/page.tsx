import type { Metadata } from "next";
import Link from "next/link";
import { CloudOff, Footprints } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false },
};

/**
 * Offline fallback shell (spec §37, §41). Served by the service worker when a
 * navigation fails and no cached copy of the page exists. Deliberately static:
 * no client JS required beyond what the app shell already caches.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-muted">
        <CloudOff className="size-8 text-muted-foreground" aria-hidden />
      </span>
      <h1 className="mt-5 font-display text-2xl font-semibold">You&apos;re offline</h1>
      <p className="mt-2 max-w-sm text-pretty text-muted-foreground">
        This page hasn&apos;t been saved on your device yet. Your expeditions, observations and
        Grass Score are stored locally and are safe — nothing was lost.
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button asChild>
          <Link href="/home">
            <Footprints className="size-4" aria-hidden />
            Open TerraLens
          </Link>
        </Button>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Pages you&apos;ve visited before are available offline automatically.
      </p>
    </main>
  );
}
