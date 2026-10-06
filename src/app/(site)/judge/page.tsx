import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  Brain,
  CloudOff,
  Cpu,
  Footprints,
  Gauge,
  HardDrive,
  Leaf,
  Lock,
  Microscope,
  ShieldCheck,
  Telescope,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Judge mode",
  description:
    "The whole TerraLens project in ten numbered checks — every claim with a route or command that proves it, in under three minutes.",
};

function ProveChip({ href, label, mono = true }: { href: string; label: string; mono?: boolean }) {
  return (
    <Link
      href={href}
      className={
        "inline-flex items-center gap-1 rounded-lg border bg-background px-2 py-1 text-xs transition-colors hover:border-forest/60 hover:bg-forest/5 " +
        (mono ? "font-mono" : "")
      }
    >
      {label}
      <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
    </Link>
  );
}

function Section({
  n,
  icon,
  title,
  children,
  prove,
}: {
  n: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
  prove: Array<{ href: string; label: string }>;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 font-mono text-sm font-semibold text-forest" aria-hidden>
          {n}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
            <span className="text-forest" aria-hidden>
              {icon}
            </span>
            {title}
          </h2>
          <div className="space-y-2 text-pretty text-sm text-muted-foreground">{children}</div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {prove.map((p) => (
              <ProveChip key={p.href + p.label} href={p.href} label={p.label} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const SPONSOR_WORK: Array<{ name: string; does: string; verify: string; href: string }> = [
  {
    name: "Gemma (via your runtime)",
    does: "Vision + language analysis behind the Curiosity Engine; runs on-device or as the deployment's server model.",
    verify: "/lab/models",
    href: "/lab/models",
  },
  {
    name: "Tinker",
    does: "The Curiosity Adapter is a LoRA fine-tune; the evaluation board shows the recorded run — or says NOT RUN YET.",
    verify: "/lab/evaluation",
    href: "/lab/evaluation",
  },
  {
    name: "Mastra",
    does: "The cloud Field Agent reasons over an expedition and writes its story/recap.",
    verify: "/api/field-agent?health=1",
    href: "/api/field-agent?health=1",
  },
  {
    name: "MongoDB Atlas",
    does: "Optional server-side copy of synced journal data. Credentials never reach the browser.",
    verify: "/lab/models",
    href: "/lab/models",
  },
  {
    name: "Temporal",
    does: "Durable workflows behind sync and the field agent — a queued recap survives process restarts.",
    verify: "/lab/architecture",
    href: "/lab/architecture",
  },
  {
    name: "TabPFN",
    does: "Small-data prediction boundary — likelihoods only when a trained model answers, never an LLM guess.",
    verify: "/lab/models",
    href: "/lab/models",
  },
  {
    name: "Tiger Data (pgvector)",
    does: "Vector retrieval for the nature knowledge guide beyond the bundled seed.",
    verify: "/lab/models",
    href: "/lab/models",
  },
  {
    name: "Backboard",
    does: "Long-term memory across expeditions; when unconfigured the app runs LOCAL ONLY.",
    verify: "/lab/models",
    href: "/lab/models",
  },
  {
    name: "SerpApi",
    does: "Opt-in live context for “what’s this?”; without it the on-device knowledge still answers.",
    verify: "/lab/models",
    href: "/lab/models",
  },
  {
    name: "ElevenLabs",
    does: "Narration for expedition summaries — proxied server-side so the key never ships to the client.",
    verify: "/lab/architecture",
    href: "/lab/architecture",
  },
  {
    name: "Sentry",
    does: "Error tracing, redacted: statuses, timings, counters. Never photos, notes, or coordinates.",
    verify: "/lab/observability",
    href: "/lab/observability",
  },
];

export default function JudgePage() {
  return (
    <main className="pb-16">
      {/* Header */}
      <div className="border-b bg-muted/30">
        <div className="container-page py-10 sm:py-12">
          <Badge
            variant="outline"
            className="gap-1 font-mono text-[10px] uppercase tracking-widest"
          >
            <Microscope className="h-3 w-3" aria-hidden />
            JUDGE MODE
          </Badge>
          <h1 className="mt-3 text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            The whole project in ten checks.
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-muted-foreground">
            About three minutes of reading, then you can go outside too. Every link below is a real
            route on this deployment, and every claim is one you can falsify right here — that is
            the point. Where something is not configured, the app says so instead of pretending.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/home">
                Open the app
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/demo">Guided demo instead</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="container-page">
        <div className="mx-auto grid max-w-3xl gap-4 pt-8">
          <Section
            n="01"
            icon={<Footprints className="h-4 w-4" />}
            title="The loop is real and complete"
            prove={[
              { href: "/home", label: "/home" },
              { href: "/score", label: "/score" },
            ]}
          >
            <p>
              Start an expedition, get missions, capture an observation, watch the Curiosity Engine
              respond, journal it, finish, see the score. Nothing in that chain is a stub — the
              fastest path is the app itself.
            </p>
            <p className="text-xs">
              First run offers onboarding; you can skip it. Your data lives in the browser&apos;s
              IndexedDB — the server is a copy, never the source.
            </p>
          </Section>

          <Section
            n="02"
            icon={<Leaf className="h-4 w-4" />}
            title="The Grass Score is arithmetic, not vibes"
            prove={[
              { href: "/score", label: "/score — live breakdown" },
              { href: "/lab/architecture", label: "src/lib/scoring" },
            ]}
          >
            <p>
              A deterministic 0–1000 built from observable facts (time outside, screen time,
              distance, variety, streaks), with the full breakdown visible on the score page. No
              language model is ever asked for this number. The arithmetic lives in{" "}
              <span className="font-mono text-xs">src/lib/scoring/grass-score.ts</span> and its unit
              tests run in CI.
            </p>
          </Section>

          <Section
            n="03"
            icon={<Cpu className="h-4 w-4" />}
            title="Open AI with an honest fallback chain"
            prove={[
              { href: "/settings", label: "/settings — AI runtime" },
              { href: "/lab/models", label: "/lab/models" },
            ]}
          >
            <p>
              One adapter interface, three realities: on-device Gemma, the deployment&apos;s server
              model, or deterministic rules-only. In AUTO the order is on-device first; in LOCAL
              ONLY nothing is ever sent. The Settings card only turns green after a real probe
              answered — a configured URL is never shown as working.
            </p>
          </Section>

          <Section
            n="04"
            icon={<CloudOff className="h-4 w-4" />}
            title="Offline is tested, not claimed"
            prove={[
              { href: "/lab/offline", label: "/lab/offline — live device state" },
              { href: "/offline", label: "/offline" },
            ]}
          >
            <p>
              Turn your network off mid-expedition: capture, journal, scoring, and missions keep
              working, and writes queue. The queue only clears when the server actually acknowledges
              — nothing is ever marked &quot;synced&quot; offline. The offline board shows the
              browser&apos;s real signal; the app never fakes it.
            </p>
          </Section>

          <Section
            n="05"
            icon={<Gauge className="h-4 w-4" />}
            title="Configured is not the same as working"
            prove={[
              { href: "/lab", label: "/lab — the honesty contract" },
              { href: "/api/integrations?live=1", label: "GET /api/integrations?live=1" },
            ]}
          >
            <p>
              Eleven integrations, six possible states (READY, DEGRADED, NOT RUN YET, UNVERIFIED,
              NOT CONFIGURED, UNREACHABLE), and green only ever after a live check answered. Hit the
              API yourself — that JSON is what every status chip renders from.
            </p>
          </Section>

          <Section
            n="06"
            icon={<Activity className="h-4 w-4" />}
            title="The agent leaves inspectable traces"
            prove={[
              { href: "/lab/observability", label: "/lab/observability" },
              { href: "/api/field-agent?health=1", label: "GET /api/field-agent?health=1" },
            ]}
          >
            <p>
              Run a recap with the field agent enabled, then open the observability board: the real
              span timeline, durations, and correlation ID of that run — the same ID that appears in
              Sentry when a DSN is configured. No trace is ever fabricated; an empty process shows
              an empty board.
            </p>
          </Section>

          <Section
            n="07"
            icon={<Telescope className="h-4 w-4" />}
            title="Sponsor tech does actual work here"
            prove={[{ href: "/lab/architecture", label: "architecture map" }]}
          >
            <p>Each one has a job and a place where you can watch it not being faked:</p>
            <ul className="mt-2 grid gap-2">
              {SPONSOR_WORK.map((s) => (
                <li
                  key={s.name}
                  className="flex flex-col justify-between gap-1 rounded-xl border bg-background px-3 py-2 sm:flex-row sm:items-baseline sm:gap-4"
                >
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-foreground">{s.name}</span>
                    <p className="text-xs">{s.does}</p>
                  </div>
                  <Link
                    href={s.href}
                    className="shrink-0 font-mono text-xs text-forest underline underline-offset-4"
                  >
                    {s.verify}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            n="08"
            icon={<Lock className="h-4 w-4" />}
            title="Privacy is construction, not copy"
            prove={[
              { href: "/privacy", label: "/privacy" },
              { href: "/lab/observability", label: "redaction section" },
            ]}
          >
            <p>
              Server AI is text-only — image bytes never leave the device. Photos are EXIF/GPS
              stripped at capture. No precise location is stored or sent by default. Sentry gets
              whitelisted scalars (statuses, timings, counters), never notes, photos, or
              coordinates. LOCAL ONLY makes the device boundary absolute.
            </p>
          </Section>

          <Section
            n="09"
            icon={<HardDrive className="h-4 w-4" />}
            title="It ships like software"
            prove={[
              { href: "/open", label: "/open" },
              { href: "/about", label: "/about" },
            ]}
          >
            <p>
              TypeScript strict, ESLint, unit + E2E tests, a production build, and CI — the same
              loop you would run:
            </p>
            <pre className="overflow-x-auto rounded-xl border bg-background p-3 font-mono text-xs leading-relaxed">{`pnpm install
pnpm typecheck && pnpm lint
pnpm test
pnpm build`}</pre>
            <p className="text-xs">
              It is also an installable PWA — offline shell, versioned service worker, no API
              caching.
            </p>
          </Section>

          <Section
            n="10"
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Verify us on anything"
            prove={[
              { href: "/api/health", label: "GET /api/health" },
              { href: "/api/telemetry", label: "GET /api/telemetry" },
            ]}
          >
            <p>
              Three public endpoints exist purely for inspection: health, integration facts, and
              redacted telemetry. If a capability on this deployment is unconfigured, the honest
              answer is what you will get — which is exactly the behavior this project is claiming.
              Then close the laptop and go touch some grass.
            </p>
          </Section>

          {/* Footer strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-forest/30 bg-forest/5 p-5">
            <div className="flex items-center gap-2 text-pretty text-sm">
              <Brain className="h-4 w-4 text-forest" aria-hidden />
              <span>
                Questions we did not answer here?{" "}
                <Link href="/about" className="underline underline-offset-4">
                  /about
                </Link>{" "}
                has the full story, and{" "}
                <Link href="/open" className="underline underline-offset-4">
                  /open
                </Link>{" "}
                lists what is open source.
              </span>
            </div>
            <div className="flex gap-1.5">
              <ProveChip href="/lab" label="model lab" />
              <ProveChip href="/demo" label="demo" />
              <ProveChip href="/home" label="app" />
            </div>
          </div>

          <p className="pb-4 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <Footprints className="mr-1.5 inline h-3 w-3" aria-hidden />
            reading this on a screen was step one; step two is the door
          </p>
        </div>
      </div>
    </main>
  );
}
