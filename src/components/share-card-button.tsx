"use client";

/**
 * Share card UI (spec §36). The card itself is rendered server-side by
 * /api/share-card from numeric query params only — score, counts, minutes and
 * the date. No notes, titles, coordinates or free text ever enter the URL, so
 * the image can't leak anything the user wrote.
 */
import * as React from "react";
import { Download, ImageDown, LoaderCircle, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ShareCardButton({
  score,
  missions,
  observations,
  minutes,
  minutesLabel,
  dateKey,
}: {
  score: number;
  missions: number;
  observations: number;
  minutes: number;
  minutesLabel: "outside" | "planned";
  dateKey: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);

  const search = new URLSearchParams({
    score: String(score),
    missions: String(missions),
    observations: String(observations),
    minutes: String(minutes),
    minutesLabel,
    date: dateKey,
  });
  const cardUrl = `/api/share-card?${search.toString()}`;

  async function share() {
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch(cardUrl);
      if (!response.ok) throw new Error(`Card render failed (${response.status})`);
      const blob = await response.blob();
      const file = new File([blob], "terralens-grass-score.png", { type: "image/png" });
      const canShareFiles =
        typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
      if (canShareFiles) {
        await navigator.share({
          files: [file],
          title: "My TerraLens Grass Score",
          text: `Grass Score ${score}/1000 — touch grass.`,
        });
        setStatus("Shared.");
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "terralens-grass-score.png";
        anchor.click();
        URL.revokeObjectURL(url);
        setStatus("Sharing isn't available here, so the card was downloaded instead.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus(null);
      } else {
        setStatus("Couldn't build the card — try the download link.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered PNG preview, not a static asset */}
      <img
        src={cardUrl}
        alt={`Share card preview — Grass Score ${score} out of 1000`}
        width={1200}
        height={630}
        className="w-full rounded-xl border"
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void share()} disabled={busy} className="flex-1">
          {busy ? (
            <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Share2 className="mr-1.5 h-4 w-4" aria-hidden />
          )}
          Share card
        </Button>
        <Button asChild variant="outline" className="flex-1">
          <a href={cardUrl} download="terralens-grass-score.png">
            <Download className="mr-1.5 h-4 w-4" aria-hidden />
            Download PNG
          </a>
        </Button>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ImageDown className="h-3.5 w-3.5" aria-hidden />
        The card carries your score, counts and date — never notes, photos or location.
      </p>
      <p aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
        {status}
      </p>
    </div>
  );
}
