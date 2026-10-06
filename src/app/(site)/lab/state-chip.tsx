import {
  CircleCheck,
  CircleDashed,
  CircleSlash,
  CircleX,
  Hourglass,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The honesty contract as a chip (spec §48, §49).
 *
 * `ready` is a claim about the live world; every other state is named exactly.
 * Labels are always present (not colour alone), so the status survives
 * greyscale, screen readers, and sceptical judges.
 */
export type IntegrationState =
  "ready" | "degraded" | "not-run" | "unverified" | "not-configured" | "unreachable";

const STATE_META: Record<
  IntegrationState,
  {
    label: string;
    variant: "success" | "warning" | "sky" | "muted" | "outline" | "destructive";
    icon: LucideIcon;
  }
> = {
  ready: { label: "READY", variant: "success", icon: CircleCheck },
  degraded: { label: "DEGRADED", variant: "warning", icon: TriangleAlert },
  "not-run": { label: "NOT RUN YET", variant: "sky", icon: Hourglass },
  unverified: { label: "UNVERIFIED", variant: "muted", icon: CircleDashed },
  "not-configured": { label: "NOT CONFIGURED", variant: "outline", icon: CircleSlash },
  unreachable: { label: "UNREACHABLE", variant: "destructive", icon: CircleX },
};

export function StateChip({ state, className }: { state: IntegrationState; className?: string }) {
  const meta = STATE_META[state];
  const Icon = meta.icon;
  return (
    <Badge
      variant={meta.variant}
      className={cn("shrink-0 gap-1 text-[10px] tracking-wide", className)}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {meta.label}
    </Badge>
  );
}

export const STATE_LEGEND: Array<{ state: IntegrationState; meaning: string }> = [
  {
    state: "ready",
    meaning: "A live check passed (or, for Tinker, a real evaluation run is recorded).",
  },
  {
    state: "degraded",
    meaning:
      "Answered, but with an observed limitation — say, a missing model or an unauthorized key.",
  },
  {
    state: "not-run",
    meaning: "Built and configured, but the proving step (a real run) has not been performed yet.",
  },
  {
    state: "unverified",
    meaning:
      "Configured on paper, but no live check has run from here. Configuration is not proof.",
  },
  {
    state: "not-configured",
    meaning:
      "The configuration fact is missing — the integration is off, and the app keeps working.",
  },
  {
    state: "unreachable",
    meaning: "Configured, the check ran, and it failed. Named plainly, never hidden.",
  },
];
