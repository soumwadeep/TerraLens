import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Brain,
  CloudOff,
  Cpu,
  Database,
  ExternalLink,
  FileCode,
  FlaskConical,
  GitBranch,
  HardDrive,
  Microscope,
  Server,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Open AI",
  description:
    "What is actually open in TerraLens: the MIT-licensed codebase, the open-weight models, the swappable adapter layer, and the honesty rules that make the whole thing inspectable.",
};

const LAYERS: Array<{
  icon: typeof Cpu;
  name: string;
  openness: "Open code" | "Open weights" | "Swappable" | "Hosted, optional";
  detail: string;
}> = [
  {
    icon: FileCode,
    name: "TerraLens itself",
    openness: "Open code",
    detail:
      "The full application — engines, adapters, UI, workers, prediction service — under the MIT License, in one repository.",
  },
  {
    icon: Server,
    name: "App stack",
    openness: "Open code",
    detail:
      "Next.js, React, TypeScript, Tailwind CSS, zod, zustand, idb — open-source foundations end to end, no proprietary app framework.",
  },
  {
    icon: Brain,
    name: "Gemma",
    openness: "Open weights",
    detail:
      "The local model family for vision, sound and curiosity. Open weights you can run yourself on your own hardware.",
  },
  {
    icon: Cpu,
    name: "Local runtimes",
    openness: "Swappable",
    detail:
      "Any OpenAI-compatible runtime works — Ollama, LM Studio, llama.cpp. The adapter asks the runtime what it can do rather than assuming.",
  },
  {
    icon: Sparkles,
    name: "Curiosity Adapter",
    openness: "Open weights",
    detail:
      "A Gemma fine-tune for follow-up prompts, tuned in the open workspace under ai/tinker. Evaluation records feed /lab/evaluation directly.",
  },
  {
    icon: Microscope,
    name: "TabPFN",
    openness: "Open weights",
    detail:
      "Small-data prediction served by our own FastAPI boundary in services/prediction — predictions only exist when you have real history.",
  },
  {
    icon: HardDrive,
    name: "Temporal · Mastra · MongoDB Atlas · Tiger Data · Backboard · SerpApi · ElevenLabs · Sentry",
    openness: "Hosted, optional",
    detail:
      "Durable workflows and hosted services entirely behind typed adapters. Unconfigured means a typed unavailable state — never a simulated success.",
  },
];

