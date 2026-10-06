import { Leaf, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Original CSS/SVG hero artwork (spec §36): a phone interface mid-transition
 * into the physical world. No external imagery — everything ships in the
 * bundle and survives offline.
 */
export function HeroArt() {
  return (
    <div
      className="relative mx-auto w-full max-w-md lg:max-w-none"
      role="img"
      aria-label="A phone showing a TerraLens expedition mission; leaves drift out of the screen toward a sunlit landscape."
    >
      <div className="relative aspect-[5/4] overflow-hidden rounded-3xl border bg-gradient-to-b from-sky/25 via-background to-accent/30">
        {/* Sun */}
        <div
          className="absolute right-8 top-8 size-20 rounded-full bg-sunlight/70 blur-[1px]"
          aria-hidden
        />
        <div className="absolute right-10 top-10 size-16 rounded-full bg-sunlight/80" aria-hidden />

        {/* Hills */}
        <svg
          viewBox="0 0 600 320"
          className="absolute inset-x-0 bottom-0 h-3/5 w-full"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            d="M0 220 C 90 170, 190 180, 300 210 C 410 240, 500 190, 600 205 L 600 320 L 0 320 Z"
            className="fill-fern/35"
          />
          <path
            d="M0 250 C 120 215, 240 235, 340 252 C 440 268, 540 235, 600 245 L 600 320 L 0 320 Z"
            className="fill-moss/45"
          />
          <path
            d="M0 285 C 130 262, 260 278, 380 288 C 480 296, 550 282, 600 286 L 600 320 L 0 320 Z"
            className="fill-forest/70"
          />
        </svg>

        {/* Grass blades */}
        <svg
          viewBox="0 0 600 70"
          className="absolute inset-x-0 bottom-0 h-14 w-full"
          preserveAspectRatio="none"
          aria-hidden
        >
          <g className="stroke-forest" strokeWidth="3" strokeLinecap="round" fill="none">
            <path d="M14 70 Q 20 34 12 8" />
            <path d="M38 70 Q 30 30 44 12" />
            <path d="M70 70 Q 78 40 68 20" />
            <path d="M104 70 Q 96 34 110 6" />
            <path d="M142 70 Q 150 42 140 18" />
            <path d="M180 70 Q 172 32 186 10" />
            <path d="M218 70 Q 226 40 216 16" />
            <path d="M258 70 Q 250 36 264 8" />
            <path d="M300 70 Q 308 42 298 20" />
            <path d="M340 70 Q 332 34 346 12" />
            <path d="M380 70 Q 388 40 378 18" />
            <path d="M420 70 Q 412 32 426 6" />
            <path d="M462 70 Q 470 42 460 16" />
            <path d="M504 70 Q 496 36 510 10" />
            <path d="M546 70 Q 554 40 544 18" />
            <path d="M582 70 Q 574 34 588 12" />
          </g>
        </svg>

        {/* Drifting leaves escaping the phone */}
        <Leaf
          className="absolute left-[14%] top-[12%] size-6 animate-leaf-drift text-moss"
          style={{ animationDelay: "0s" }}
          aria-hidden
        />
        <Leaf
          className="absolute left-[6%] top-[46%] size-5 animate-leaf-drift text-fern"
          style={{ animationDelay: "1.2s" }}
          aria-hidden
        />
        <Leaf
          className="absolute right-[8%] top-[38%] size-7 animate-leaf-drift text-moss/80"
          style={{ animationDelay: "2.1s" }}
          aria-hidden
        />

        {/* Phone — the interface */}
        <div className="absolute left-1/2 top-1/2 w-[62%] max-w-[240px] -translate-x-1/2 -translate-y-[54%] -rotate-2">
          <div className="overflow-hidden rounded-[1.6rem] border border-border/80 bg-card shadow-2xl shadow-forest/20">
            <div className="flex items-center justify-between border-b bg-muted/50 px-3.5 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Expedition · Living World
              </span>
              <WifiOff className="size-3 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-2.5 p-3.5">
              <div className="rounded-xl border bg-background p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-forest">
                  Mission 2 of 4 · Look
                </p>
                <p className="mt-1 text-pretty text-xs leading-snug">
                  Find one fallen leaf. Study its edges — smooth, torn, or nibbled?
                </p>
              </div>
              <div className="flex items-center justify-between rounded-xl border bg-background p-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Grass Score
                  </p>
                  <p className="font-display text-lg font-semibold tabular-nums text-forest">412</p>
                </div>
                <svg viewBox="0 0 40 40" className="size-10 -rotate-90" aria-hidden>
                  <circle
                    cx="20"
                    cy="20"
                    r="16"
                    className="fill-none stroke-muted"
                    strokeWidth="5"
                  />
                  <circle
                    cx="20"
                    cy="20"
                    r="16"
                    className="fill-none stroke-forest"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray="100.5"
                    strokeDashoffset="58"
                  />
                </svg>
              </div>
              <div className="rounded-xl bg-forest py-2.5 text-center text-xs font-bold tracking-wide text-forest-foreground">
                🌱 TOUCH GRASS
              </div>
            </div>
          </div>
        </div>

        {/* Floating status chips */}
        <Badge
          variant="muted"
          className="absolute left-[4%] top-[30%] border bg-background/90 shadow-sm"
        >
          Nature / Screen 10.3×
        </Badge>
        <Badge
          variant="muted"
          className="absolute bottom-[24%] right-[4%] border bg-background/90 shadow-sm"
        >
          🦜 Unknown call — record?
        </Badge>
      </div>
    </div>
  );
}
