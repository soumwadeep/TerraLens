"use client";

/**
 * Offline lab (spec §15, §28, §53).
 *
 * Everything on this board is observed live from the browser: service worker
 * state, cache contents, IndexedDB row counts, the pending sync queue. The
 * network row is the browser's own signal — the app never fakes it (§28).
 * In development the SW is deliberately not registered (HMR conflict), and
 * this board says so instead of pretending.
 */
import * as React from "react";
import {
  Activity,
  Boxes,
  CloudOff,
  Cpu,
  Database,
  Globe,
  HardDrive,
  LoaderCircle,
  PlugZap,
  RefreshCw,
  Server,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalGemmaAdapter } from "@/lib/ai/local-gemma";
import { getPublicConfig } from "@/lib/config";
import { localStorageStats, syncEventRepository, syncQueueRepository } from "@/lib/db/repositories";
import type { AdapterProbe } from "@/lib/ai/adapter";
import type { SyncEvent, SyncOperation } from "@/lib/domain/types";
import { useNetworkStore, checkServerHealth } from "@/lib/state/network-store";
import { cn } from "@/lib/utils";

interface SwVersion {
  version: string;
  caches: string[];
}

interface CacheEntry {
  name: string;
  entries: number;
}

type StoreStats = Awaited<ReturnType<typeof localStorageStats>>;

interface Snapshot {
  swSupported: boolean;
  swControlled: boolean;
  swVersion: SwVersion | null;
  caches: CacheEntry[];
  storeStats: StoreStats | null;
  queue: SyncOperation[];
  syncEvents: SyncEvent[];
  storage: { usage: number | null; quota: number | null; persisted: boolean | null } | null;
  error: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString([], { hour12: false });
}

async function readServiceWorkerVersion(): Promise<SwVersion | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const controller = navigator.serviceWorker.controller;
  if (!controller) return null;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 1500);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      const data = event.data as { version?: unknown; caches?: unknown };
      if (typeof data?.version === "string") {
        resolve({
          version: data.version,
          caches: Array.isArray(data.caches)
            ? data.caches.filter((c): c is string => typeof c === "string")
            : [],
        });
      } else {
        resolve(null);
      }
    };
    controller.postMessage({ type: "GET_VERSION" }, [channel.port2]);
  });
}

