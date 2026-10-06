"use client";

/**
 * Expedition setup — three quick choices (mood, time, place) and off you go.
 * If an expedition is already running we say so instead of silently replacing
 * it: the app runs one expedition at a time.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Compass, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/layout/app-shell";
import { cn } from "@/lib/utils";
import { ENVIRONMENT_META, MODE_META, suggestExpeditionTitle } from "@/lib/domain/labels";
import { useAppStore } from "@/lib/state/app-store";
import { useExpeditionStore } from "@/lib/state/expedition-store";
import { useOnboardingGuard } from "@/lib/hooks/use-onboarding-guard";
import type { Environment, ExpeditionMode } from "@/lib/domain/types";

const DURATIONS = [15, 30, 45, 60, 90] as const;
const MODES = Object.keys(MODE_META) as ExpeditionMode[];
const ENVIRONMENTS = Object.keys(ENVIRONMENT_META) as Environment[];

function durationLabel(min: number): string {
  return min < 60
    ? `${min} min`
    : min === 60
      ? "1 hour"
      : `${(min / 60).toFixed(1).replace(/\.0$/, "")} hours`;
}

export default function NewExpeditionPage() {
  const router = useRouter();
  const { toast } = useToast();
  const ready = useOnboardingGuard();
  const defaultEnvironment = useAppStore((s) => s.preferences?.defaultEnvironment ?? "unknown");
  const active = useExpeditionStore((s) => s.active);
  const initialized = useExpeditionStore((s) => s.initialized);
  const start = useExpeditionStore((s) => s.start);

  const [mode, setMode] = React.useState<ExpeditionMode>("nature");
  const [environment, setEnvironment] = React.useState<Environment>(defaultEnvironment);
  const [duration, setDuration] = React.useState<number>(30);
  const [title, setTitle] = React.useState("");
  const [starting, setStarting] = React.useState(false);

  React.useEffect(() => {
    setEnvironment(defaultEnvironment);
  }, [defaultEnvironment]);

  if (!ready) {
    return (
      <div>
        <PageHeader title="New expedition" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  // One expedition at a time — resume rather than replace.
  if (initialized && active) {
    return (
      <div className="animate-fade-up">
        <PageHeader
          title="Already out there"
          description="One expedition at a time keeps the score honest."
        />
        <Card className="border-forest/40">
          <CardContent className="flex flex-col items-center gap-4 px-4 py-8 text-center">
            <span className="text-3xl" aria-hidden>
              {MODE_META[active.mode].emoji}
            </span>
            <div>
              <p className="font-display text-lg font-medium">{active.title}</p>
              <p className="mt-1 text-pretty text-sm text-muted-foreground">
                It&apos;s still running. Continue it, or wrap it up before starting a new one.
              </p>
            </div>
            <Button asChild size="lg" className="w-full max-w-xs">
              <Link href={`/expeditions/${active.id}`}>
                Continue expedition <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const suggestedTitle = suggestExpeditionTitle(mode, environment);

  async function begin() {
    if (starting) return;
    setStarting(true);
    try {
      const expedition = await start({
        mode,
        environment,
        durationMinutes: duration,
        title: title.trim() || suggestedTitle,
      });
      if (!expedition) {
        toast({
          title: "Couldn't start the expedition",
          description: "Try again in a moment.",
          variant: "error",
        });
        return;
      }
      router.push(`/expeditions/${expedition.id}`);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="New expedition"
        description="Three quick choices. Then the phone goes away."
      />

      <div className="space-y-6">
        <section aria-labelledby="mode-label">
          <h2 id="mode-label" className="mb-2 text-sm font-semibold">
            What kind of outing?
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MODES.map((m) => {
              const meta = MODE_META[m];
              const selected = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={selected}
                  className={cn(
                    "tap-target flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition-colors",
                    selected
                      ? "border-forest bg-forest/5 ring-1 ring-forest/30"
                      : "hover:border-forest/40 hover:bg-muted/50"
                  )}
                >
                  <span className="text-xl" aria-hidden>
                    {meta.emoji}
                  </span>
                  <span className="text-sm font-medium leading-tight">{meta.label}</span>
                  <span className="text-pretty text-[11px] leading-tight text-muted-foreground">
                    {meta.blurb}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="duration-label">
          <h2 id="duration-label" className="mb-2 text-sm font-semibold">
            How long have you got?
          </h2>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                aria-pressed={duration === d}
                className={cn(
                  "min-h-10 rounded-full border px-4 text-sm font-medium transition-colors",
                  duration === d
                    ? "border-forest bg-forest text-primary-foreground"
                    : "hover:border-forest/40"
                )}
              >
                {durationLabel(d)}
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="environment-label">
          <h2 id="environment-label" className="mb-2 text-sm font-semibold">
            Where are you headed?
          </h2>
          <div className="flex flex-wrap gap-2">
            {ENVIRONMENTS.map((e) => {
              const meta = ENVIRONMENT_META[e];
              const selected = environment === e;
              return (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEnvironment(e)}
                  aria-pressed={selected}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                    selected
                      ? "border-forest bg-forest/10 text-forest"
                      : "text-muted-foreground hover:border-forest/40 hover:text-foreground"
                  )}
                >
                  <span aria-hidden>{meta.emoji}</span>
                  {meta.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {ENVIRONMENT_META[environment].hint}
          </p>
        </section>

        <section>
          <Label htmlFor="expedition-title" className="mb-2 block text-sm font-semibold">
            Name it (optional)
          </Label>
          <Input
            id="expedition-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={suggestedTitle}
            maxLength={120}
          />
        </section>

        <Card className="border-forest/30 bg-forest/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Compass className="h-4 w-4 shrink-0 text-forest" aria-hidden />
              <span className="text-pretty">
                {durationLabel(duration)} · {MODE_META[mode].label} ·{" "}
                {environment === "unknown"
                  ? "somewhere outside"
                  : ENVIRONMENT_META[environment].label.toLowerCase()}
              </span>
            </div>
            <Button size="lg" onClick={() => void begin()} disabled={starting || !initialized}>
              {starting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Play className="mr-2 h-4 w-4" aria-hidden />
              )}
              {starting ? "Starting…" : "Start expedition"}
            </Button>
          </CardContent>
        </Card>

        <p className="text-pretty text-center text-xs text-muted-foreground">
          Missions are suggestions, never dares. You stay in charge of where you go and what you do.
        </p>
      </div>
    </div>
  );
}
