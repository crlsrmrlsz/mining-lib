import { expect, test } from "@playwright/test";
import {
  expectDiagramFitsHost,
  expectNoHorizontalOverflow,
  gotoShowcase,
} from "./showcase-helpers.js";

test("Showcase · admin-saas mounts inside the host card with default preset", async ({ page }) => {
  await gotoShowcase(page, "admin-saas");

  // Diagram fits inside the .host-card box.
  await expectDiagramFitsHost(page, ".host-card");

  // No horizontal overflow on the page.
  await expectNoHorizontalOverflow(page);

  // No `preset` attribute on the element → the diagram defaults to
  // the `default` preset. Asserting the absent attribute is the
  // most direct signal that we are not running linear/paper here.
  const preset = await page.locator("mining-lib-diagram").first().getAttribute("preset");
  expect(preset).toBeNull();

  // Phase 22c: unified pill chrome at every width — the primary
  // surface is the 3-pill trio at top center (Mode + Variants +
  // Filters), each its own floating envelope. Utilities pill at
  // top-right, zoom pill at bottom-left. No rail, no desktop Mode
  // pill.
  await expect(page.locator("mining-lib-diagram .mining-lib-pill-primary")).toBeVisible();
  await expect(page.locator('mining-lib-diagram button[data-popover="mode"]')).toBeVisible();
  await expect(page.locator('mining-lib-diagram button[data-popover="variants"]')).toBeVisible();
  await expect(page.locator('mining-lib-diagram button[data-popover="filters"]')).toBeVisible();
  await expect(page.locator("mining-lib-diagram .mining-lib-rail-right")).toHaveCount(0);
  await expect(page.locator("mining-lib-diagram .mining-lib-pill-zoom")).toBeVisible();

  // Phase 36: admin-saas is the neutral baseline — no curated state.
  // Other showcases pin a feature; this one proves the embedder
  // default just works.
  const diagram = page.locator("mining-lib-diagram").first();
  await expect(diagram.locator("g.mining-lib-node.mining-lib-faded")).toHaveCount(0);
  await expect(diagram.locator(".mining-lib-trace-panel")).toHaveCount(0);
  await expect(diagram.locator("svg.mining-lib-svg")).not.toHaveAttribute(
    "data-count-mode",
    "meanDuration",
  );
});
