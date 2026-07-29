import { defineConfig, devices } from "@playwright/test";

const baseUrl = "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.visual.ts",
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
    deviceScaleFactor: 1,
    locale: "en-US",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 1920, height: 1080 },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5173",
    url: baseUrl,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
