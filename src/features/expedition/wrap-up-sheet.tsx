"use client";

/**
 * Wrap-up: final honest summary of the session, an optional story field, and
 * the single action that locks in the deterministic Grass Score.
 */
import * as React from "react";
import { Compass, Eye, Footprints, MapPinOff, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useExpeditionStore, type EndExpeditionResult } from "@/lib/state/expedition-store";
import { missionProgress } from "@/lib/missions/engine";
import { formatClock, formatDistance } from "@/lib/utils";
import type { Expedition, Mission } from "@/lib/domain/types";

export function WrapUpSheet({
  open,
  onOpenChange,
  expedition,
  missions,
  observationCount,
  onEnded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expedition: Expedition;
  missions: Mission[];
  observationCount: number;
  onEnded: (result: EndExpeditionResult) => void;
}) {
  const { toast } = useToast();
  const endExpedition = useExpeditionStore((s) => s.endExpedition);
  const [story, setStory] = React.useState("");
  const [scoring, setScoring] = React.useState(false);

  const progress = missionProgress(missions);
  const { elapsedSeconds, pocketSeconds, distanceMeters } = expedition.stats;

  async function finish() {
    if (scoring) return;
    setScoring(true);
    try {
      const result = await endExpedition({ story });
      if (!result) {
        toast({
          title: "Couldn't finish the expedition",
          description: "Try again — your data is still here.",
          variant: "error",
        });
        return;
      }
      onOpenChange(false);
      onEnded(result);
    } finally {
      setScoring(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Wrap up this expedition"
      description="Scores come from what actually happened — then you're free."
      dismissible={!scoring}
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-xl border bg-muted/40 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Footprints className="h-3.5 w-3.5" aria-hidden />
            Outside
          </div>
          <p className="mt-1 font-display text-lg font-semibold tabular-nums">
            {formatClock(elapsedSeconds)}
          </p>
        </div>
        <div className="rounded-xl border bg-muted/40 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Eye className="h-3.5 w-3.5" aria-hidden />
            Phone away
          </div>
          <p className="mt-1 font-display text-lg font-semibold tabular-nums">
            {formatClock(pocketSeconds)}
          </p>
        </div>
        <div className="rounded-xl border bg-muted/40 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {distanceMeters !== null ? (
              <Compass className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <MapPinOff className="h-3.5 w-3.5" aria-hidden />
            )}
            Distance
          </div>
          <p className="mt-1 font-display text-lg font-semibold tabular-nums">
            {distanceMeters !== null ? formatDistance(distanceMeters) : "—"}
          </p>
          {distanceMeters === null ? (
            <p className="text-[11px] text-muted-foreground">GPS off</p>
          ) : null}
        </div>
        <div className="rounded-xl border bg-muted/40 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Target className="h-3.5 w-3.5" aria-hidden />
            Missions
          </div>
          <p className="mt-1 font-display text-lg font-semibold tabular-nums">
            {progress.completed}/{progress.total}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {observationCount} {observationCount === 1 ? "observation" : "observations"}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="wrap-story">Anything worth remembering? (optional)</Label>
        <Textarea
          id="wrap-story"
          value={story}
          onChange={(e) => setStory(e.target.value)}
          placeholder="The one moment you'd tell someone about…"
          rows={3}
          maxLength={4000}
        />
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
        <Button onClick={() => void finish()} disabled={scoring}>
          {scoring ? "Scoring…" : "Finish & see my score"}
        </Button>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={scoring}>
          Keep exploring
        </Button>
      </div>
    </Dialog>
  );
}
