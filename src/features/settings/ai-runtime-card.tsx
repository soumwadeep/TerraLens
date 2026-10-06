"use client";

/**
 * AI runtime settings (spec §26, §33).
 *
 * The rule this UI lives by: "configured" and "ready" are different things.
 * The status chips only turn green after a real health check answered — the
 * deployment having a URL set is never displayed as working.
 */
import * as React from "react";
import {
  BrainCircuit,
  CircleAlert,
  CircleCheck,
  Cpu,
  Globe,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describeAnalysisOrder, selectAnalysisOrder } from "@/lib/ai/analysis";
import { LOCAL_DEFAULT_BASE_URL, type AdapterProbe } from "@/lib/ai/adapter";
import { LocalGemmaAdapter } from "@/lib/ai/local-gemma";
import { ServerGemmaAdapter } from "@/lib/ai/server-gemma";
import { getPublicConfig } from "@/lib/config";
import { useAppStore } from "@/lib/state/app-store";
import { cn } from "@/lib/utils";
import type { AIRuntimePreference } from "@/lib/domain/types";

const RUNTIME_OPTIONS: Array<{ value: AIRuntimePreference; label: string; hint: string }> = [
  {
    value: "AUTO",
    label: "Auto",
    hint: "On-device first; the deployment's server if no local runtime.",
  },
  { value: "LOCAL", label: "On-device", hint: "Never sends observations to a server." },
  {
    value: "CLOUD",
    label: "Server",
    hint: "Server AI only, text-only — photos never leave the device.",
  },
];

const STATE_LABEL: Record<AdapterProbe["state"], string> = {
  ready: "Ready",
  "model-missing": "Model not loaded",
  unreachable: "Unreachable",
  "not-configured": "Not configured",
};

function stateVariant(state: AdapterProbe["state"]): "success" | "warning" | "muted" {
  if (state === "ready") return "success";
  if (state === "model-missing" || state === "unreachable") return "warning";
  return "muted";
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

function ProbeRow({
  icon,
  title,
  description,
  probe,
  testing,
  onTest,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  probe: AdapterProbe | null;
  testing: boolean;
  onTest: () => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <div className="min-w-0">
            <p className="text-sm font-medium">{title}</p>
            <p className="text-pretty text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onTest} disabled={testing}>
          {testing ? (
            <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          )}
          Test connection
        </Button>
      </div>
      {probe ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={stateVariant(probe.state)} className="gap-1 text-[10px]">
            {probe.state === "ready" ? (
              <CircleCheck className="h-3 w-3" aria-hidden />
            ) : (
              <CircleAlert className="h-3 w-3" aria-hidden />
            )}
            {STATE_LABEL[probe.state]}
          </Badge>
          {typeof probe.latencyMs === "number" ? (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {probe.latencyMs} ms
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
  );
}

export function AIRuntimeCard() {
  const preferences = useAppStore((s) => s.preferences);
  const updatePreferences = useAppStore((s) => s.updatePreferences);
  const [localProbe, setLocalProbe] = React.useState<AdapterProbe | null>(null);
  const [serverProbe, setServerProbe] = React.useState<AdapterProbe | null>(null);
  const [testing, setTesting] = React.useState<"local" | "server" | null>(null);

  if (!preferences) return null;

  const order = selectAnalysisOrder(preferences);
  const privacyForcesLocal =
    preferences.privacyMode === "LOCAL_ONLY" && preferences.aiRuntimePreference !== "LOCAL";

  async function testLocal() {
    setTesting("local");
    try {
      setLocalProbe(await new LocalGemmaAdapter().probe());
    } finally {
      setTesting(null);
    }
  }

  async function testServer() {
    setTesting("server");
    try {
      setServerProbe(await new ServerGemmaAdapter().probe());
    } finally {
      setTesting(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BrainCircuit className="h-4 w-4 text-forest" aria-hidden />
          AI runtime
        </CardTitle>
        <CardDescription>
          Which brain answers when you ask about a plant, bird or sound.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {RUNTIME_OPTIONS.map(({ value, label, hint }) => {
            const selected = preferences.aiRuntimePreference === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() => void updatePreferences({ aiRuntimePreference: value })}
                className={cn(
                  "tap-target rounded-xl border p-3.5 text-left transition-colors",
                  selected ? "border-forest bg-forest/10" : "bg-card hover:bg-muted/60"
                )}
              >
                <span className="block text-sm font-semibold">{label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
              </button>
            );
          })}
        </div>

        <p className="text-pretty rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Current order:{" "}
          <span className="font-medium text-foreground">{describeAnalysisOrder(order)}</span>
          {privacyForcesLocal
            ? " Privacy mode (Local only) keeps analysis on-device regardless of this choice."
            : ""}
        </p>

        <div className="space-y-2">
          <ProbeRow
            icon={<Cpu className="h-4 w-4 shrink-0 text-forest" aria-hidden />}
            title="On-device model"
            description="A local OpenAI-compatible runtime (e.g. Ollama serving Gemma). Works fully offline."
            probe={localProbe}
            testing={testing === "local"}
            onTest={() => void testLocal()}
          />
          <ProbeRow
            icon={<Globe className="h-4 w-4 shrink-0 text-sky" aria-hidden />}
            title="Server analysis"
            description="This deployment's own endpoint. Text-only by design — photos never leave your device."
            probe={serverProbe}
            testing={testing === "server"}
            onTest={() => void testServer()}
          />
        </div>

        {/* Model manager: where the on-device brain comes from. */}
        {(() => {
          const pack = getPublicConfig().localModelPack;
          const localUrl = getPublicConfig().localAI.url ?? LOCAL_DEFAULT_BASE_URL;
          if (pack.url) {
            return (
              <div className="flex items-center justify-between gap-3 rounded-xl border p-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    On-device AI pack{pack.version ? ` · ${pack.version}` : ""}
                  </p>
                  <p className="text-pretty text-xs text-muted-foreground">
                    {pack.bytes !== null ? `${formatBytes(pack.bytes)} · ` : ""}
                    Download it, then run your local runtime serving{" "}
                    {getPublicConfig().localAI.model}. The app finds it at {localUrl}.
                  </p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <a href={pack.url} download rel="noopener">
                    Download
                  </a>
                </Button>
              </div>
            );
          }
          return (
            <p className="text-pretty rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              This deployment doesn&apos;t publish an AI pack. For fully on-device analysis, run a
              local OpenAI-compatible runtime (e.g. Ollama with {getPublicConfig().localAI.model}) —
              the app looks at <span className="font-medium text-foreground">{localUrl}</span> and
              detects it automatically.
            </p>
          );
        })()}

        <p className="text-pretty text-xs text-muted-foreground">
          A green “Ready” only appears after a live check answered — a configured address alone is
          never shown as working.
        </p>
      </CardContent>
    </Card>
  );
}
