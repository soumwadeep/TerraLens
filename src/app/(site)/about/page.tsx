import type { Metadata } from "next";
import Link from "next/link";
import {
  BadgeCheck,
  BookOpenText,
  Footprints,
  GitBranch,
  Heart,
  Leaf,
  ListChecks,
  Lock,
  Scale,
  Sparkles,
  Telescope,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "About",
  description:
    "The full story behind TerraLens — why an AI companion whose job is to end its own session, how it was built for Hacktoberfest 2026, and what it deliberately is not.",
};

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

const LOOP = [
  {
    title: "Go outside",
    copy: "Pick a duration and a place. No account, no setup — the expedition starts on your device.",
  },
  {
    title: "Follow missions",
    copy: "A deterministic Mission Engine deals a hand of small field tasks: find, listen, compare, collect. One active at a time, the next unlocks as you finish.",
  },
  {
    title: "Capture what you notice",
    copy: "A photo, a sound, or a few words. Media is stripped of metadata and stays on the device.",
  },
  {
    title: "Get a curiosity nudge",
    copy: "The on-device model — or, failing that, the rules — returns a physical-world action. The screen is not the answer; it is the exit.",
  },
  {
    title: "Earn Grass Score",
    copy: "Deterministic arithmetic, 0\u20131000, computed on the device. Time outside, phone-away time, missions, variety, distance — never a model\u2019s opinion.",
  },
  {
    title: "Wrap up honestly",
    copy: "A recap assembled from the real numbers. The field agent can write it in prose when configured — and says so plainly when it cannot.",
  },
] as const;

export default function AboutPage() {
  return (
    <main className="container-page py-12 sm:py-16">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-forest">About</p>
        <h1 className="mt-2 text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          One lens, pointed outside.
        </h1>
        <p className="mt-4 text-pretty text-muted-foreground">
          TerraLens is a field companion for amateur nature observers, built around an uncomfortable
          thesis: the best thing an AI app can do is end its own session. It helps you notice more,
          walk farther, and look at your phone less — then it tells you, in numbers you can argue
          with, how well that went.
        </p>
      </div>

      {/* The bet */}
      <section aria-labelledby="bet-heading" className="mt-10">
        <h2 id="bet-heading" className="font-display text-xl font-semibold tracking-tight">
          The bet
        </h2>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {[
            {
              icon: Footprints,
              title: "The screen is the rival",
              copy: "Pocket mode dims everything and counts the minutes your phone spends ignored. The product\u2019s success metric is time you did not spend holding it.",
            },
            {
              icon: Lock,
              title: "Honest by construction",
              copy: "No fabricated AI answers, no invented weather, no guessed scores. When a capability is unavailable, the interface says so and hands you a manual alternative.",
            },
            {
              icon: Leaf,
              title: "Offline is the default",
              copy: "Dead zones are the point. The entire core loop — missions, capture, curiosity, score — survives with the network off, because that is where the app is meant to be used.",
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

      {/* Is / is not */}
      <section aria-labelledby="isnot-heading" className="mt-12">
        <h2 id="isnot-heading" className="font-display text-xl font-semibold tracking-tight">
          What it is — and what it deliberately is not
        </h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Card className="border-forest/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BadgeCheck className="h-4 w-4 text-forest" aria-hidden />
                It is
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-pretty text-sm">
                {[
                  "A field journal that works with no signal, on your device, with no account.",
                  "A mission engine that nudges you further down the path, one small task at a time.",
                  "A transparent score: deterministic arithmetic with unit tests — not an LLM opinion.",
                  "An AI adapter that runs open models locally when your hardware allows, tells you when it cannot, and never pretends otherwise.",
                  "An installable PWA: the same app on a phone in the woods and a laptop on the desk.",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <span aria-hidden className="mt-0.5 text-forest">
                      ▪
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <X className="h-4 w-4 text-destructive" aria-hidden />
                It is not
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-pretty text-sm text-muted-foreground">
                {[
                  "An identification authority. Every analysis carries its uncertainty, and the app never claims more confidence than the evidence supports.",
                  "A foraging or medical guide. It never suggests eating, touching or handling anything — and plants carry an explicit safety warning.",
                  "An engagement machine. There are no streaks you can lose by closing the app, no notifications begging you back to the screen.",
                  "A cloud account. There is no sign-up; the journal lives in your browser and the server is an optional copy, never the origin.",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <span aria-hidden className="mt-0.5">
                      ▪
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* The loop */}
      <section aria-labelledby="loop-heading" className="mt-12">
        <h2 id="loop-heading" className="font-display text-xl font-semibold tracking-tight">
          The loop, in six steps
        </h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LOOP.map((step, index) => (
            <li key={step.title} className="rounded-2xl border bg-card p-5">
              <span className="font-mono text-sm font-semibold text-forest" aria-hidden>
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 font-semibold">{step.title}</h3>
              <p className="mt-1 text-pretty text-sm text-muted-foreground">{step.copy}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Built with */}
      <section aria-labelledby="built-heading" className="mt-12">
        <h2 id="built-heading" className="font-display text-xl font-semibold tracking-tight">
          Built with
        </h2>
        <p className="mt-1 text-pretty text-sm text-muted-foreground">
          These are technologies TerraLens is built with — named accurately, with no implied
          partnership or endorsement.
        </p>
        <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TECH.map((item) => (
            <li key={item.name} className="rounded-xl border bg-background p-3">
              <p className="text-sm font-semibold text-forest">{item.name}</p>
              <p className="mt-0.5 text-pretty text-xs text-muted-foreground">{item.role}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Hackathon + verify */}
      <section aria-labelledby="made-heading" className="mt-12">
        <Card className="border-forest/30 bg-forest/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Telescope className="h-4 w-4" aria-hidden />
              Why it exists
            </CardTitle>
            <CardDescription className="text-pretty">
              Built for Hacktoberfest 2026 · DEV Open Source AI Challenge — Week 1: Touch Grass.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-pretty text-sm text-muted-foreground">
            <p>
              The challenge asked for AI that gets people outside. TerraLens answers by making the
              phone the tool and the outdoors the product: every feature either pushes you off the
              screen or measures what happened after you put it away.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="muted">MIT License</Badge>
              <Badge variant="muted">Solo build</Badge>
              <Badge variant="muted">Next.js 15 · React 19 · TypeScript</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <a href="https://github.com/soumwadeep/TerraLens" target="_blank" rel="noreferrer">
                  <GitBranch className="mr-1.5 h-4 w-4" aria-hidden />
                  github.com/soumwadeep/TerraLens
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/judge">
                  <ListChecks className="mr-1.5 h-4 w-4" aria-hidden />
                  Judge it in 10 checks
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/demo">
                  <Sparkles className="mr-1.5 h-4 w-4" aria-hidden />
                  Walk the loop in the demo
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/open">
                  <BookOpenText className="mr-1.5 h-4 w-4" aria-hidden />
                  What is open source
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Scale className="h-3.5 w-3.5" aria-hidden />
          TerraLens is an independent open-source project. No sponsorship or endorsement by the
          projects it is built on is implied.
          <Heart className="h-3.5 w-3.5 text-fern" aria-hidden />
        </p>
      </section>
    </main>
  );
}
