import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CloudOff,
  Eye,
  Footprints,
  Lock,
  MessageCircleQuestion,
  PhoneOff,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MODE_META } from "@/lib/domain/labels";
import { HeroArt } from "@/features/landing/hero-art";
import { GrassScoreDemo } from "@/features/landing/grass-score-demo";

export const metadata: Metadata = {
  title: { absolute: "TerraLens — AI that sends you outside." },
  description:
    "An offline-first AI field companion that helps you notice more, explore farther, and spend less time looking at your screen. Local AI, a deterministic Grass Score, and expeditions that end with the phone in your pocket.",
};

const STEPS = [
  {
    title: "LOOK",
    icon: Eye,
    copy: "Point your camera at something odd, beautiful, or unnamed. Or just look — the walk decides.",
  },
  {
    title: "ASK",
    icon: MessageCircleQuestion,
    copy: "The Curiosity Engine asks better questions than \u201cwhat is this?\u201d What changed? What would it feel like? Guess first, then check.",
  },
  {
    title: "POCKET",
    icon: PhoneOff,
    copy: "Pocket Mode blanks the screen and counts the minutes your phone spends ignored. The app pays you to leave it alone.",
  },
  {
    title: "EXPLORE",
    icon: Footprints,
    copy: "Missions nudge you further down the path — find, listen, compare, collect. Small prompts, real ground.",
  },
  {
    title: "DISCOVER",
    icon: Sparkles,
    copy: "Observations fold into a journal, a Grass Score, and a record of the day you actually had outside.",
  },
] as const;

const OPEN_TILES = [
  { title: "NO SIGNAL?", copy: "Core exploration continues offline. Dead zones are features." },
  { title: "PHOTOS STAY LOCAL", copy: "On-device processing wherever your hardware allows." },
  {
    title: "SWAPPABLE MODELS",
    copy: "AIModelAdapter fits different open models into the same lens.",
  },
  { title: "FINE-TUNABLE", copy: "The Curiosity Adapter is a Gemma fine-tune — tuned on Tinker." },
  { title: "LOWER DEPENDENCY", copy: "The core loop never hinges on proprietary hosted AI." },
  { title: "TRANSPARENT", copy: "Model, runtime and readiness are visible — never guessed." },
] as const;

const TECH = [
  { name: "Next.js + React PWA", role: "Installable, offline-first app shell" },
  { name: "Gemma", role: "Local vision, sound and the Curiosity Engine" },
  { name: "Tinker", role: "Fine-tuning the Curiosity Adapter" },
  { name: "Mastra", role: "Cloud Field Agent — writes the expedition story" },
  { name: "MongoDB Atlas", role: "Optional cloud sync for your journal" },
  { name: "Temporal", role: "Durable workflows behind sync and stories" },
  { name: "TabPFN", role: "Small-data prediction once you have history" },
  { name: "Tiger Data", role: "Vector retrieval for the knowledge guide" },
  { name: "Backboard", role: "Long-term memory across walks" },
  { name: "SerpApi", role: "Opt-in online context for \u201cwhat\u2019s this?\u201d" },
  { name: "ElevenLabs", role: "Narration for expedition summaries" },
  { name: "Sentry", role: "Error tracing — redacted by default" },
] as const;

const PRIVACY_MODES = [
  {
    name: "LOCAL ONLY",
    icon: Lock,
    copy: "Everything stays on the device. Photos, audio, and notes never leave — no exceptions.",
  },
  {
    name: "HYBRID",
    icon: CloudOff,
    copy: "Local analysis first. Only selected metadata can sync, so your journal survives your next phone.",
  },
  {
    name: "CLOUD ENHANCED",
    icon: ShieldCheck,
    copy: "Explicit consent before anything uploads. Cloud helps when you ask — it never decides for you.",
  },
] as const;

