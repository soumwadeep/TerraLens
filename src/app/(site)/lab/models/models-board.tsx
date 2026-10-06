"use client";

/**
 * The AI ENGINE board (spec §27) — rendered from GET /api/integrations?live=1.
 *
 * Every value on this page comes from the running deployment: configuration
 * facts always, live health-check results when they answer. The board never
 * upgrades "configured" to "working" on its own — the chips carry the exact
 * state the registry reported.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Cpu,
  FlaskConical,
  Gauge,
  LoaderCircle,
  MemoryStick,
  RefreshCw,
  TriangleAlert,
  Wifi,
  WifiOff,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { StateChip, type IntegrationState } from "../state-chip";

interface ApiIntegration {
  id: string;
  name: string;
  role: string;
  configured: boolean;
  state: IntegrationState;
  detail: string;
  checkedAt: string | null;
  facts: Record<string, string | number | boolean | null>;
}

interface RegistryResponse {
  live: boolean;
  at: string;
  ready: number;
  total: number;
  integrations: ApiIntegration[];
}

const FACT_LABELS: Record<string, string> = {
  endpointConfigured: "endpoint set",
  fieldAgentEnabled: "field agent",
  timeoutMs: "timeout",
  httpStatus: "HTTP status",
  packBytes: "pack size",
  packVersion: "pack version",
  seedRows: "seed rows",
  trainRows: "train rows",
  exportPresent: "export present",
  adapterName: "adapter",
  baseModel: "base model",
  tinkerKeyPresent: "tinker key",
  evalStatus: "eval status",
  evalVersion: "eval version",
  serviceKeyPresent: "service key",
  modelVersion: "model version",
  latencyMs: "latency",
  voiceId: "voice id",
  assistantIdPresent: "assistant id",
  memoryCount: "memories",
  searchesLeft: "searches left",
  taskQueue: "task queue",
  dbName: "database",
  authConfigured: "auth configured",
};

function humanizeKey(key: string): string {
  if (FACT_LABELS[key]) return FACT_LABELS[key];
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
    .toLowerCase();
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

function formatFact(key: string, value: string | number | boolean | null): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") {
    if (key.endsWith("Bytes")) return formatBytes(value);
    if (key.endsWith("Ms")) return `${value} ms`;
    return String(value);
  }
  return value;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

interface EngineRow {
  key: string;
  icon: LucideIcon;
  name: string;
  role: string;
  value: string;
  sub: string;
  chip: IntegrationState | null;
  extra?: string;
  onlineDot?: boolean;
}

export function ModelsBoard() {
  const [data, setData] = useState<RegistryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations?live=1", { cache: "no-store" });
      if (!res.ok) throw new Error(`the registry route answered HTTP ${res.status}`);
      setData((await res.json()) as RegistryResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const integrations = data?.integrations ?? [];
  const byId = new Map(integrations.map((item) => [item.id, item]));

  const local = byId.get("local-ai");
  const server = byId.get("server-ai");
  const tinker = byId.get("tinker");
  const tabpfn = byId.get("tabpfn");
  const backboard = byId.get("backboard");

  const gemma: EngineRow = local?.configured
    ? {
        key: "gemma",
        icon: Cpu,
        name: "Gemma",
        role: "On-device vision + language analysis (preferred when present)",
        value: "LOCAL",
        sub: `runtime serving ${String(local.facts.model ?? "gemma")}`,
        chip: local.state,
      }
    : server?.configured
      ? {
          key: "gemma",
          icon: Cpu,
          name: "Gemma",
          role: "Vision + language analysis behind the Curiosity Engine",
          value: "SERVER",
          sub: `deployment endpoint · ${String(server.facts.model ?? "gemma")}`,
          chip: server.state,
        }
      : {
          key: "gemma",
          icon: Cpu,
          name: "Gemma",
          role: "Vision + language analysis behind the Curiosity Engine",
          value: "UNAVAILABLE",
          sub: "No endpoint configured — deterministic rules-only fallbacks run instead.",
          chip: server?.state ?? null,
        };

  const curiosityAdapter: EngineRow = {
    key: "tinker",
    icon: FlaskConical,
    name: "Curiosity Adapter",
    role: "A LoRA fine-tuned on Tinker so replies always propose a real-world action",
    value: tinker?.facts.evalVersion ? `v${String(tinker.facts.evalVersion)}` : "TINKER",
    sub: `adapter ${String(tinker?.facts.adapterName ?? "tinker")} · eval ${String(
      tinker?.facts.evalStatus ?? "not-run"
    )}`,
    chip: tinker?.state ?? null,
  };

  const fieldAgent: EngineRow = {
    key: "field",
    icon: Zap,
    name: "Field Agent",
    role: "Mastra recap agent that turns an expedition into a story",
    value:
      server?.state === "ready"
        ? "CONNECTED"
        : server?.configured
          ? String(server.state).replace("-", " ").toUpperCase()
          : "NOT CONFIGURED",
    sub: server?.configured
      ? `mastra · ${String(server.facts.model ?? "model")}`
      : "Recaps fall back to the deterministic storyteller.",
    chip: server?.state ?? null,
  };

  const prediction: EngineRow = {
    key: "tabpfn",
    icon: Gauge,
    name: "Prediction",
    role: "TabPFN likelihoods for birds, insects, flowers, rain — never an LLM guess",
    value:
      tabpfn?.state === "ready"
        ? "READY"
        : tabpfn?.state === "degraded"
          ? "NOT ENOUGH DATA"
          : tabpfn?.state
            ? String(tabpfn.state).replace("-", " ").toUpperCase()
            : "—",
    sub: `model ${String(tabpfn?.facts.modelVersion ?? "—")} · trained ${formatFact(
      "trained",
      tabpfn?.facts.trained ?? null
    )}`,
    chip: tabpfn?.state ?? null,
  };

  const memory: EngineRow = {
    key: "memory",
    icon: MemoryStick,
    name: "Memory",
    role: "Long-term assistant memory across expeditions",
    value: backboard?.configured ? "LOCAL + BACKBOARD" : "LOCAL",
    sub: backboard?.configured
      ? "On-device memories first; Backboard when the network answers."
      : "On-device memories (IndexedDB) — Backboard is not configured here.",
    chip: backboard?.state ?? null,
    extra: backboard?.configured ? undefined : "LOCAL ONLY",
  };

  const network: EngineRow = {
    key: "network",
    icon: online ? Wifi : WifiOff,
    name: "Network",
    role: "As reported by your browser — never faked by the app",
    value: online === null ? "…" : online ? "ONLINE" : "OFFLINE",
    sub: online
      ? "Server features (recap, voice, knowledge) can answer."
      : "Offline-first mode: everything local keeps working.",
    chip: null,
    onlineDot: true,
  };

  const engineRows = [gemma, curiosityAdapter, fieldAgent, prediction, memory, network];

  return (
    <div className="space-y-8">
      {/* Registry summary + refresh */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Verified ready
              </p>
              <p className="mt-0.5 font-mono text-2xl font-semibold">
                {loading && !data ? "…" : (data?.ready ?? 0)}
                <span className="text-sm text-muted-foreground">/{data?.total ?? 11}</span>
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Live checks ran
              </p>
              <p className="mt-0.5 font-mono text-2xl font-semibold">
                {formatTime(data?.at ?? null)}
              </p>
            </div>
            <p className="max-w-xs text-pretty text-xs text-muted-foreground">
              Each configured integration ran its own health check. Results are cached for 60
              seconds, so refreshing is never a probe storm.
            </p>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <RefreshCw aria-hidden />
            )}
            Run live checks
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3.5 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <div>
            <p className="font-medium">The registry could not be reached: {error}.</p>
            <p className="mt-0.5 text-pretty text-muted-foreground">
              This board shows nothing rather than guessing — retry the live checks above.
            </p>
          </div>
        </div>
      ) : null}

      {/* AI ENGINE board (§27) */}
      <section aria-label="AI engine board" className="space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">AI engine</h2>
        <ul className="divide-y rounded-2xl border bg-card">
          {engineRows.map((row) => {
            const Icon = row.icon;
            return (
              <li
                key={row.key}
                className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-forest/10 text-forest">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{row.name}</p>
                    <p className="text-pretty text-xs text-muted-foreground">{row.role}</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                  <p
                    className={cn(
                      "font-mono text-sm font-semibold tracking-wide",
                      row.key === "network" && online === false && "text-warning"
                    )}
                  >
                    {loading && !data && row.key !== "network" ? "—" : row.value}
                  </p>
                  {row.chip ? <StateChip state={row.chip} /> : null}
                  {row.extra ? (
                    <Badge variant="muted" className="text-[10px] tracking-wide">
                      {row.extra}
                    </Badge>
                  ) : null}
                  <p className="max-w-[26ch] text-[11px] text-muted-foreground">{row.sub}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Full registry */}
      <section aria-label="Integration registry" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Integration registry
          </h2>
          <p className="text-xs text-muted-foreground">
            {integrations.filter((item) => item.configured).length} configured ·{" "}
            {integrations.length} listed
          </p>
        </div>
        {integrations.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-40 animate-pulse rounded-2xl border bg-muted/40" />
            ))}
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {integrations.map((item) => {
              const factEntries = Object.entries(item.facts);
              return (
                <li key={item.id} className="rounded-2xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{item.name}</p>
                      <p className="mt-0.5 text-pretty text-xs text-muted-foreground">
                        {item.role}
                      </p>
                    </div>
                    <StateChip state={item.state} />
                  </div>
                  <p className="mt-3 text-pretty text-xs text-muted-foreground">{item.detail}</p>
                  {factEntries.length > 0 ? (
                    <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t pt-3">
                      {factEntries.map(([key, value]) => (
                        <div key={key} className="flex items-baseline gap-1.5">
                          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {humanizeKey(key)}
                          </dt>
                          <dd className="font-mono text-[11px]">{formatFact(key, value)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  <p className="mt-3 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {item.checkedAt
                      ? `Live check at ${formatTime(item.checkedAt)}`
                      : item.configured
                        ? "Not proven from here — facts only"
                        : "Configuration fact"}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-pretty rounded-xl bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          How to read this board: <span className="font-medium text-foreground">configured</span> is
          a configuration fact (an environment value exists).{" "}
          <span className="font-medium text-foreground">ready</span> is a claim about the live world
          and appears only after that integration&apos;s own check passed — the Tinker adapter is
          &ldquo;ready&rdquo; only when a real evaluation run is recorded on disk.
        </p>
      </section>
    </div>
  );
}
