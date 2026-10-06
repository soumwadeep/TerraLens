# TerraLens

**AI that sends you outside.**

TerraLens is an offline-first, multimodal AI nature-exploration companion built as an installable PWA. It plans an expedition with you, gives you one real-world mission at a time, listens when you capture what you found — then tells you to put your phone away.

[![CI](https://github.com/soumwadeep/TerraLens/actions/workflows/ci.yml/badge.svg)](https://github.com/soumwadeep/TerraLens/actions/workflows/ci.yml)

Built for the **Hacktoberfest 2026 · DEV Open-Source AI Challenge — Week 1: "Touch Grass"**. See [docs/HACKTOBERFEST.md](docs/HACKTOBERFEST.md) for the challenge write-up and the in-app `/judge` route for the ten-check tour.

---

## The loop

1. **Start an expedition** — pick a mood (Nature, Photographer, Explorer, Surprise, Chill), a duration, and where you're headed.
2. **Get a mission board** — generated deterministically from the expedition id, safety-scanned, identical online or offline. One mission available, the rest locked: one clear ask at a time.
3. **Touch Grass** — Pocket Mode dims everything and shows a single idea. Put the phone away.
4. **Capture** — photo, sound, or note. Photos are EXIF/GPS-stripped at capture; capture works fully offline.
5. **The Curiosity Engine responds** — a deterministic, offline-capable rules engine (optionally served by an open-weight model through the same schema) hands you one physical follow-up.
6. **Wrap up** — the **Grass Score** (0–1000, pure arithmetic from observable facts; never an LLM) lands with a full visible breakdown, and the journal remembers.

## What this repo does not do

These are load-bearing product rules, not marketing:

- **Never fabricate AI output.** If no runtime answers, the UI shows a typed *unavailable* state. Identifications, traces, predictions, and database records are never invented.
- **Configured ≠ working.** Integration status is decided by live health checks. An environment variable alone never turns a chip green.
- **Demo data is quarantined.** The guided demo runs real engines on clearly marked `DEMO DATA` fixtures that never touch production stores or the sync queue.
- **Credentials stay server-side.** ElevenLabs, MongoDB, Tiger Data, SerpApi, Backboard, TabPFN, Temporal — all proxied through API routes. No secrets in client bundles.
- **No precise location by default.** Local-only is a first-class mode, not a downgrade.
- **Sentry gets scalars only.** Statuses, timings, counters. Never photos, notes, or coordinates (`src/lib/telemetry/redact.ts`).

## The open-AI stack

| Layer | What it is |
| --- | --- |
| **Adapter interface** | One contract, three realities: on-device Gemma, the deployment's server model, or deterministic rules-only (`src/lib/ai/adapter.ts`). |
| **Gemma** | Open-weight vision + language analysis behind the Curiosity Engine, served by any OpenAI-compatible runtime (Ollama, llama.cpp, vLLM, LM Studio, hosted Gemma). |
| **Curiosity Adapter (Tinker)** | A LoRA fine-tune workspace in `ai/tinker/` — with a recorded evaluation board that says `NOT RUN YET` until you actually run it. |
| **Mastra Field Agent** | Cloud agent that reasons over a finished expedition and writes the recap, with inspectable traces. |
| **TabPFN** | Small-data prediction boundary in `services/prediction/` — likelihoods only when a trained artifact answers, never an LLM guess. |
| **Tiger Data (pgvector)** | Vector retrieval over the nature field guide beyond the bundled seed. Falls back to Postgres full-text, then the on-device guide. |
| **MongoDB Atlas** | Optional server-side copy of synced journal data. The browser store is the source of truth. |
| **Temporal** | Durable workflows so a queued recap survives process restarts (`workers/temporal/`). |
| **ElevenLabs** | Pocket Mode narration, proxied server-side so the key never reaches the browser. Without it, browser SpeechSynthesis takes over. |
| **Backboard** | Long-term agent memory; unconfigured → `LOCAL ONLY`. |
| **SerpApi** | Opt-in live context for "what's this?", clearly labelled `ONLINE CONTEXT` — never the identification engine. |
| **Sentry** | Redacted error/span tracing; without a DSN it's a no-op and local ring buffers take over. |

Every integration has an honest state machine: `READY · DEGRADED · NOT RUN YET · UNVERIFIED · NOT CONFIGURED · UNREACHABLE`. Inspect it live at `/lab/models` or `GET /api/integrations?live=1`.

## Quickstart

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

No environment variables are required. TerraLens boots as a fully local, offline-first companion; every integration turns on only when its configuration is present **and** a live health check passes. To light any of them up, copy `.env.example` to `.env.local` and fill in what you have.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Next.js dev server |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm format` / `pnpm format:check` | Prettier write / check |
| `pnpm test` | Vitest unit + integration suites |
| `pnpm test:e2e` | Playwright E2E (starts its own dev server on :3100) |
| `pnpm temporal:worker` | Temporal worker (`workers/temporal`) |
| `pnpm prediction:serve` / `pnpm prediction:train` | TabPFN prediction service |
| `pnpm tinker:prepare` / `pnpm tinker:evaluate` | Tinker dataset prep / evaluation |

CI runs format check, typecheck, lint, unit tests, a production build, and the Playwright suite — see [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Where things live

```
src/app/            routes — (site) marketing + lab, (shell) the app, /onboarding, /pocket/[id], /offline
src/app/api/        server routes: analyze, voice, sync, field-agent, prediction, memory, knowledge, …
src/lib/            the engines — scoring, missions, curiosity, safety, ai, sync, media, telemetry
src/features/       expedition UI (capture sheet, mission cards, score summary, field-agent recap)
services/           prediction (TabPFN boundary) + knowledge (Tiger Data schema & seed)
workers/temporal/   durable workflow worker
ai/tinker/          fine-tuning workspace, dataset prep, evaluation
tests/              integration + Playwright E2E
```

Key routes: `/` landing · `/home` today · `/journal` · `/score` · `/settings` · `/demo` guided tour · `/judge` ten checks · `/lab/*` model lab & architecture · `/open` · `/privacy` · `/about`.

## Privacy, concretely

Your notes, photos, and scores live in the browser's IndexedDB. The server is a copy you opt into, never the source. `LOCAL ONLY` makes the device boundary absolute. Photos are stripped of EXIF/GPS at capture, the analysis pipeline is text-only for server calls, and every telemetry field is whitelisted in `src/lib/telemetry/redact.ts`. The specifics are on `/privacy`.

## Deployment

[`render.yaml`](render.yaml) is a complete Render Blueprint: the Next.js app, the TabPFN prediction service, and the Temporal worker — with every secret marked `sync: false` so it's set once in the dashboard and never committed.

## License

MIT — see [LICENSE](LICENSE).
