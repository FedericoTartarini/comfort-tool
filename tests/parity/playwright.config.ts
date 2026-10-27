import { defineConfig, devices } from "@playwright/test";

// A port of this directory's own, held strictly. The root config serves the
// behaviour and visual suites; if the two shared a port, whichever started
// first would answer for both and a parity run could silently test a build it
// did not start.
const PORT = 5199;
const baseUrl = `http://127.0.0.1:${PORT}`;

/**
 * The parity suite's own config (tests/parity/README.md, "Running").
 *
 * It is deliberately separate from the root config rather than a project
 * inside it: the parity rules say to add files under `tests/parity/` only, so
 * that a sync from `rewrite/v1` never conflicts with this work, and the root
 * config is one of the files that must not change.
 *
 * Run it with:
 *   npx playwright test -c tests/parity/playwright.config.ts
 */
export default defineConfig({
  testDir: ".",
  // Parity tests end in `.parity.ts`, so they are not picked up by the root
  // config, whose `testMatch` takes `.visual.ts` and `.behaviour.ts`.
  testMatch: "**/*.parity.ts",
  // One worker, no parallelism: every test drives the same dev server, and a
  // parity failure has to be reproducible from its own output alone.
  fullyParallel: false,
  workers: 1,
  // No retries. A parity test that passes on a second attempt is reporting a
  // flake, not agreement, and a flake has to be visible.
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: baseUrl,
    browserName: "chromium",
    colorScheme: "light",
    contextOptions: { reducedMotion: "reduce" },
    deviceScaleFactor: 1,
    locale: "en-US",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: baseUrl,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
