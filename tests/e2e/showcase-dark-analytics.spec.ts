import { expect, test } from "@playwright/test";
import {
  expectDiagramFitsHost,
  expectNoHorizontalOverflow,
  gotoShowcase,
} from "./showcase-helpers.js";

test("Showcase · dark-analytics applies linear preset on a dark host", async ({ page }) => {
  await gotoShowcase(page, "dark-analytics");

  await expectDiagramFitsHost(page, ".tile.diagram");
  await expectNoHorizontalOverflow(page);

  // preset="linear" reflected on the custom element.
  const el = page.locator("mining-lib-diagram").first();
  await expect(el).toHaveAttribute("preset", "linear");
  await expect(el).toHaveAttribute("theme", "dark");

  // Host page background is dark — sanity check that we are looking at
  // the dark-host page and not a misnamed file.
  const bg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
  // Expect "rgb(...)" with each component well below 60.
  const match = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) throw new Error(`unexpected background: ${bg}`);
  for (let i = 1; i <= 3; i++) {
    expect(Number(match[i])).toBeLessThan(60);
  }
});

test("Showcase · dark-analytics opens in Mean-time mode with terminal-duration labels", async ({
  page,
}) => {
  await gotoShowcase(page, "dark-analytics");

  // Phase 36 curation (S2): the page calls `setCountMode("meanDuration")`
  // after mount. The SVG's data-count-mode reflects the active mode, and
  // Phase 23's terminal-node secondary label group renders in time modes.
  const diagram = page.locator("mining-lib-diagram").first();
  await expect(diagram.locator("svg.mining-lib-svg")).toHaveAttribute(
    "data-count-mode",
    "meanDuration",
  );
  await expect(diagram.locator("g.mining-lib-node-terminal").first()).toBeVisible();
});
