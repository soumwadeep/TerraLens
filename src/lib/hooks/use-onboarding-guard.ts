"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/state/app-store";

/**
 * Redirects first-run visitors to onboarding. Returns true once the app state
 * is hydrated and onboarding is complete — surfaces should render their real
 * content only then, to avoid flashing UI that is about to be replaced.
 */
export function useOnboardingGuard(): boolean {
  const router = useRouter();
  const hydrated = useAppStore((s) => s.hydrated);
  const preferences = useAppStore((s) => s.preferences);

  React.useEffect(() => {
    if (hydrated && preferences && !preferences.onboardingComplete) {
      router.replace("/onboarding");
    }
  }, [hydrated, preferences, router]);

  return hydrated && preferences !== null && preferences.onboardingComplete;
}
