import { defineConfig, devices } from "@playwright/test";

// A port of the tests' own, held strictly and never shared: on Vite's default
// another project's dev server could answer and be the app tested.
const PORT = 5191;
const baseUrl = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.{visual,behaviour}.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.001,
      scale: "css",
      stylePath: "./tests/browser/visual.css",
      threshold: 0.1,
    },
  },
  reporter: [
    ["list"],
    ["html", { open: "never" }],
  ],
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
    viewport: { width: 1920, height: 1080 },
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: baseUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
