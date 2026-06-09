import { expect, test } from "@playwright/test";

/**
 * Phase 39 Group F — visual regression. Real `toHaveScreenshot` assertions over
 * the showcase matrix (each a distinct preset/theme/state). The successor to
 * Phase 36's `screenshots.spec.ts` PNG *writer*.
 *
 * Runs ONLY in the dedicated `visual` Playwright project (Chromium), and its
 * baselines are generated/refreshed exclusively inside the pinned Playwright
 * Docker image (`.github/workflows/visual.yml`) so anti-aliasing is
 * reproducible — per-engine/per-OS AA is why baselines are Chromium-in-Docker
 * only and never on Firefox/WebKit. The functional engines `testIgnore` this
 * file (see playwright.config.ts).
 *
 * Tolerance + masking: `maxDiffPixelRatio` (config) absorbs sub-pixel AA within
 * the fixed Docker environment. The fixtures are deterministic (seed 42), so
 * labels/durations/timestamps are stable and need no masking; add per-assert
 * `mask` here if a future state introduces a genuinely dynamic region.
 *
 * Bootstrap: a fresh checkout has no baselines, so the first run must generate
 * them in Docker (`--update-snapshots`) and commit — see CONTRIBUTING →
 * "Visual baselines". Until then this project fails with "missing snapshot",
 * which is why visual.yml is a standalone (not-yet-required) workflow.
 */

const SHOWCASE_PAGES = [
  { slug: "admin-saas", viewport: { width: 1280, height: 800 } },
  { slug: "marketing-docs", viewport: { width: 1400, height: 900 } },
  // dark-analytics stacks four KPI tiles above the diagram tile → taller viewport.
  { slug: "dark-analytics", viewport: { width: 1280, height: 1180 } },
  { slug: "team-wiki", viewport: { width: 1280, height: 1100 } },
  { slug: "mobile-case", viewport: { width: 360, height: 640 } },
] as const;

for (const { slug, viewport } of SHOWCASE_PAGES) {
  test(`visual · ${slug}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(`/showcase/${slug}.built.html`);
    await expect(page.locator("mining-lib-diagram g.mining-lib-node").first()).toBeVisible();
    await expect(page).toHaveScreenshot(`${slug}.png`, { fullPage: true });
  });
}

test("visual · index", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/showcase/index.built.html");
  const nodes = page.locator("mining-lib-diagram g.mining-lib-node");
  await expect(nodes.first()).toBeVisible();
  await expect.poll(async () => nodes.count(), { timeout: 5_000 }).toBeGreaterThanOrEqual(5);
  await expect(page).toHaveScreenshot("index.png", { fullPage: true });
});
