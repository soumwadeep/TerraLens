"use client";

/**
 * One mission on the board. Actions are status-driven; locked missions stay
 * inert so the loop always points at exactly one next physical action.
 */
import * as React from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  RotateCcw,
  SkipForward,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MISSION_TYPE_META } from "@/lib/domain/labels";
import type { Mission } from "@/lib/domain/types";

const STATUS_META: Record<
  Mission["status"],
  { label: string; variant: "default" | "secondary" | "outline" | "muted" | "success" | "warning" }
> = {
  LOCKED: { label: "Locked", variant: "muted" },
  AVAILABLE: { label: "Ready", variant: "default" },
  ACTIVE: { label: "Active", variant: "success" },
  COMPLETED: { label: "Done", variant: "outline" },
  SKIPPED: { label: "Skipped", variant: "warning" },
  EXPIRED: { label: "Expired", variant: "muted" },
};

export function MissionCard({
  mission,
  busy,
  onActivate,
  onCapture,
  onComplete,
  onSkip,
  onRetry,
}: {
  mission: Mission;
  busy?: boolean;
  onActivate: (id: string) => void;
  onCapture: (missionId: string) => void;
  onComplete: (id: string) => void;
  onSkip: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const [showWhy, setShowWhy] = React.useState(false);
  const typeMeta = MISSION_TYPE_META[mission.type];
  const statusMeta = STATUS_META[mission.status];
  const locked = mission.status === "LOCKED";
  const warnings = mission.safetyMetadata.warnings;
  const caution = mission.safetyMetadata.level === "caution";

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-4 transition-colors",
        mission.status === "ACTIVE" && "border-forest/50 ring-1 ring-forest/20",
        locked && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 text-lg leading-none" aria-hidden>
            {typeMeta.emoji}
          </span>
          <div className="min-w-0">
            <p className="text-pretty font-medium leading-snug">{mission.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {typeMeta.label} · ~{mission.estimatedMinutes} min
            </p>
          </div>
        </div>
        <Badge variant={statusMeta.variant} className="shrink-0">
          {mission.status === "COMPLETED" ? <Check className="mr-1 h-3 w-3" aria-hidden /> : null}
          {statusMeta.label}
        </Badge>
      </div>

      <p className="mt-2.5 text-pretty text-sm text-muted-foreground">{mission.instruction}</p>

      {caution && warnings.length > 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
          <ul className="space-y-1 text-pretty">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {mission.whyItMatters ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowWhy((v) => !v)}
            aria-expanded={showWhy}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", showWhy && "rotate-180")}
              aria-hidden
            />
            Why this matters
          </button>
          {showWhy ? (
            <p className="mt-1.5 text-pretty text-xs text-muted-foreground">
              {mission.whyItMatters}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        {mission.status === "AVAILABLE" ? (
          <Button size="sm" disabled={busy} onClick={() => onActivate(mission.id)}>
            Start this mission
          </Button>
        ) : null}

        {mission.status === "ACTIVE" ? (
          <>
            <Button size="sm" disabled={busy} onClick={() => onCapture(mission.id)}>
              <Camera className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Capture evidence
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onComplete(mission.id)}
            >
              <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Mark done
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSkip(mission.id)}>
              <SkipForward className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Skip
            </Button>
          </>
        ) : null}

        {mission.status === "SKIPPED" ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onRetry(mission.id)}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Give it another go
          </Button>
        ) : null}

        {mission.status === "COMPLETED" ? (
          <p className="text-xs text-muted-foreground">
            {mission.observationIds.length > 0
              ? `${mission.observationIds.length} ${
                  mission.observationIds.length === 1 ? "observation" : "observations"
                } collected`
              : "Completed — no evidence needed"}
          </p>
        ) : null}

        {locked ? (
          <p className="text-xs text-muted-foreground">Unlocks as you clear the board</p>
        ) : null}

        {mission.offlineCapable ? (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <WifiOff className="h-3 w-3" aria-hidden />
            works offline
          </span>
        ) : null}
      </div>
    </div>
  );
}
