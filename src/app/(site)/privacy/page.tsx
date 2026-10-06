import type { Metadata } from "next";
import Link from "next/link";
import {
  BadgeCheck,
  Cloud,
  CloudOff,
  EyeOff,
  KeyRound,
  Lock,
  MapPin,
  ShieldCheck,
  UserX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "The specifics of how TerraLens handles your data: what leaves your device, when, and what never does — each claim mapped to the code that enforces it.",
};

const MODES = [
  {
    name: "Local only",
    icon: Lock,
    tagline: "Nothing leaves. No exceptions.",
    body: "The analysis pipeline never calls the server path, sync is skipped, and online lookups disappear from the interface entirely. The journal lives in your browser's IndexedDB and nowhere else.",
  },
  {
    name: "Hybrid — default",
    icon: CloudOff,
    tagline: "Local first, sync when you have signal.",
    body: "On-device analysis runs first. If no local runtime answers, text can go to the deployment's server model to keep the pipeline honest. Records sync only when a backend actually answers — and demo data never syncs at all.",
  },
  {
    name: "Cloud enhanced",
    icon: Cloud,
    tagline: "Cloud helps — when you ask.",
    body: "The knowledge guide, prediction, voice narration and the field-agent recap may use server services. Requests stay small and typed; raw photos still never leave the device, and error telemetry stays redacted exactly as always.",
  },
] as const;

const FLOWS: Array<{ title: string; when: string; what: string; where: string }> = [
  {
    title: "Photos & audio",
    when: "Never by default",
    what: "Compressed on a canvas and stripped of EXIF — including GPS — at capture. On-device analysis may read the bytes; the server adapter never receives them.",
    where: "src/lib/media · src/lib/ai/analysis.ts",
  },
  {
    title: "Notes → server AI",
    when: "Only in Hybrid / Cloud enhanced, only when no local runtime answers",
    what: "Your typed note, the category, the mode and the environment — as data, never as instructions. In Local only mode this call cannot happen.",
    where: "src/lib/ai/adapter.ts · local-gemma.ts",
  },
  {
    title: "\u201cLook online\u201d searches",
    when: "Only when you tap the button",
    what: "The identified name, or a short query built from your note, capped at 300 characters. The button is hidden entirely under Local only.",
    where: "src/features/expedition/observation-card.tsx · src/lib/knowledge/retrieve.ts",
  },
  {
    title: "Voice narration",
    when: "Only when you request narration",
    what: "The recap text goes through a server-side proxy to the voice service. The API key exists only on the server; the browser never sees a credential.",
    where: "src/app/api/voice",
  },
  {
    title: "Journal sync",
    when: "Only with a backend configured, online, after confirmation",
    what: "Queued records post to /api/sync. Operations that carry origin \u201cdemo\u201d are refused by the queue itself — demonstration data stays on this device forever.",
    where: "src/lib/sync/queue.ts · engine.ts",
  },
  {
    title: "Field-agent recap",
    when: "Only when you ask for a recap",
    what: "A text-only summary: times, mission titles, observation categories. Explicitly not photos, not notes, not location.",
    where: "src/app/api/field-agent",
  },
  {
    title: "Error telemetry",
    when: "Whenever an error is recorded (local always; Sentry only if a DSN is configured)",
    what: "Redacted scalars: statuses, timings, counters. Photos, audio, notes, story text, transcripts, prompts, coordinates, emails and every secret-shaped key are dropped before anything is sent.",
    where: "src/lib/telemetry/redact.ts",
  },
  {
    title: "Share cards",
    when: "Only when you press Share",
    what: "Numbers only: score, counts, minutes, date. The rank is recomputed on the server, and there is no free-text parameter — so a note can never ride out inside an image.",
    where: "src/app/api/share-card/route.tsx",
  },
];

