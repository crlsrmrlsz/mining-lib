import { defineConfig, devices } from "@playwright/test";

// Phase 39 Groups E + F. The functional/contract suite runs on Chromium +
// Firefox + WebKit (all three required-for-merge). Two specs are kept OUT of
// the functional engines:
//   - visual.spec.ts — pixel `toHaveScreenshot` regression. Per-engine font AA
//     makes FF/WebKit screenshots flaky, so it runs only in the dedicated
//     `visual` project (Chromium-in-Docker — see .github/workflows/visual.yml).
//   - screenshots.spec.ts — the on-demand docs/screenshots PNG generator (the
//     `screenshots` project); a writer, not a gate, so it never runs in CI.
const NON_FUNCTIONAL = [/visual\.spec\.ts/, /screenshots\.spec\.ts/];
const DESKTOP_VIEWPORT = { width: 1920, height: 1080 };

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // 2 workers in CI: the Group-E matrix isolates each engine in its own job, so
  // intra-job parallelism is safe (retries:2 absorbs residual flake) and ~halves
  // wall-time — WebKit (the slowest engine) overran a serial workers:1 run.
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },
  // Conservative pixel tolerance: absorbs sub-pixel AA jitter within the fixed
  // Chromium-in-Docker render environment, while still catching real drift.
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" },
  },
  projects: [
    {
      name: "chromium",
      testIgnore: NON_FUNCTIONAL,
      use: { ...devices["Desktop Chrome"], viewport: DESKTOP_VIEWPORT },
    },
    {
      name: "firefox",
      testIgnore: NON_FUNCTIONAL,
      use: { ...devices["Desktop Firefox"], viewport: DESKTOP_VIEWPORT },
    },
    {
      name: "webkit",
      testIgnore: NON_FUNCTIONAL,
      use: { ...devices["Desktop Safari"], viewport: DESKTOP_VIEWPORT },
    },
    // Pixel regression — baselines committed under tests/e2e/visual.spec.ts-snapshots/
    // and generated/refreshed ONLY inside the pinned Playwright Docker image so
    // the anti-aliasing is reproducible (see CONTRIBUTING → "Visual baselines").
    {
      name: "visual",
      testMatch: /visual\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // On-demand docs/screenshots PNG generator (README + showcase-index assets).
    // Run via `pnpm exec playwright test --project=screenshots`; never in CI.
    {
      name: "screenshots",
      testMatch: /screenshots\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm preview --port 4173 --strictPort",
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
