/**
 * Share card renderer (spec §36) — deterministic 1200×630 PNG via next/og.
 *
 * Honesty and privacy rules for this endpoint:
 *  - the card renders NUMBERS ONLY: score, rank (derived here, never trusted
 *    from the client), completed missions, observations, minutes, date key.
 *    There is no free-text parameter, so notes/titles can never leak into an
 *    image that gets shared publicly;
 *  - no location, no coordinates, no identifiers — nothing that points at a
 *    person or a place;
 *  - invalid or missing parameters return 400 rather than a card with made-up
 *    defaults, because a wrong card is worse than no card.
 */
import { ImageResponse } from "next/og";
import { z } from "zod";
import { grassRankFor, GRASS_RANK_META } from "@/lib/scoring/grass-score";

export const runtime = "nodejs";

const ParamsSchema = z.object({
  score: z.coerce.number().int().min(0).max(1000),
  missions: z.coerce.number().int().min(0).max(50).default(0),
  observations: z.coerce.number().int().min(0).max(500).default(0),
  minutes: z.coerce.number().int().min(0).max(600).default(0),
  minutesLabel: z.enum(["outside", "planned"]).default("planned"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const FOREST = "#14352a";
const FOREST_MID = "#1d5c42";
const PAPER = "#f3f1e7";
const MUTED = "#c9dccf";
const SUNLIGHT = "#f3bd3f";

function formatDate(key: string | undefined): string | null {
  if (!key) return null;
  const d = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = ParamsSchema.safeParse({
    score: searchParams.get("score") ?? undefined,
    missions: searchParams.get("missions") ?? undefined,
    observations: searchParams.get("observations") ?? undefined,
    minutes: searchParams.get("minutes") ?? undefined,
    minutesLabel: searchParams.get("minutesLabel") ?? undefined,
    date: searchParams.get("date") ?? undefined,
  });

  if (!parsed.success) {
    return Response.json(
      {
        error:
          "Invalid share-card parameters. Expected ?score=0-1000 with optional missions, observations, minutes, minutesLabel and date.",
      },
      { status: 400 }
    );
  }

  const { score, missions, observations, minutes, minutesLabel, date } = parsed.data;
  const rank = grassRankFor(score);
  const rankMeta = GRASS_RANK_META[rank];
  const dateText = formatDate(date);

  const stats: string[] = [];
  if (minutes > 0) stats.push(`${minutes} min ${minutesLabel}`);
  if (missions > 0) stats.push(`${missions} ${missions === 1 ? "mission" : "missions"}`);
  if (observations > 0)
    stats.push(`${observations} ${observations === 1 ? "observation" : "observations"}`);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: `linear-gradient(160deg, ${FOREST_MID} 0%, ${FOREST} 100%)`,
        fontFamily: "sans-serif",
      }}
    >
      {/* Wordmark */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              border: `3px solid ${SUNLIGHT}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Lens rings drawn as shapes — the ◉ glyph isn't in Satori's font set */}
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                border: `4px solid ${SUNLIGHT}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  background: SUNLIGHT,
                  display: "flex",
                }}
              />
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: PAPER }}>
            TerraLens
          </div>
        </div>
        <div
          style={{
            display: "flex",
            padding: "10px 22px",
            borderRadius: 999,
            border: `2px solid ${SUNLIGHT}`,
            color: SUNLIGHT,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 2,
          }}
        >
          GRASS SCORE
        </div>
      </div>

      {/* Score */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 28 }}>
        <div
          style={{
            display: "flex",
            fontSize: 220,
            fontWeight: 800,
            letterSpacing: -6,
            lineHeight: 1,
            color: PAPER,
          }}
        >
          {score}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            paddingBottom: 26,
          }}
        >
          <div style={{ display: "flex", fontSize: 34, color: MUTED }}>/ 1000</div>
          <div
            style={{
              display: "flex",
              padding: "10px 26px",
              borderRadius: 999,
              background: SUNLIGHT,
              color: FOREST,
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            {rankMeta.label}
          </div>
        </div>
      </div>

      {/* Stats + footer */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", fontSize: 32, color: MUTED }}>
          {stats.length > 0 ? stats.join("  ·  ") : "Deterministic scoring — no model involved."}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", fontSize: 24, color: PAPER }}>
            Offline-first · Local AI · Touch grass
          </div>
          {dateText ? (
            <div style={{ display: "flex", fontSize: 24, color: MUTED }}>{dateText}</div>
          ) : null}
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=86400",
      },
    }
  );
}
