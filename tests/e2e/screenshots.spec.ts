import { expect, test } from "@playwright/test";

/**
 * Phase 36 — generates the showcase screenshot matrix into
 * `docs/screenshots/`. README + showcase-index reference these PNGs
 * by relative path. The spec also doubles as a functional gate:
 * each page must render at least one DFG node group, otherwise
 * the screenshot is meaningless.
 *
 * Phase 38 will adopt the same files as `toHaveScreenshot` baselines
 * for visual regression — laid down here, the matrix is ready.
 *
 * The render-gate assertion is the real test; the screenshot is a
 * side-effect that writes to disk. Local devs rerun this spec to
 * refresh the committed PNGs before commits.
 */

const SHOWCASE_PAGES = [
  { slug: "admin-saas", viewport: { width: 1280, height: 800 } },
  { slug: "marketing-docs", viewport: { width: 1400, height: 900 } },
  // dark-analytics stacks four KPI tiles above the diagram tile, so the
  // viewport needs more vertical room than the others to capture both.
  { slug: "dark-analytics", viewport: { width: 1280, height: 1180 } },
  { slug: "team-wiki", viewport: { width: 1280, height: 1100 } },
  { slug: "mobile-case", viewport: { width: 360, height: 640 } },
] as const;

for (const { slug, viewport } of SHOWCASE_PAGES) {
  test(`Screenshot · ${slug} renders, emits docs/screenshots/${slug}.png`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(`/showcase/${slug}.built.html`);

    const nodes = page.locator("mining-lib-diagram g.mining-lib-node");
    await expect(nodes.first()).toBeVisible();
    const count = await nodes.count();
    expect(count).toBeGreaterThanOrEqual(1);

    await page.screenshot({
      path: `docs/screenshots/${slug}.png`,
      animations: "disabled",
    });
  });
}

test("Screenshot · index renders 5 thumbnails, emits docs/screenshots/index.png", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/showcase/index.built.html");

  // Five thumbnail cards, each with its own mining-lib-diagram. Wait for
  // the cumulative node count to settle at ≥5 (one node per thumbnail
  // minimum — the loan-origination graph has 13 activities, so the real
  // count is ~65).
  const nodes = page.locator("mining-lib-diagram g.mining-lib-node");
  await expect(nodes.first()).toBeVisible();
  await expect.poll(async () => nodes.count(), { timeout: 5_000 }).toBeGreaterThanOrEqual(5);

  await page.screenshot({
    path: "docs/screenshots/index.png",
    animations: "disabled",
  });
});
