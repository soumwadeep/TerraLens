"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { GRASS_SCORE_MAX } from "@/lib/scoring/grass-score";

/**
 * Deterministic Grass Score dial. Purely presentational — the number shown is
 * whatever score it is given; nothing here invents values.
 */
export function ScoreRing({
  score,
  size = 148,
  strokeWidth = 11,
  label,
  className,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  /** Small caption under the number (e.g. "Grass Score"). */
  label?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(GRASS_SCORE_MAX, score));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = clamped / GRASS_SCORE_MAX;
  const dash = circumference * progress;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Grass Score ${Math.round(clamped)} out of ${GRASS_SCORE_MAX}`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--forest))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ "--ring-total": `${circumference}` } as React.CSSProperties}
          className="animate-score-ring"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-semibold tabular-nums leading-none">
          {Math.round(clamped)}
        </span>
        <span className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          {label ?? `of ${GRASS_SCORE_MAX}`}
        </span>
      </div>
    </div>
  );
}