const NEVER: Array<{ icon: typeof EyeOff; text: string }> = [
  {
    icon: EyeOff,
    text: "Raw photos or audio in any telemetry or error report — redaction drops them by key.",
  },
  {
    icon: KeyRound,
    text: "API keys or secrets in the browser bundle — every sensitive call is proxied server-side.",
  },
  {
    icon: MapPin,
    text: "Precise location unless you explicitly choose it — the default mode is NONE, so geolocation is never even called.",
  },
  {
    icon: UserX,
    text: "An account, an email, or a profile — there is no sign-up. The app works with no identity at all.",
  },
  {
    icon: CloudOff,
    text: "Demonstration data, ever — origin \u201cdemo\u201d is refused by the sync queue and the sync engine.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="container-page py-12 sm:py-16">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-forest">Trust</p>
        <h1 className="mt-2 text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Your walk is yours.
        </h1>
        <p className="mt-4 text-pretty text-muted-foreground">
          This page is the specifics, not the sentiment. Every claim below maps to code in the
          repository — and where the code disagrees with this page, the code is what actually runs.
        </p>
      </div>

      {/* Postures */}
      <section aria-labelledby="modes-heading" className="mt-10">
        <h2 id="modes-heading" className="font-display text-xl font-semibold tracking-tight">
          Three data postures
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You choose the posture in Settings; it is enforced inside the pipeline, not in a policy
          document.
        </p>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {MODES.map((mode) => (
            <Card key={mode.name} className="card-strata">
              <CardHeader className="pb-2">
                <span className="flex size-10 items-center justify-center rounded-xl bg-forest/10">
                  <mode.icon className="size-5 text-forest" aria-hidden />
                </span>
                <CardTitle className="mt-2 text-base">{mode.name}</CardTitle>
                <CardDescription className="text-pretty">{mode.tagline}</CardDescription>
              </CardHeader>
              <CardContent className="text-pretty pt-0 text-sm text-muted-foreground">
                {mode.body}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* What leaves */}
      <section aria-labelledby="leaves-heading" className="mt-12">
        <h2 id="leaves-heading" className="font-display text-xl font-semibold tracking-tight">
          What leaves your device — and only when
        </h2>
        <div className="mt-5 overflow-hidden rounded-2xl border">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Each data flow, when it can happen, what it carries, and the code that governs it
            </caption>
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th scope="col" className="px-4 py-3 font-semibold">
                  Flow
                </th>
                <th scope="col" className="hidden px-4 py-3 font-semibold sm:table-cell">
                  When
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  What it carries
                </th>
              </tr>
            </thead>
            <tbody>
              {FLOWS.map((flow) => (
                <tr key={flow.title} className="border-b align-top last:border-b-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">{flow.title}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {flow.where}
                    </p>
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-muted-foreground sm:table-cell">
                    {flow.when}
                  </td>
                  <td className="text-pretty px-4 py-3 text-muted-foreground">
                    <span className="sm:hidden">{flow.when} · </span>
                    {flow.what}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Never */}
      <section aria-labelledby="never-heading" className="mt-12">
        <h2 id="never-heading" className="font-display text-xl font-semibold tracking-tight">
          What never leaves
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {NEVER.map((item) => (
            <li key={item.text} className="flex items-start gap-3 rounded-xl border p-4">
              <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
              <span className="text-pretty text-sm text-muted-foreground">{item.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Location */}
      <section aria-labelledby="location-heading" className="mt-12">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" aria-hidden />
              Location, precisely
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-pretty text-sm text-muted-foreground">
            <p>
              The default is <span className="font-mono text-xs">NONE</span> — the browser&apos;s
              geolocation API is never called while capturing, so &ldquo;no location&rdquo; is not a
              filter applied later; the data simply never exists.
            </p>
            <p>
              If you opt in, you choose the precision:{" "}
              <span className="font-mono text-xs">APPROXIMATE</span> rounds coordinates to about a
              hundred metres before they are ever stored, and{" "}
              <span className="font-mono text-xs">PRECISE</span> keeps what the device reports. On
              top of that, photo metadata (EXIF, including GPS) is stripped at capture regardless of
              this setting. Share cards never include location at all.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Verify */}
      <section aria-labelledby="verify-heading" className="mt-12">
        <Card className="border-forest/30 bg-forest/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Verify it yourself
            </CardTitle>
            <CardDescription className="text-pretty">
              Three public routes let you watch this working on a live deployment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="grid gap-2 text-sm sm:grid-cols-3">
              {[
                { href: "/lab/observability", label: "Redacted telemetry, live" },
                { href: "/api/telemetry", label: "GET /api/telemetry" },
                { href: "/api/integrations", label: "GET /api/integrations" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 font-mono text-xs transition-colors hover:border-forest/60 hover:bg-forest/5"
                  >
                    <BadgeCheck className="h-3.5 w-3.5 text-forest" aria-hidden />
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-pretty text-xs text-muted-foreground">
              The error-telemetry redaction rules are a pure function with no side effects — written
              to be readable at <span className="font-mono">src/lib/telemetry/redact.ts</span>. If
              you find a flow this page describes incorrectly, that is a bug worth an issue.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/lab/observability">See telemetry live</Link>
              </Button>
              <Badge variant="muted" className="h-8 px-3">
                No tracking scripts · No third-party analytics
              </Badge>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
