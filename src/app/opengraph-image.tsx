import { ImageResponse } from "next/og";
import { APP_DESCRIPTION } from "@/lib/config";

export const alt = "TerraLens — AI that sends you outside.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Social card, generated at build time with next/og (spec §36 hero identity).
 * Text only + shapes — no external assets, so it always renders.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "linear-gradient(160deg, #f7f6f1 0%, #e7e9d9 55%, #dbe6cf 100%)",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            border: "3px solid #1d5c42",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#1d5c42",
            fontSize: 34,
            background: "#ffffffcc",
          }}
        >
          ◉
        </div>
        <div style={{ display: "flex", fontSize: 36, fontWeight: 700, color: "#14352a" }}>
          TerraLens
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 800,
            letterSpacing: -2,
            color: "#14352a",
            maxWidth: 900,
          }}
        >
          AI that sends you outside.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 30,
            color: "#2f4a3c",
            maxWidth: 860,
            lineHeight: 1.35,
          }}
        >
          {APP_DESCRIPTION}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 22px",
            borderRadius: 999,
            background: "#14352a",
            color: "#f3f1e7",
            fontSize: 24,
            fontWeight: 600,
          }}
        >
          Offline-first · Local AI · Grass Score
        </div>
        <div style={{ display: "flex", fontSize: 22, color: "#2f4a3c" }}>
          Hacktoberfest 2026 · DEV Open Source AI Challenge
        </div>
      </div>
    </div>,
    size
  );
}
