# TerraLens — Hacktoberfest 2026 · DEV Open-Source AI Challenge

**Week 1 theme: "Touch Grass."** An AI that measures its own success by how fast it gets you to put it down.

This document is the challenge write-up: what was built, which open-AI pieces do real work, and — most importantly — how to verify every claim in a few minutes without trusting the README.

---

## The idea

Most "AI + outdoors" apps are viewers: point the camera, get a label, keep scrolling. TerraLens inverts that. It treats time-on-screen as a cost and real-world action as the output:

- The **Curiosity Engine** doesn't tell you what something is so you can keep staring — it hands you one physical follow-up ("Get low, look at the leaf litter for thirty seconds").
- **Pocket Mode** dims the screen to a single idea and is designed to be closed.
- The **Grass Score** (0–1000) is pure arithmetic from observable facts — minutes outside, screen time, distance, variety, streaks — so the reward can't be talked up by a language model.

## What was actually built

A complete product, not a prototype:

| Area | Detail |
| --- | --- |
| **Expedition loop** | Onboarding → expedition setup → deterministic mission board → capture (photo/sound/note) → curiosity → wrap-up → Grass Score → journal. Every state persisted locally in IndexedDB. |
| **Offline-first** | Installable PWA, versioned service worker, honest network state, a sync queue that only clears on server acknowledgement, and an offline fallback route. The whole loop runs with zero bars. |
| **Open AI** | One adapter interface with on-device-first routing, an OpenAI-compatible Gemma path, a deterministic rules-only path, and a typed *unavailable* state instead of fabricated output. |
| **Deterministic engines** | Mission generation, curiosity selection, safety screening, and scoring are seeded/deterministic and unit-tested — identical online and offline. |
| **Cloud (optional)** | Mastra field agent recap, Temporal durable workflows, MongoDB Atlas storage, Tiger Data/pgvector retrieval, Backboard memory, TabPFN prediction boundary, SerpApi context, ElevenLabs voice (server-proxied), Sentry tracing (redacted). |
| **Engineering** | TypeScript strict, Vitest unit + integration suites, Playwright E2E, ESLint, Prettier, GitHub Actions CI, Render Blueprint. |

## Verify it in three minutes

Start with **`/judge`** on the deployment — it is a ten-section checklist where every claim links to a real route or command:

1. `/home` — walk the loop yourself (or `/demo` for the guided version on marked `DEMO DATA`).
2. `/score` — the live Grass Score breakdown; the arithmetic is `src/lib/scoring/grass-score.ts` with unit tests in CI.
3. `/settings` + `/lab/models` — AI runtime probes; a configured URL never shows as working until a real probe answers.
4. `/lab/offline` — the browser's real signal and queue depth. Turn off your network mid-expedition and watch writes queue instead of pretending.
5. `GET /api/integrations?live=1` — the raw JSON every status chip renders from. Six honest states, green only after a live check.
6. `/lab/observability` + `GET /api/field-agent?health=1` — real span timelines with correlation IDs; empty processes show empty boards.
7. `/api/health` and `GET /api/telemetry` — public inspection endpoints.

## Run it locally

```bash
pnpm install
pnpm dev                 # http://localhost:3000 — works with zero env vars

pnpm typecheck && pnpm lint
pnpm test                # unit + integration
pnpm test:e2e            # Playwright (starts its own dev server)
pnpm build
```

Optional integrations are documented in [`.env.example`](../.env.example); each one activates only when configured **and** health-checked.

## Built with

Written plainly: these are technologies the project integrates, not sponsorship claims. Each is optional; without its configuration the app degrades to a typed, visible honest state instead of pretending.

- **Google Gemma** (open weights) — vision/language analysis behind the Curiosity Engine, via any OpenAI-compatible runtime.
- **Tinker** — the Curiosity Adapter LoRA fine-tune workspace and evaluation board (`ai/tinker/`).
- **Mastra** — Field Agent orchestration for expedition recaps.
- **MongoDB Atlas** — optional server-side journal storage and sync.
- **Temporal** — durable workflows (`workers/temporal/`).
- **TabPFN** — small-data prediction boundary (`services/prediction/`).
- **Tiger Data (Postgres + pgvector)** — nature knowledge retrieval (`services/knowledge/`).
- **Backboard** — long-term agent memory provider.
- **SerpApi** — opt-in online context, labelled as such.
- **ElevenLabs** — Pocket Mode narration, proxied server-side.
- **Sentry** — redacted tracing and error capture.
- **Render** — the Blueprint in `render.yaml` deploys the app, prediction service, and worker.

## The honesty contract

The challenge asked for AI that does real work. That only means something if the app is honest when the AI *isn't* there. TerraLens enforces:

- **Never fabricate AI output.** No runtime → a typed unavailable state, not an invented identification.
- **Configured ≠ working.** Health checks decide readiness; env vars never do.
- **Demo data is quarantined.** `DEMO DATA` fixtures run the real engines but never reach stores or the sync queue.
- **No secrets client-side.** Every sponsor credential is server-proxied.
- **No precise location by default**, EXIF/GPS stripped at capture, and Sentry receives whitelisted scalars only.

These rules are enforced in code and pinned by tests (`tests/integration/`, unit suites), and they are the reason `/judge` tells you to try to falsify the app.

## Contributing

Issues and PRs are welcome. Ground rules: keep the honesty contract intact, add tests for engine changes, and never add a fixture to a production path — mark it `DEMO DATA` and isolate it.
