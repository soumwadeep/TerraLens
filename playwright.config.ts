import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against the real app — no mocked backends, no stubbed AI. The dev server
 * is used so `pnpm test:e2e` works on a fresh clone without a production build
 * first; CI runs `pnpm build` as its own gate in the same workflow.
 *
 * The service worker only registers in production builds, so dev-mode tests
 * never race a caching worker.
 */
const PORT = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"], ["html", { open: "never" }]] : [["list"]],
  // Generous ceiling: the loop test cold-compiles routes on a slow CI runner.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
