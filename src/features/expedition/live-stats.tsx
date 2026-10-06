"use client";

/**
 * Live expedition stats: four honest tiles (no invented values — GPS shows
 * "off" when there is no fix) plus the mission progress bar.
 */
import * as React from "react";
import { Compass, Eye, Footprints, MapPinOff } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { missionProgress } from "@/lib/missions/engine";
import { formatClock, formatDistance } from "@/lib/utils";
import type { Expedition, Mission } from "@/lib/domain/types";

function Tile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-muted/40 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </div>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums leading-none">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function LiveStats({
  expedition,
  missions,
  observationCount,
}: {
  expedition: Expedition;
  missions: Mission[];
  observationCount: number;
}) {
  const { elapsedSeconds, pocketSeconds, distanceMeters } = expedition.stats;
  const progress = missionProgress(missions);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Tile icon={Footprints} label="Outside" value={formatClock(elapsedSeconds)} />
        <Tile
          icon={Eye}
          label="Phone away"
          value={formatClock(pocketSeconds)}
          hint={pocketSeconds >= 600 ? "Nice pocket time" : undefined}
        />
        {distanceMeters !== null ? (
          <Tile icon={Compass} label="Distance" value={formatDistance(distanceMeters)} />
        ) : (
          <Tile icon={MapPinOff} label="Distance" value="—" hint="GPS off" />
        )}
        <Tile
          icon={Compass}
          label="Observations"
          value={String(observationCount)}
          hint={observationCount === 0 ? "First one is the hardest" : undefined}
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-xs text-muted-foreground">
          <span>Mission board</span>
          <span className="tabular-nums">
            {progress.completed} of {progress.total} done
          </span>
        </div>
        <Progress
          value={progress.completed}
          max={Math.max(1, progress.total)}
          label={`${progress.completed} of ${progress.total} missions completed`}
        />
      </div>
    </div>
  );
}