export default function LandingPage() {
  return (
    <main>
      {/* 1 — Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-accent/20 via-transparent to-transparent"
          aria-hidden
        />
        <div className="container-page relative grid items-center gap-10 pb-16 pt-12 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pb-24">
          <div className="animate-fade-up">
            <Badge variant="sunlight" className="px-3 py-1">
              <Sparkles className="size-3.5" aria-hidden />
              POWERED BY OPEN AI
            </Badge>
            <h1 className="mt-5 text-balance font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              AI that sends you <span className="text-forest">outside</span>.
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
              An offline-first AI field companion that helps you notice more, explore farther, and
              spend less time looking at your screen.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="xl">
                <Link href="/home">
                  START EXPLORING
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="xl" variant="outline">
                <a href="#how">SEE HOW IT WORKS</a>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Free & open source · No account needed · Installable as an app
            </p>
          </div>

          <div className="stagger-2 animate-fade-up">
            <HeroArt />
          </div>
        </div>
      </section>

      {/* 2 — The shortest screen time wins */}
      <section className="border-y bg-muted/40 py-16 sm:py-20">
        <div className="container-narrow text-center">
          <h2 className="text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            The shortest screen time wins.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-muted-foreground">
            Most apps measure success in minutes spent staring. TerraLens measures the opposite: how
            quickly you can put it away. Every feature here points toward the world outside the
            glass — and then gets out of the way.
          </p>
        </div>
        <div className="container-page mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border bg-background p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              The usual pattern
            </p>
            <p className="mt-2 text-lg font-medium">
              Open app → scroll feed → stay longer → see more ads.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Engagement is the product. Your attention is the inventory.
            </p>
          </div>
          <div className="card-strata rounded-2xl p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-forest">
              The TerraLens pattern
            </p>
            <p className="mt-2 text-lg font-medium">
              Open app → get one good nudge → pocket the phone → notice things.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              The best session is one where you barely look at TerraLens.
            </p>
          </div>
        </div>
        <div className="container-page mt-8 grid gap-4 text-center sm:grid-cols-3">
          <div>
            <p className="font-display text-3xl font-semibold text-forest">1000</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The Grass Score ceiling — one honest, deterministic number per day.
            </p>
          </div>
          <div>
            <p className="font-display text-3xl font-semibold text-forest">60 min</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A full outdoor hour earns full duration credit. It&apos;s the walk that counts.
            </p>
          </div>
          <div>
            <p className="font-display text-3xl font-semibold text-forest">0</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Accounts required, ads shown, or feeds to fall into.
            </p>
          </div>
        </div>
      </section>

      {/* 3 — How it works */}
      <section id="how" className="scroll-mt-20 py-16 sm:py-20">
        <div className="container-page">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-forest">
              How it works
            </p>
            <h2 className="mt-2 text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Look. Ask. Pocket. Explore. Discover.
            </h2>
            <p className="mt-4 text-pretty text-muted-foreground">
              Five moves, in this order. The loop starts with your eyes and ends in your journal.
            </p>
          </div>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="card-strata animate-fade-up rounded-2xl p-5"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-forest/10">
                  <step.icon className="size-5 text-forest" aria-hidden />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold tracking-wide">
                  {step.title}
                </h3>
                <p className="mt-2 text-pretty text-sm text-muted-foreground">{step.copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 4 — Offline AI */}
      <section className="border-y bg-forest text-forest-foreground">
        <div className="container-page grid gap-10 py-16 sm:py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-forest-foreground/70">
              Offline AI
            </p>
            <h2 className="mt-2 text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              AI that works with no signal.
            </h2>
            <p className="mt-4 text-pretty text-forest-foreground/85">
              TerraLens layers its intelligence like a field kit. On-device first: Gemma runs in
              your browser when your hardware can take it — image hints, sound guesses, mission
              ideas — with nothing sent anywhere. When your device can&apos;t run it, a server
              endpoint can help, or the app hands you honest manual tools instead. It never pretends
              an AI answered when none did.
            </p>
            <div className="mt-6">
              <Button asChild variant="sunlight">
                <Link href="/open">
                  Why open AI matters here
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            {[
              {
                title: "On-device by default",
                copy: "Local Gemma processes photos, audio and notes where supported — nothing leaves the phone.",
              },
              {
                title: "Honest unavailability",
                copy: "If no engine can run, you get a clear unavailable state and manual alternatives — never invented results.",
              },
              {
                title: "An adapter, not a lock-in",
                copy: "The AIModelAdapter swaps models in and out: browser Gemma today, another open model tomorrow.",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-2xl bg-forest-foreground/10 p-5 backdrop-blur"
              >
                <h3 className="font-semibold">{card.title}</h3>
                <p className="mt-1 text-pretty text-sm text-forest-foreground/80">{card.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5 — Grass Score */}
      <section className="py-16 sm:py-20">
        <div className="container-page">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-forest">
              Grass Score
            </p>
            <h2 className="mt-2 text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              A score you can read, argue with, and trust.
            </h2>
            <p className="mt-4 text-pretty text-muted-foreground">
              Not generated by an LLM — computed by a transparent, unit-tested formula from your
              real day: time outside, time the phone stayed pocketed, missions done, things noticed.
              Drag the sliders and try to game it. We did, on purpose, so you can&apos;t.
            </p>
          </div>
          <div className="mt-10">
            <GrassScoreDemo />
          </div>
        </div>
      </section>

      {/* 6 — Exploration modes */}
      <section className="border-y bg-muted/40 py-16 sm:py-20">
        <div className="container-page">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-forest">
              Exploration modes
            </p>
            <h2 className="mt-2 text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Eight ways out the door.
            </h2>
          </div>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(MODE_META).map(([mode, meta]) => (
              <li key={mode} className="rounded-2xl border bg-background p-5">
                <span className="text-2xl" aria-hidden>
                  {meta.emoji}
                </span>
                <h3 className="mt-3 font-display text-lg font-semibold">{meta.label}</h3>
                <p className="mt-1 text-pretty text-sm text-muted-foreground">{meta.blurb}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 7 — Privacy */}
      <section className="py-16 sm:py-20">
        <div className="container-page">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-forest">Privacy</p>
            <h2 className="mt-2 text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Your walk is yours.
            </h2>
            <p className="mt-4 text-pretty text-muted-foreground">
              Pick how far your data can travel. Location is optional and stripped from share cards
              by default; raw photos, audio and notes never reach error telemetry.
            </p>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {PRIVACY_MODES.map((mode) => (
              <div key={mode.name} className="card-strata rounded-2xl p-6">
                <span className="flex size-10 items-center justify-center rounded-xl bg-forest/10">
                  <mode.icon className="size-5 text-forest" aria-hidden />
                </span>
                <h3 className="mt-4 font-display text-base font-semibold tracking-wide">
                  {mode.name}
                </h3>
                <p className="mt-2 text-pretty text-sm text-muted-foreground">{mode.copy}</p>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <Button asChild variant="outline">
              <Link href="/privacy">
                Read the privacy details
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* 8 — Open innovation */}
      <section className="border-y bg-muted/40 py-16 sm:py-20">
        <div className="container-page">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-forest">
              Why open AI?
            </p>
            <h2 className="mt-2 text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              A lens you can take apart.
            </h2>
            <p className="mt-4 text-pretty text-muted-foreground">
              TerraLens is built on open models for a simple reason: a companion that follows you
              into the woods should not stop working at the tree line.
            </p>
          </div>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {OPEN_TILES.map((tile) => (
              <li key={tile.title} className="rounded-2xl border bg-background p-5">
                <h3 className="text-sm font-bold tracking-wide text-forest">{tile.title}</h3>
                <p className="mt-2 text-pretty text-sm text-muted-foreground">{tile.copy}</p>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <Button asChild>
              <Link href="/open">
                See the full open-AI story
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* 9 — Technology */}
      <section className="py-16 sm:py-20">
        <div className="container-page">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-forest">Technology</p>
            <h2 className="mt-2 text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              What&apos;s under the lens.
            </h2>
            <p className="mt-4 text-pretty text-muted-foreground">
              A small phone-first stack with optional cloud services. The{" "}
              <Link
                href="/lab"
                className="font-medium text-forest underline-offset-4 hover:underline"
              >
                model lab
              </Link>{" "}
              reports exactly what is live right now — configured is not the same as working, and we
              never claim otherwise.
            </p>
          </div>
          <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TECH.map((tech) => (
              <li
                key={tech.name}
                className="flex items-baseline justify-between gap-3 rounded-xl border bg-background px-4 py-3"
              >
                <span className="text-sm font-semibold">{tech.name}</span>
                <span className="text-right text-xs text-muted-foreground">{tech.role}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 10 — CTA */}
      <section className="border-t bg-forest py-16 text-forest-foreground sm:py-20">
        <div className="container-narrow text-center">
          <h2 className="text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Ready to touch grass?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-forest-foreground/85">
            Free, open source, and built to be abandoned after five minutes — ideally somewhere with
            better lighting.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="xl" variant="sunlight">
              <Link href="/home">
                START EXPLORING
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              size="xl"
              variant="outline"
              className="border-forest-foreground/30 bg-transparent text-forest-foreground hover:bg-forest-foreground/10 hover:text-forest-foreground"
            >
              <Link href="#how">SEE HOW IT WORKS</Link>
            </Button>
          </div>
          <p className="mt-6 text-xs text-forest-foreground/70">
            Judging this project?{" "}
            <Link
              href="/judge"
              className="underline underline-offset-4 hover:text-forest-foreground"
            >
              Start with judge mode
            </Link>{" "}
            · Prefer a guided tour?{" "}
            <Link
              href="/demo"
              className="underline underline-offset-4 hover:text-forest-foreground"
            >
              Try the demo
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