export default function OpenPage() {
  return (
    <main className="container-page py-12 sm:py-16">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-forest">Open AI</p>
        <h1 className="mt-2 text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          A lens you can take apart.
        </h1>
        <p className="mt-4 text-pretty text-muted-foreground">
          TerraLens is built on open models for a plain reason: a companion that follows you into
          the woods should not stop working at the tree line. And a tool that asks to watch your
          walks should be readable all the way down.
        </p>
      </div>

      {/* Why */}
      <section aria-labelledby="why-heading" className="mt-10">
        <h2 id="why-heading" className="font-display text-xl font-semibold tracking-tight">
          Why open matters here
        </h2>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {[
            {
              icon: CloudOff,
              title: "The signal dies outdoors",
              copy: "A hosted-only assistant is useless in a valley with no bars. Local open weights are the only architecture where the core loop keeps working with the network off.",
            },
            {
              icon: ShieldCheck,
              title: "Your data stays home",
              copy: "Running the model on your device means photos never need to leave it. Openness and privacy are the same decision here, not two features.",
            },
            {
              icon: Wrench,
              title: "Models are not the product",
              copy: "The AIModelAdapter contract means browser Gemma today, a better open model tomorrow, no rewrite. You are not locked to anyone\u2019s endpoint — including ours.",
            },
          ].map((item) => (
            <Card key={item.title}>
              <CardHeader className="pb-2">
                <span className="flex size-10 items-center justify-center rounded-xl bg-forest/10">
                  <item.icon className="size-5 text-forest" aria-hidden />
                </span>
                <CardTitle className="mt-2 text-base">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-pretty pt-0 text-sm text-muted-foreground">
                {item.copy}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* What's open */}
      <section aria-labelledby="layers-heading" className="mt-12">
        <h2 id="layers-heading" className="font-display text-xl font-semibold tracking-tight">
          What is actually open — layer by layer
        </h2>
        <p className="mt-1 text-pretty text-sm text-muted-foreground">
          Named precisely: open code, open weights, and hosted services, each labelled for what it
          really is.
        </p>
        <ul className="mt-5 space-y-2.5">
          {LAYERS.map((layer) => (
            <li key={layer.name} className="flex items-start gap-4 rounded-2xl border bg-card p-4">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-forest/10">
                <layer.icon className="h-4 w-4 text-forest" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{layer.name}</p>
                  <Badge variant={layer.openness === "Hosted, optional" ? "muted" : "success"}>
                    {layer.openness}
                  </Badge>
                </div>
                <p className="mt-1 text-pretty text-sm text-muted-foreground">{layer.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Honesty rules */}
      <section aria-labelledby="honesty-heading" className="mt-12">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              The rules that keep open honest
            </CardTitle>
            <CardDescription className="text-pretty">
              Written into the adapter contract — you can read them at{" "}
              <span className="font-mono text-xs">src/lib/ai/adapter.ts</span>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-pretty text-sm">
              {[
                "\u201cConfigured\u201d is never reported as ready: an adapter is OK only after a live probe of the runtime actually answers.",
                "An unavailable engine returns a typed unavailability with a reason — never a fabricated response that merely looks real.",
                "Every model output is untrusted input: parsed, schema-validated field by field, then reviewed by a deterministic safety layer.",
                "The Grass Score never consults a model at all. Openness would be pointless if the numbers were vibes.",
                "Showcase data is labelled DEMO DATA and mechanically barred from sync — it can never masquerade as a real record.",
              ].map((rule) => (
                <li key={rule} className="flex gap-2">
                  <span aria-hidden className="mt-0.5 text-forest">
                    ▪
                  </span>
                  {rule}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-pretty text-xs text-muted-foreground">
              Every rule above has a counterpart on{" "}
              <Link href="/judge" className="underline underline-offset-4">
                /judge
              </Link>{" "}
              with a route or command that proves it.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Fine-tuning */}
      <section aria-labelledby="tinker-heading" className="mt-12">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FlaskConical className="h-4 w-4" aria-hidden />
                Fine-tuned, not frozen
              </CardTitle>
            </CardHeader>
            <CardContent className="text-pretty text-sm text-muted-foreground">
              The Curiosity Adapter is trained in the open workspace under{" "}
              <span className="font-mono text-xs">ai/tinker</span> — dataset builds, training runs
              and evaluations land as records, and{" "}
              <Link href="/lab/evaluation" className="underline underline-offset-4">
                /lab/evaluation
              </Link>{" "}
              reads them directly. Where the numbers stop, the page says so instead of
              interpolating.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4" aria-hidden />
                Knowledge that works offline
              </CardTitle>
            </CardHeader>
            <CardContent className="text-pretty text-sm text-muted-foreground">
              The field guide retrieves from a bundled seed that works with no signal, and upgrades
              to vector retrieval (Tiger Data / pgvector) when the deployment has it. The database
              schema and seed tooling are open in{" "}
              <span className="font-mono text-xs">services/knowledge</span>.
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Receipts */}
      <section aria-labelledby="receipts-heading" className="mt-12">
        <Card className="border-forest/30 bg-forest/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BadgeCheck className="h-4 w-4" aria-hidden />
              Check the receipts
            </CardTitle>
            <CardDescription className="text-pretty">
              Openness that cannot be inspected is decoration. These all work right now.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="grid gap-2 sm:grid-cols-2">
              {[
                { href: "/judge", label: "10 numbered checks — /judge" },
                { href: "/lab", label: "The model lab — /lab" },
                { href: "/lab/architecture", label: "System diagram map — /lab/architecture" },
                { href: "/api/health", label: "GET /api/health" },
                { href: "/api/integrations", label: "GET /api/integrations" },
                { href: "/api/telemetry", label: "GET /api/telemetry" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 font-mono text-xs transition-colors hover:border-forest/60 hover:bg-forest/5"
                  >
                    {link.label}
                    <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <a href="https://github.com/soumwadeep/TerraLens" target="_blank" rel="noreferrer">
                  <GitBranch className="mr-1.5 h-4 w-4" aria-hidden />
                  Read the source
                  <ExternalLink className="ml-1.5 h-3 w-3" aria-hidden />
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/about">
                  The full story
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </div>
            <p className="text-pretty text-xs text-muted-foreground">
              Run it yourself: clone the repository, start with{" "}
              <span className="font-mono">pnpm install &amp;&amp; pnpm dev</span>, and point the
              local adapter at your own runtime. Every hosted service is optional — the README lists
              exactly what stays dark without keys, and what the app does instead.
            </p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
