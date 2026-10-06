"use client";

/**
 * Shown right after a capture: one concrete thing to do next, chosen by the
 * deterministic curiosity engine. The main CTA moves the user into pocket
 * mode — away from the screen, which is the whole point.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Footprints, Sparkles, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { titleCase } from "@/lib/utils";
import type { CuriosityAction } from "@/lib/domain/types";

export function CuriositySheet({
  action,
  open,
  onOpenChange,
  expeditionId,
}: {
  action: CuriosityAction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expeditionId: string;
}) {
  const router = useRouter();
  if (!action) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Follow the curiosity"
      description="A small, physical next step — generated from what you just logged."
    >
      <div className="space-y-4">
        <p className="text-pretty text-sm text-muted-foreground">{action.shortInsight}</p>

        <div className="rounded-2xl border border-forest/30 bg-forest/5 p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-forest">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Try this next
          </div>
          <p className="mt-2 text-pretty font-medium leading-snug">{action.physicalAction}</p>
        </div>

        {action.nextMission ? (
          <p className="text-pretty text-sm text-muted-foreground">
            <span className="font-medium text-foreground">If it goes well: </span>
            {action.nextMission}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Timer className="h-3 w-3" aria-hidden />~{action.estimatedMinutes} min
          </Badge>
          <Badge variant="muted">{titleCase(action.category)}</Badge>
          {action.safetyLevel === "caution" ? <Badge variant="warning">Care needed</Badge> : null}
          {action.requiresScreen ? (
            <Badge variant="secondary">Needs the screen</Badge>
          ) : (
            <Badge variant="success">Screen-free</Badge>
          )}
        </div>

        {action.safetyLevel === "caution" ? (
          <p className="text-pretty rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
            Take care with this one — stay within your comfort zone and the conditions around you.
          </p>
        ) : null}
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
        <Button
          onClick={() => {
            onOpenChange(false);
            router.push(`/pocket/${expeditionId}`);
          }}
        >
          <Footprints className="mr-1.5 h-4 w-4" aria-hidden />
          Take it to pocket time
        </Button>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Not now
        </Button>
      </div>
    </Dialog>
  );
}
