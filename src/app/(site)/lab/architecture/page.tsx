import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowDown,
  Brain,
  Camera,
  CloudOff,
  Compass,
  Cpu,
  Database,
  Footprints,
  Globe,
  HardDrive,
  Keyboard,
  Leaf,
  Mic,
  Server,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Architecture",
  description:
    "The real system behind TerraLens — on-device pipeline, connectivity boundary, and the cloud path — mapped to the repository.",
};

function Node({
  icon,
  title,
  detail,
  tone = "default",
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  tone?: "default" | "accent";
}) {
  return (
    <div
      className={
        tone === "accent"
          ? "rounded-xl border border-forest/40 bg-forest/5 p-3"
          : "rounded-xl border p-3"
      }
    >
      <div className="flex items-center gap-2">
        <span className="text-forest" aria-hidden>
          {icon}
        </span>
        <p className="text-sm font-medium">{title}</p>
      </div>
      <p className="mt-1 text-pretty text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function FlowArrow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-1 text-muted-foreground">
      <ArrowDown className="h-3.5 w-3.5" aria-hidden />
      <span className="text-[10px] uppercase tracking-widest">{label}</span>
    </div>
  );
}

function LayerCard({
  step,
  title,
  description,
  children,
}: {
  step: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{step}</p>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="text-pretty">{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function LabArchitecturePage() {
  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-pretty text-sm text-muted-foreground">
        Every box below exists in the code at the path printed under it. A diagram that showed
        something this repository does not contain would be a lie — so this one is small, and it is
        true.
      </p>

      {/* On-device */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="success" className="gap-1 text-[10px]">
            <CloudOff className="h-3 w-3" aria-hidden />
            WORKS WITH NO NETWORK
          </Badge>
          <span className="text-xs text-muted-foreground">the device boundary</span>
        </div>

        <LayerCard
          step="Layer 1 — capture"
          title="Camera · Mic · Keyboard"
          description="Observation capture happens locally. Photos are compressed and stripped of location metadata before anything else sees them."
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <Node
              icon={<Camera className="h-4 w-4" />}
              title="Photos"
              detail="Canvas-compressed, EXIF (incl. GPS) scrubbed, stored as blobs."
            />
            <Node
              icon={<Mic className="h-4 w-4" />}
              title="Audio"
              detail="Recorded locally for notes; transcription only via explicit server opt-in."
            />
            <Node
              icon={<Keyboard className="h-4 w-4" />}
              title="Text notes"
              detail="Typed observations — the one input that can go to the server AI."
            />
          </div>
          <p className="mt-3 font-mono text-[10px] text-muted-foreground">
            src/lib/media · src/features/expedition
          </p>
        </LayerCard>

        <FlowArrow label="observation" />

        <LayerCard
          step="Layer 2 — analysis pipeline"
          title="Adapter order: on-device → server → rules-only"
          description="One pipeline (src/lib/ai/analysis.ts). Privacy mode wins: LOCAL_ONLY never touches the server path. A runtime that answered and failed stops the chain — that failure is real information."
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <Node
              icon={<Cpu className="h-4 w-4" />}
              title="On-device Gemma"
              detail="OpenAI-compatible runtime (Ollama / LM Studio / llama.cpp). Image bytes are allowed — they never leave the machine."
              tone="accent"
            />
            <Node
              icon={<Server className="h-4 w-4" />}
              title="Server Gemma"
              detail="Deployment's cloud model. Text-only by contract — photos never leave the device."
            />
            <Node
              icon={<Compass className="h-4 w-4" />}
              title="Rules-only fallback"
              detail="Deterministic curiosity prompts when no runtime answers. Never an invented AI response."
            />
          </div>
          <p className="mt-3 font-mono text-[10px] text-muted-foreground">
            src/lib/ai/adapter.ts · local-gemma.ts · server-gemma.ts · analysis.ts
          </p>
        </LayerCard>

        <FlowArrow label="typed outcome" />

        <LayerCard
          step="Layer 3 — engines"
          title="Curiosity · Missions · Grass Score"
          description="Model output is schema-validated, re-scanned by the deterministic safety layer, then assembled. The Grass Score never consults a model at all."
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <Node
              icon={<Compass className="h-4 w-4" />}
              title="Curiosity Engine"
              detail="Rules + model suggestions → typed physical actions, blocked content withheld."
            />
            <Node
              icon={<Footprints className="h-4 w-4" />}
              title="Mission Engine"
              detail="Mission candidates pass the same safety review as any authored mission."
            />
            <Node
              icon={<Leaf className="h-4 w-4" />}
              title="Grass Score (0–1000)"
              detail="Deterministic, unit-tested, computed on-device. Not LLM-generated, ever."
              tone="accent"
            />
          </div>
          <p className="mt-3 font-mono text-[10px] text-muted-foreground">
            src/lib/curiosity · src/lib/missions · src/lib/scoring · src/lib/safety
          </p>
        </LayerCard>

        <FlowArrow label="persist" />

        <LayerCard
          step="Layer 4 — local storage"
          title="IndexedDB is the source of truth"
          description="The journal, media blobs, queue, scores, and traces live here first. The server is a copy — never the origin."
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <Node
              icon={<HardDrive className="h-4 w-4" />}
              title="IndexedDB (idb)"
              detail="Expeditions, observations, media blobs, knowledge cache, Grass Score snapshots."
            />
            <Node
              icon={<Activity className="h-4 w-4" />}
              title="Sync queue"
              detail="Writes enqueue operations that wait until the backend actually answers."
            />
          </div>
          <p className="mt-3 font-mono text-[10px] text-muted-foreground">
            src/lib/db · src/lib/sync · public/sw.js
          </p>
        </LayerCard>
      </div>

      {/* The line */}
      <div className="relative rounded-2xl border border-dashed border-forest/50 bg-forest/5 px-4 py-3 text-center">
        <p className="text-xs uppercase tracking-widest text-forest">
          the network line — everything above survives with it off
        </p>
      </div>

      {/* Server */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="sky" className="gap-1 text-[10px]">
            <Globe className="h-3 w-3" aria-hidden />
            REQUIRES CONNECTIVITY
          </Badge>
          <span className="text-xs text-muted-foreground">the deployment surface</span>
        </div>

        <LayerCard
          step="Layer 5 — sync & agent"
          title="Next.js route handlers → Temporal → Mastra"
          description="The sync engine posts queued operations to /api/sync. The field agent runs as a Temporal workflow with a Mastra agent inside; when either side is unconfigured the recap stays a typed unavailable state."
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <Node
              icon={<Activity className="h-4 w-4" />}
              title="POST /api/sync"
              detail="Acknowledged operations only leave the queue when the server confirms."
            />
            <Node
              icon={<Workflow className="h-4 w-4" />}
              title="Temporal worker"
              detail="workers/temporal — durable expedition workflow + activities."
            />
            <Node
              icon={<Brain className="h-4 w-4" />}
              title="Mastra field agent"
              detail="src/lib/server/field-agent.ts — reasons over expedition summaries, returns a recap."
            />
          </div>
          <p className="mt-3 font-mono text-[10px] text-muted-foreground">
            src/app/api/sync · src/app/api/field-agent · workers/temporal
          </p>
        </LayerCard>

        <FlowArrow label="read & write" />

        <LayerCard
          step="Layer 6 — sponsor-backed services"
          title="Storage, retrieval, prediction, voice, telemetry"
          description="Each integration reports its own state honestly through /api/integrations — 'ready' only ever appears after a live check answered."
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Node
              icon={<Database className="h-4 w-4" />}
              title="MongoDB Atlas"
              detail="Server-side copy of synced records. Credentials never reach the browser."
            />
            <Node
              icon={<Database className="h-4 w-4" />}
              title="Tiger Data / pgvector"
              detail="Semantic knowledge retrieval; the bundled seed still works offline."
            />
            <Node
              icon={<Brain className="h-4 w-4" />}
              title="TabPFN (FastAPI)"
              detail="services/prediction — predictions only when real history exists, else a typed boundary state."
            />
            <Node
              icon={<Mic className="h-4 w-4" />}
              title="ElevenLabs voice"
              detail="Server-side proxy only; the API key is never exposed client-side."
            />
            <Node
              icon={<Compass className="h-4 w-4" />}
              title="SerpApi"
              detail="Live context for plants & animals when online; degrades to device knowledge."
            />
            <Node
              icon={<Activity className="h-4 w-4" />}
              title="Sentry + telemetry"
              detail="Redacted, whitelisted scalars only — no photos, notes, or coordinates."
            />
          </div>
          <p className="mt-3 font-mono text-[10px] text-muted-foreground">
            src/lib/server · src/app/api/knowledge · /prediction · /voice · /enrich ·
            src/lib/telemetry
          </p>
        </LayerCard>

        <FlowArrow label="deploy" />

        <LayerCard
          step="Layer 7 — hosting"
          title="Render"
          description="One Next.js web service plus the Temporal worker (and optionally the prediction service). render.yaml is the source of truth for what deploys."
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <Node
              icon={<Globe className="h-4 w-4" />}
              title="Web service"
              detail="Next.js 15 — pages, route handlers, service worker assets."
            />
            <Node
              icon={<Workflow className="h-4 w-4" />}
              title="worker-temporal"
              detail="Runs the expedition workflows against the Temporal cluster."
            />
          </div>
          <p className="mt-3 font-mono text-[10px] text-muted-foreground">render.yaml</p>
        </LayerCard>
      </div>

      {/* Rules */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Boundary rules the code enforces
          </CardTitle>
          <CardDescription>
            Not aspirations — invariants you can check in the repository.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-pretty text-sm">
            {[
              "Server AI is text-only: image bytes are never forwarded to the server adapter (src/lib/ai/analysis.ts).",
              "API keys (ElevenLabs, SerpApi, MongoDB, Sentry DSN secrets…) live server-side; the browser bundle carries no credentials.",
              "The Grass Score is deterministic arithmetic with unit tests — no model is asked for a number.",
              "The network state shown in the UI comes from the browser and real health checks, never a simulated toggle.",
              "No precise location is stored or sent by default — GPS metadata is stripped at capture.",
              "Sentry receives redacted traces: statuses, timings, and counters — never photos, notes, or coordinates.",
              "An integration is marked READY only after a live check answers — a configured env var proves nothing on its own.",
            ].map((rule) => (
              <li key={rule} className="flex gap-2">
                <span aria-hidden className="mt-0.5 text-forest">
                  ▪
                </span>
                {rule}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Repo map */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Where each piece lives</CardTitle>
          <CardDescription>Follow the code from one line of this diagram.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
            {[
              ["src/lib/ai", "Adapter abstraction, Gemma adapters, analysis pipeline"],
              ["src/lib/scoring", "Grass Score — deterministic, unit-tested"],
              ["src/lib/curiosity · src/lib/missions", "Curiosity Engine and Mission Engine"],
              ["src/lib/safety", "Deterministic text & mission safety rules"],
              ["src/lib/db · src/lib/sync", "IndexedDB repositories, sync engine and queue"],
              [
                "src/lib/server",
                "MongoDB, Mastra field agent, Temporal client, TabPFN boundary, backboard, tiger, serpapi, voice",
              ],
              [
                "src/app/api",
                "Route handlers: analyze, sync, field-agent, knowledge, prediction, voice, memory, enrich, integrations, telemetry, health",
              ],
              ["src/app/(site)/lab", "This lab — every board reads the real thing"],
              ["workers/temporal", "Durable workflow + activities + worker entrypoint"],
              ["services/prediction", "TabPFN FastAPI boundary (train.py / serve.py)"],
              ["services/knowledge", "Tiger Data schema and seed tooling"],
              ["ai/tinker", "Fine-tuning / evaluation workspace (results feed /lab/evaluation)"],
              ["public/sw.js", "Versioned service worker — shell, pages, and assets only"],
            ].map(([path, what]) => (
              <div
                key={path}
                className="flex items-baseline justify-between gap-4 border-b border-border/60 py-1.5 last:border-b-0"
              >
                <dt className="font-mono text-xs">{path}</dt>
                <dd className="text-pretty text-right text-xs text-muted-foreground">{what}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