async function readCaches(): Promise<CacheEntry[]> {
  if (typeof caches === "undefined") return [];
  try {
    const names = await caches.keys();
    const entries: CacheEntry[] = [];
    for (const name of names) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      entries.push({ name, entries: keys.length });
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

async function readStorage(): Promise<Snapshot["storage"]> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  try {
    const estimate = await navigator.storage.estimate();
    let persisted: boolean | null = null;
    if (navigator.storage.persisted) {
      persisted = await navigator.storage.persisted();
    }
    return {
      usage: typeof estimate.usage === "number" ? estimate.usage : null,
      quota: typeof estimate.quota === "number" ? estimate.quota : null,
      persisted,
    };
  } catch {
    return null;
  }
}

const SYNC_EVENT_VARIANT: Record<
  SyncEvent["kind"],
  "success" | "destructive" | "warning" | "sky" | "muted"
> = {
  "sync-start": "sky",
  "sync-complete": "success",
  "sync-failed": "destructive",
  conflict: "warning",
  reconnect: "muted",
};

function Row({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-1.5 last:border-b-0">
      <dt className="text-xs uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className={cn("text-right text-sm", mono && "font-mono")}>{value}</dd>
    </div>
  );
}

export function OfflineBoard() {
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  const [online, setOnline] = React.useState<boolean | null>(null);
  const [checking, setChecking] = React.useState(false);

  const serverReachable = useNetworkStore((s) => s.serverReachable);
  const lastCheckedAt = useNetworkStore((s) => s.lastCheckedAt);
  const syncBackend = useNetworkStore((s) => s.syncBackend);
  const lastSyncAt = useNetworkStore((s) => s.lastSyncAt);
  const lastSyncError = useNetworkStore((s) => s.lastSyncError);

  const [modelProbe, setModelProbe] = React.useState<AdapterProbe | null>(null);
  const [probing, setProbing] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [swVersion, caches, storeStats, queue, syncEvents, storage] = await Promise.all([
        readServiceWorkerVersion(),
        readCaches(),
        localStorageStats(),
        syncQueueRepository.all(),
        syncEventRepository.recent(5),
        readStorage(),
      ]);
      setSnapshot({
        swSupported: typeof navigator !== "undefined" && "serviceWorker" in navigator,
        swControlled:
          typeof navigator !== "undefined" && Boolean(navigator.serviceWorker?.controller),
        swVersion,
        caches,
        storeStats,
        queue,
        syncEvents,
        storage,
        error: null,
      });
    } catch (error) {
      setSnapshot({
        swSupported: false,
        swControlled: false,
        swVersion: null,
        caches: [],
        storeStats: null,
        queue: [],
        syncEvents: [],
        storage: null,
        error: error instanceof Error ? error.message : "Something went wrong reading local state.",
      });
    }
  }, []);

  React.useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    void load();
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [load]);

  const onCheckServer = async () => {
    setChecking(true);
    await checkServerHealth();
    setChecking(false);
  };

  const onProbeModel = async () => {
    setProbing(true);
    setModelProbe(await new LocalGemmaAdapter().probe());
    setProbing(false);
  };

  const queueCounts = React.useMemo(() => {
    const counts: Record<SyncOperation["status"], number> = {
      QUEUED: 0,
      SYNCING: 0,
      SYNCED: 0,
      FAILED: 0,
      CONFLICT: 0,
    };
    for (const op of snapshot?.queue ?? []) counts[op.status] += 1;
    return counts;
  }, [snapshot]);

  const queueHead = React.useMemo(
    () => (snapshot?.queue ?? []).filter((op) => op.status !== "SYNCED").slice(0, 5),
    [snapshot]
  );

  const pack = getPublicConfig().localModelPack;

  const isLoading = snapshot === null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-pretty text-sm text-muted-foreground">
          What this device is holding right now: caches, on-device rows, the sync queue, and whether
          the browser itself reports a connection. Nothing here is simulated — and in development
          the service worker is intentionally off, which this page will tell you.
        </p>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={isLoading}>
          {isLoading ? (
            <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          )}
          Refresh
        </Button>
      </div>

      {snapshot?.error ? (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-sm">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <p>
            Local state could not be read: {snapshot.error}. The board shows nothing rather than
            guessing.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Network — the browser's own signal, never faked (§28) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              {online === false ? (
                <WifiOff className="h-4 w-4" aria-hidden />
              ) : (
                <Wifi className="h-4 w-4" aria-hidden />
              )}
              Network
            </CardTitle>
            <CardDescription>
              The browser&apos;s network signal — reported, not simulated.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant={online === null ? "muted" : online ? "success" : "warning"}
                className="gap-1 text-[10px]"
              >
                {online === null ? "CHECKING" : online ? "BROWSER ONLINE" : "BROWSER OFFLINE"}
              </Badge>
              <Badge
                variant={
                  serverReachable === null ? "muted" : serverReachable ? "success" : "warning"
                }
                className="gap-1 text-[10px]"
              >
                {serverReachable === null
                  ? "SERVER NOT CHECKED"
                  : serverReachable
                    ? "SERVER REACHABLE"
                    : "SERVER UNREACHABLE"}
              </Badge>
            </div>
            <dl>
              <Row
                label="Last server check"
                value={lastCheckedAt ? formatTime(lastCheckedAt) : "never"}
              />
              <Row
                label="Sync backend"
                value={
                  syncBackend === "configured"
                    ? "configured (it answered)"
                    : syncBackend === "not-configured"
                      ? "not configured — ops stay on-device"
                      : "unknown — not checked yet"
                }
              />
              <Row label="Last sync" value={lastSyncAt ? formatTime(lastSyncAt) : "—"} />
            </dl>
            {lastSyncError ? (
              <p className="rounded-lg bg-destructive/10 p-2 font-mono text-xs text-destructive">
                {lastSyncError}
              </p>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onCheckServer()}
              disabled={checking}
            >
              {checking ? (
                <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Server className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              )}
              Check server health
            </Button>
            <p className="text-pretty text-xs text-muted-foreground">
              To genuinely test offline mode, flip the network off (DevTools → Network → Offline, or
              airplane mode) and watch these chips change. WiFi on is not the same as backend
              reachable — that is why there are two chips.
            </p>
          </CardContent>
        </Card>

        {/* Service worker */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CloudOff className="h-4 w-4" aria-hidden />
              Service worker
            </CardTitle>
            <CardDescription>
              The offline shell: app pages and assets, never API responses.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <div className="h-20 animate-pulse rounded-lg bg-muted" />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant={snapshot.swSupported ? "success" : "warning"}
                    className="text-[10px]"
                  >
                    {snapshot.swSupported ? "API SUPPORTED" : "NOT SUPPORTED IN THIS BROWSER"}
                  </Badge>
                  <Badge
                    variant={snapshot.swControlled ? "success" : "outline"}
                    className="text-[10px]"
                  >
                    {snapshot.swControlled ? "CONTROLLING THIS PAGE" : "NOT CONTROLLING THIS PAGE"}
                  </Badge>
                </div>
                <dl>
                  <Row
                    label="Shell version"
                    value={snapshot.swVersion ? snapshot.swVersion.version : "—"}
                  />
                  <Row
                    label="SW caches declared"
                    value={snapshot.swVersion ? snapshot.swVersion.caches.join(", ") : "—"}
                    mono={false}
                  />
                </dl>
                {!snapshot.swControlled ? (
                  <p className="text-pretty text-xs text-muted-foreground">
                    In development the service worker is deliberately left unregistered — HMR and a
                    caching worker fight each other. Run a production build ({" "}
                    <span className="font-mono">pnpm build &amp;&amp; pnpm start</span>) to inspect
                    the offline shell.
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        {/* Caches */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="h-4 w-4" aria-hidden />
              Caches on this device
            </CardTitle>
            <CardDescription>
              <span className="font-mono">caches.keys()</span> — real Cache Storage entries.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-16 animate-pulse rounded-lg bg-muted" />
            ) : snapshot.caches.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No caches exist in this browser session — expected in dev, since the worker is off.
              </p>
            ) : (
              <dl>
                {snapshot.caches.map((cache) => (
                  <Row key={cache.name} label={cache.name} value={`${cache.entries} entries`} />
                ))}
              </dl>
            )}
          </CardContent>
        </Card>

        {/* On-device stores */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4" aria-hidden />
              On-device journal (IndexedDB)
            </CardTitle>
            <CardDescription>
              Your data lives here first. The server is a copy, never the source.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading || !snapshot.storeStats ? (
              <div className="h-24 animate-pulse rounded-lg bg-muted" />
            ) : (
              <dl>
                <Row label="Expeditions" value={snapshot.storeStats.expeditions} />
                <Row label="Missions" value={snapshot.storeStats.missions} />
                <Row label="Observations" value={snapshot.storeStats.observations} />
                <Row label="Media items" value={snapshot.storeStats.media} />
                <Row label="Knowledge cards" value={snapshot.storeStats.knowledge} />
                <Row label="Queued sync ops" value={snapshot.storeStats.queued} />
              </dl>
            )}
            {snapshot?.storage ? (
              <div className="mt-3 border-t border-border/60 pt-2">
                <dl>
                  <Row
                    label="Storage used"
                    value={
                      snapshot.storage.usage !== null ? formatBytes(snapshot.storage.usage) : "—"
                    }
                  />
                  <Row
                    label="Quota"
                    value={
                      snapshot.storage.quota !== null ? formatBytes(snapshot.storage.quota) : "—"
                    }
                  />
                  <Row
                    label="Persistence granted"
                    value={
                      snapshot.storage.persisted === null
                        ? "not reported"
                        : snapshot.storage.persisted
                          ? "yes"
                          : "no (best-effort eviction applies)"
                    }
                  />
                </dl>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Sync queue */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" aria-hidden />
              Sync queue
            </CardTitle>
            <CardDescription>
              Operations wait here until the backend actually answers. Nothing is ever marked synced
              without a server.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="h-20 animate-pulse rounded-lg bg-muted" />
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["QUEUED", queueCounts.QUEUED, "muted"],
                      ["SYNCING", queueCounts.SYNCING, "sky"],
                      ["SYNCED", queueCounts.SYNCED, "success"],
                      ["FAILED", queueCounts.FAILED, "destructive"],
                      ["CONFLICT", queueCounts.CONFLICT, "warning"],
                    ] as const
                  ).map(([label, count, variant]) => (
                    <Badge key={label} variant={variant} className="text-[10px]">
                      {label} {count}
                    </Badge>
                  ))}
                </div>
                {queueHead.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing is waiting — every operation has been acknowledged or the queue is
                    empty.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {queueHead.map((op) => (
                      <li
                        key={op.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs"
                      >
                        <span className="font-mono">
                          {op.entityType} · {op.operation}
                        </span>
                        <span className="text-muted-foreground">
                          {op.status} · {op.attempts} {op.attempts === 1 ? "try" : "tries"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Sync history */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4" aria-hidden />
              Sync history
            </CardTitle>
            <CardDescription>The last five sync events recorded on this device.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-20 animate-pulse rounded-lg bg-muted" />
            ) : snapshot.syncEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No sync events on this device yet — events appear here only after a real sync
                attempt.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {snapshot.syncEvents.map((event) => (
                  <li key={event.id} className="flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <Badge variant={SYNC_EVENT_VARIANT[event.kind]} className="text-[10px]">
                        {event.kind}
                      </Badge>
                      <p className="mt-1 text-pretty text-muted-foreground">{event.detail}</p>
                    </div>
                    <span className="shrink-0 font-mono text-muted-foreground">
                      {formatTime(event.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Local model */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="h-4 w-4" aria-hidden />
              On-device AI runtime
            </CardTitle>
            <CardDescription>
              Probed from the actual runtime via the same health check the Settings page uses.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <dl>
              <Row
                label="Configured runtime"
                value={getPublicConfig().localAI.url ? "yes" : "no — server or rules-only"}
              />
              <Row label="Model" value={getPublicConfig().localAI.model} />
            </dl>
            {pack.url || pack.bytes || pack.version ? (
              <dl className="border-t border-border/60 pt-2">
                <Row label="Model pack version" value={pack.version ?? "—"} />
                <Row
                  label="Model pack size"
                  value={pack.bytes !== null ? formatBytes(pack.bytes) : "—"}
                />
                <Row
                  label="Model pack origin"
                  value={
                    pack.url
                      ? (() => {
                          try {
                            const u = new URL(pack.url);
                            return `${u.protocol}//${u.host}`;
                          } catch {
                            return "configured";
                          }
                        })()
                      : "—"
                  }
                />
              </dl>
            ) : null}
            {modelProbe ? (
              <div className="rounded-lg border border-border/60 p-2.5">
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant={modelProbe.state === "ready" ? "success" : "warning"}
                    className="text-[10px]"
                  >
                    {modelProbe.state.replace("-", " ").toUpperCase()}
                  </Badge>
                  {modelProbe.latencyMs !== null ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      {modelProbe.latencyMs} ms
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-pretty text-xs text-muted-foreground">
                  {modelProbe.detail}
                </p>
              </div>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onProbeModel()}
              disabled={probing}
            >
              {probing ? (
                <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <PlugZap className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              )}
              Probe runtime
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Capability matrix */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="h-4 w-4" aria-hidden />
            What works without a network
          </CardTitle>
          <CardDescription>
            An honest division — no feature pretends to be offline-first when it is not.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
              Works with zero connectivity
            </p>
            <ul className="space-y-1.5 text-pretty text-sm">
              {[
                "Capturing photos, audio, and text observations",
                "Journal, expeditions, and mission progress",
                "Grass Score — computed on-device, deterministically",
                "Touch Grass Mode and curiosity prompts (rules-only fallback)",
                "Knowledge cards already on the device",
                "Everything queues for sync; nothing is lost",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="mt-0.5 text-success">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
              Requires connectivity
            </p>
            <ul className="space-y-1.5 text-pretty text-sm">
              {[
                "Server Gemma analysis (on-device runtime still works)",
                "Mastra field agent and its recaps",
                "Tiger Data knowledge lookup beyond the bundled seed",
                "SerpApi live context for plants and animals",
                "Syncing the journal to the deployment's store",
                "Cloud voice (ElevenLabs) for spoken guidance",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="mt-0.5 text-warning">
                    →
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
