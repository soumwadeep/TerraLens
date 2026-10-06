"use client";

/**
 * First-run onboarding: five short steps that stay entirely on-device.
 * Every setting here is optional and changeable later in Settings.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Leaf,
  Lock,
  Moon,
  Sparkles,
  Volume2,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Logo } from "@/components/layout/logo";
import { useAppStore } from "@/lib/state/app-store";
import { cn } from "@/lib/utils";
import type { Environment, Interest, LocationMode, PrivacyMode } from "@/lib/domain/types";

const INTEREST_OPTIONS: Array<{ value: Interest; label: string; emoji: string }> = [
  { value: "plants", label: "Plants & trees", emoji: "🌿" },
  { value: "birds", label: "Birds", emoji: "🦉" },
  { value: "photography", label: "Photography", emoji: "📷" },
  { value: "walking", label: "Long walks", emoji: "🥾" },
  { value: "science", label: "Nature science", emoji: "🔬" },
  { value: "sounds", label: "Sounds & silence", emoji: "🎧" },
  { value: "mindfulness", label: "Mindfulness", emoji: "🧘" },
  { value: "everything", label: "A bit of everything", emoji: "🎲" },
];

const ENVIRONMENT_OPTIONS: Array<{ value: Environment; label: string }> = [
  { value: "park", label: "Parks" },
  { value: "forest", label: "Forest or woods" },
  { value: "garden", label: "Garden or yard" },
  { value: "neighbourhood", label: "My neighbourhood" },
  { value: "campus", label: "Campus or grounds" },
  { value: "countryside", label: "Countryside" },
  { value: "unknown", label: "Not sure yet" },
];

const PRIVACY_OPTIONS: Array<{ value: PrivacyMode; title: string; body: string }> = [
  {
    value: "LOCAL_ONLY",
    title: "Local only",
    body: "Everything stays on this device. Nothing is ever uploaded.",
  },
  {
    value: "HYBRID",
    title: "Hybrid (default)",
    body: "On-device first. Cloud help only when you ask for it.",
  },
  {
    value: "CLOUD_ENHANCED",
    title: "Cloud enhanced",
    body: "Sends observations to the server for richer AI when online.",
  },
];

const STEP_TITLES = ["Welcome", "Interests", "Places", "Privacy", "Comfort"] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const hydrated = useAppStore((s) => s.hydrated);
  const user = useAppStore((s) => s.user);
  const preferences = useAppStore((s) => s.preferences);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const updatePreferences = useAppStore((s) => s.updatePreferences);

  const [step, setStep] = React.useState(0);
  const [displayName, setDisplayName] = React.useState("");
  const [interests, setInterests] = React.useState<Interest[]>([]);
  const [environment, setEnvironment] = React.useState<Environment>("unknown");
  const [privacyMode, setPrivacyMode] = React.useState<PrivacyMode>("HYBRID");
  const [locationMode, setLocationMode] = React.useState<LocationMode>("NONE");
  const [voiceEnabled, setVoiceEnabled] = React.useState(false);
  const [largeText, setLargeText] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(false);
  const [finishing, setFinishing] = React.useState(false);

  React.useEffect(() => {
    if (!hydrated || !preferences) return;
    setDisplayName(user?.displayName ?? "");
    setInterests(preferences.interests);
    setEnvironment(preferences.defaultEnvironment);
    setPrivacyMode(preferences.privacyMode);
    setLocationMode(preferences.locationMode);
    setVoiceEnabled(preferences.voice.enabled);
    setLargeText(preferences.accessibility.largeText);
    setReducedMotion(preferences.accessibility.reducedMotion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  function toggleInterest(value: Interest) {
    setInterests((prev) =>
      prev.includes(value) ? prev.filter((i) => i !== value) : [...prev, value]
    );
  }

  async function finish() {
    if (!preferences) return;
    setFinishing(true);
    await updatePreferences({
      interests,
      defaultEnvironment: environment,
      privacyMode,
      locationMode,
      voice: { ...preferences.voice, enabled: voiceEnabled },
      accessibility: {
        ...preferences.accessibility,
        largeText,
        reducedMotion,
      },
      onboardingComplete: true,
    });
    await completeOnboarding({ interests, displayName: displayName.trim() || undefined });
    router.replace("/home");
  }

  const isLast = step === STEP_TITLES.length - 1;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="safe-top container-page flex h-16 items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo className="h-7 w-7 text-forest" />
          <span className="font-display text-lg font-semibold">TerraLens</span>
        </div>
        {!isLast ? (
          <Button variant="ghost" size="sm" onClick={() => setStep(STEP_TITLES.length - 1)}>
            Skip to end
          </Button>
        ) : null}
      </header>

      <div className="container-narrow flex items-center gap-1.5 px-4 sm:px-6" aria-hidden>
        {STEP_TITLES.map((t, i) => (
          <div
            key={t}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i <= step ? "bg-forest" : "bg-muted"
            )}
          />
        ))}
      </div>

      <main id="main" className="container-narrow flex-1 py-8">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Step {step + 1} of {STEP_TITLES.length} · {STEP_TITLES[step]}
        </p>

        {step === 0 ? (
          <div className="animate-fade-up">
            <h1 className="mt-2 text-balance font-display text-3xl font-semibold">
              AI that sends you outside.
            </h1>
            <p className="mt-3 text-pretty text-muted-foreground">
              TerraLens turns your phone into a field companion: it helps you notice more, explore
              farther, then tells you to put it away. It works fully offline — the outdoors rarely
              has great signal.
            </p>
            <div className="mt-6 space-y-3">
              {[
                {
                  icon: WifiOff,
                  text: "Offline-first. Expeditions, missions and captures work with zero bars.",
                },
                {
                  icon: Sparkles,
                  text: "A Curiosity Engine that trades screen time for real-world actions.",
                },
                {
                  icon: Lock,
                  text: "Your notes and photos stay on your device unless you choose otherwise.",
                },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-forest" aria-hidden />
                  <p className="text-pretty text-sm">{text}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 space-y-2">
              <Label htmlFor="onb-name">What should we call you? (optional)</Label>
              <Input
                id="onb-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Explorer"
                maxLength={80}
                autoComplete="nickname"
              />
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="animate-fade-up">
            <h2 className="mt-2 text-balance font-display text-3xl font-semibold">
              What pulls you outside?
            </h2>
            <p className="mt-3 text-pretty text-muted-foreground">
              Pick anything that sounds like you. Missions will lean this way.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {INTEREST_OPTIONS.map(({ value, label, emoji }) => {
                const selected = interests.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleInterest(value)}
                    aria-pressed={selected}
                    className={cn(
                      "tap-target flex items-center gap-2.5 rounded-xl border p-3.5 text-left text-sm font-medium transition-colors",
                      selected
                        ? "border-forest bg-forest/10 text-forest"
                        : "bg-card hover:bg-muted/60"
                    )}
                  >
                    <span aria-hidden className="text-lg leading-none">
                      {emoji}
                    </span>
                    <span className="flex-1">{label}</span>
                    {selected ? <Check className="h-4 w-4" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="animate-fade-up">
            <h2 className="mt-2 text-balance font-display text-3xl font-semibold">
              Where will you usually explore?
            </h2>
            <p className="mt-3 text-pretty text-muted-foreground">
              Used to tailor missions to what actually surrounds you. Change it any time.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {ENVIRONMENT_OPTIONS.map(({ value, label }) => {
                const selected = environment === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setEnvironment(value)}
                    aria-pressed={selected}
                    className={cn(
                      "tap-target flex items-center justify-between rounded-xl border p-4 text-left text-sm font-medium transition-colors",
                      selected ? "border-forest bg-forest/10" : "bg-card hover:bg-muted/60"
                    )}
                  >
                    {label}
                    {selected ? <Check className="h-4 w-4 text-forest" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="animate-fade-up">
            <h2 className="mt-2 text-balance font-display text-3xl font-semibold">
              How private should this be?
            </h2>
            <p className="mt-3 text-pretty text-muted-foreground">
              You can switch any time. Local-only is a first-class mode, not a downgrade — the
              expedition loop still works completely.
            </p>
            <div className="mt-6 space-y-2.5">
              {PRIVACY_OPTIONS.map(({ value, title, body }) => {
                const selected = privacyMode === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPrivacyMode(value)}
                    aria-pressed={selected}
                    className={cn(
                      "tap-target w-full rounded-xl border p-4 text-left transition-colors",
                      selected ? "border-forest bg-forest/10" : "bg-card hover:bg-muted/60"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{title}</span>
                      {selected ? <Check className="h-4 w-4 text-forest" aria-hidden /> : null}
                    </div>
                    <p className="mt-1 text-pretty text-xs text-muted-foreground">{body}</p>
                  </button>
                );
              })}
            </div>
            <Card className="mt-5">
              <CardContent className="p-4 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Approximate location</p>
                    <p className="mt-0.5 text-pretty text-xs text-muted-foreground">
                      Only if you enable it. Off by default; precise GPS stays optional per
                      expedition.
                    </p>
                  </div>
                  <Switch
                    checked={locationMode !== "NONE"}
                    onCheckedChange={(on) => setLocationMode(on ? "APPROXIMATE" : "NONE")}
                    aria-label="Enable approximate location"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="animate-fade-up">
            <h2 className="mt-2 text-balance font-display text-3xl font-semibold">
              A couple of comfort settings.
            </h2>
            <p className="mt-3 text-pretty text-muted-foreground">
              All of these live in Settings too. Defaults are already sensible.
            </p>
            <div className="mt-6 space-y-3">
              <Card>
                <CardContent className="flex items-center justify-between gap-3 p-4 pt-4">
                  <div className="flex items-start gap-3">
                    <Volume2 className="mt-0.5 h-5 w-5 text-forest" aria-hidden />
                    <div>
                      <p className="text-sm font-medium">Voice guidance</p>
                      <p className="mt-0.5 text-pretty text-xs text-muted-foreground">
                        Spoken mission hints in Pocket Mode — phone stays in your pocket.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={voiceEnabled}
                    onCheckedChange={setVoiceEnabled}
                    aria-label="Enable voice guidance"
                  />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center justify-between gap-3 p-4 pt-4">
                  <div>
                    <p className="text-sm font-medium">Larger text</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Easier reading in bright sunlight.
                    </p>
                  </div>
                  <Switch
                    checked={largeText}
                    onCheckedChange={setLargeText}
                    aria-label="Larger text"
                  />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center justify-between gap-3 p-4 pt-4">
                  <div className="flex items-start gap-3">
                    <Moon className="mt-0.5 h-5 w-5 text-forest" aria-hidden />
                    <div>
                      <p className="text-sm font-medium">Reduce motion</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Calmer transitions throughout the app.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={reducedMotion}
                    onCheckedChange={setReducedMotion}
                    aria-label="Reduce motion"
                  />
                </CardContent>
              </Card>
            </div>
            <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
              <Leaf className="h-3.5 w-3.5 text-fern" aria-hidden />
              Observe, don&apos;t disturb — TerraLens never asks you to touch, feed or take
              wildlife.
            </p>
          </div>
        ) : null}
      </main>

      <footer className="safe-bottom container-narrow flex items-center justify-between gap-3 py-5">
        <Button
          variant="ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
          Back
        </Button>
        {isLast ? (
          <Button size="lg" onClick={() => void finish()} disabled={finishing || !hydrated}>
            {finishing ? "Setting up…" : "Start exploring"}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
          </Button>
        ) : (
          <Button size="lg" onClick={() => setStep((s) => s + 1)} disabled={!hydrated}>
            Continue
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
          </Button>
        )}
      </footer>
    </div>
  );
}
