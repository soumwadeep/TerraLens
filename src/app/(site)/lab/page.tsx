import Link from "next/link";
import { Activity, ArrowRight, Blocks, Gauge, HardDrive, Microscope } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getIntegrationStatuses } from "@/lib/integrations/registry";
import { STATE_LEGEND, StateChip } from "./state-chip";

export const dynamic = "force-dynamic";

const PAGES = [
  {
    href: "/lab/models",
    icon: Gauge,
    title: "Models",
    description:
      "The AI ENGINE board — Gemma, the curiosity adapter, the Mastra field agent, TabPFN, memory, the network — plus the full integration registry with live health checks.",
  },
  {
    href: "/lab/evaluation",
    icon: Microscope,
    title: "Evaluation",
    description:
      "The Tinker curiosity-adapter evaluation: real metrics from a recorded run, or an honest “not run”. Never invented numbers.",
  },
  {
    href: "/lab/observability",
    icon: Activity,
    title: "Observability",
    description:
      "Agent traces with correlation IDs and span timings, the server event ring buffer, and exactly what is redacted before anything reaches Sentry.",
  },
  {
    href: "/lab/offline",
    icon: HardDrive,
    title: "Offline",
    description:
      "Service worker, caches, IndexedDB, storage usage, sync queue — and instructions to test offline mode for real instead of faking it.",
  },
  {
    href: "/lab/architecture",
    icon: Blocks,
    title: "Architecture",
    description:
      "How data actually flows from camera to cloud — on-device first, cloud only when a connection exists. Drawn from the code in this repository.",
  },
];

export default async function LabOverviewPage() {
  const integrations = await getIntegrationStatuses();
  const configured = integrations.filter((item) => item.configured).length;

  return (
    <div className="space-y-10">
      <section aria-label="Live registry summary" className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Integrations listed
            </p>
            <p className="mt-1 font-mono text-3xl font-semibold">{integrations.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              All read from the running app right now.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Configured</p>
            <p className="mt-1 font-mono text-3xl font-semibold">
              {configured}
              <span className="text-base text-muted-foreground">/{integrations.length}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              A configuration fact — not a claim that it works.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Verified live</p>
            <p className="mt-1 font-mono text-3xl font-semibold">—</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Green only appears on{" "}
              <Link
                href="/lab/models"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Models
              </Link>{" "}
              after each live check answers.
            </p>
          </CardContent>
        </Card>
      </section>

      <section aria-label="The honesty contract" className="space-y-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">The honesty contract</h2>
        <p className="text-pretty text-sm text-muted-foreground">
          Every status in TerraLens is one of six states. There is no seventh, fuzzier state — and
          no state that means &ldquo;probably fine&rdquo;.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {STATE_LEGEND.map(({ state, meaning }) => (
            <li key={state} className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3">
              <StateChip state={state} className="mt-0.5" />
              <p className="text-pretty text-xs text-muted-foreground">{meaning}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Lab pages" className="grid gap-4 sm:grid-cols-2">
        {PAGES.map((page) => {
          const Icon = page.icon;
          return (
            <Link key={page.href} href={page.href} className="group">
              <Card className="h-full transition-colors group-hover:border-forest/50">
                <CardHeader className="flex-row items-center gap-3 space-y-0">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-forest/10 text-forest">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <CardTitle>{page.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <CardDescription className="text-pretty">{page.description}</CardDescription>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-forest">
                    Open
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>

      <section
        aria-label="Verify it yourself"
        className="rounded-2xl border bg-muted/40 p-5 text-sm text-muted-foreground"
      >
        <h2 className="font-display text-base font-semibold text-foreground">Verify it yourself</h2>
        <p className="mt-1 text-pretty">
          These pages hold no private data and render no environment variables (spec §52). Every
          number comes from one of these endpoints, which you can call directly:
        </p>
        <ul className="mt-3 space-y-1.5 font-mono text-xs">
          <li>
            <code className="rounded bg-background px-1.5 py-0.5">
              GET /api/integrations?live=1
            </code>{" "}
            <span className="font-sans">— the registry with live health checks</span>
          </li>
          <li>
            <code className="rounded bg-background px-1.5 py-0.5">GET /api/telemetry</code>{" "}
            <span className="font-sans">— the server event ring buffer + Sentry facts</span>
          </li>
          <li>
            <code className="rounded bg-background px-1.5 py-0.5">
              GET /api/field-agent?health=1
            </code>{" "}
            <span className="font-sans">— the Mastra field agent&apos;s model endpoint probe</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
