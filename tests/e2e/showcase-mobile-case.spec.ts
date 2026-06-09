import { expect, test } from "@playwright/test";
import {
  expectDiagramFitsHost,
  expectNoHorizontalOverflow,
  gotoShowcase,
} from "./showcase-helpers.js";

test.use({ viewport: { width: 360, height: 640 } });

test("Showcase · mobile-case fits inside a 320px column at 360x640", async ({ page }) => {
  await gotoShowcase(page, "mobile-case");

  await expectDiagramFitsHost(page, ".embed-frame");
  await expectNoHorizontalOverflow(page);

  // The phone column never exceeds 320 px wide.
  const colBox = await page.locator(".phone-column").boundingBox();
  if (!colBox) throw new Error(".phone-column has no bounding box");
  expect(colBox.width).toBeLessThanOrEqual(320);

  // Default preset (no preset attribute set).
  const preset = await page.locator("mining-lib-diagram").first().getAttribute("preset");
  expect(preset).toBeNull();
});

test("Showcase · mobile-case enters narrow form factor and stacks utilities below primary", async ({
  page,
}) => {
  await gotoShowcase(page, "mobile-case");

  const diagram = page.locator("mining-lib-diagram").first();
  await expect(diagram).toHaveAttribute("data-form-factor", "narrow");

  // Phase 18 (revised): at narrow widths the floating Mode pill +
  // right tabs panel are absent — the trigger-pill primary pill
  // keeps owning the surface unchanged.
  await expect(diagram.locator(".mining-lib-pill-mode")).toHaveCount(0);
  await expect(diagram.locator(".mining-lib-rail-right")).toHaveCount(0);

  // The two top pills sit on different rows: utilities is anchored
  // bottom-right (mirroring zoom on bottom-left), primary alone at top.
  const primary = diagram.locator(".mining-lib-pill-primary");
  const utilities = diagram.locator(".mining-lib-pill-utilities");
  const zoom = diagram.locator(".mining-lib-pill-zoom");
  await expect(primary).toBeVisible();
  await expect(utilities).toBeVisible();
  await expect(zoom).toBeVisible();

  const primaryBox = await primary.boundingBox();
  const utilitiesBox = await utilities.boundingBox();
  const zoomBox = await zoom.boundingBox();
  if (!primaryBox || !utilitiesBox || !zoomBox) {
    throw new Error("pill bounding box unmeasurable");
  }
  // Utilities lives below primary (no top-row collision).
  expect(utilitiesBox.y).toBeGreaterThan(primaryBox.y + primaryBox.height);
  // Utilities and zoom share the bottom row (within a few pixels).
  expect(Math.abs(utilitiesBox.y - zoomBox.y)).toBeLessThan(8);
});

test("Showcase · mobile-case primary pill carries three category triggers (Mode + Variants + Filters)", async ({
  page,
}) => {
  await gotoShowcase(page, "mobile-case");

  const diagram = page.locator("mining-lib-diagram").first();
  const modeBtn = diagram.locator('button[data-popover="mode"]');
  const variantsBtn = diagram.locator('button[data-popover="variants"]');
  const filtersBtn = diagram.locator('button[data-popover="filters"]');

  // Phase 27 follow-up (2026-05-22): primary pill carries three
  // triggers — Mode (icon), Variants (text), Filters (text). The
  // case picker lives inside the Filters popover as a section.
  await expect(diagram.locator(".mining-lib-pill-primary .mining-lib-pill-chip")).toHaveCount(0);
  await expect(modeBtn).toBeVisible();
  await expect(modeBtn).toHaveAttribute("data-icon", "sigma");
  await expect(variantsBtn).toBeVisible();
  await expect(variantsBtn).toBeEnabled();
  await expect(filtersBtn).toBeVisible();
  await expect(filtersBtn).toBeEnabled();

  // Tap ▾ Mode — popover splits into Count (4 chips) + Time (2 chips)
  // sub-sections (Phase 17). Both sections share the popover-chips row.
  await modeBtn.click();
  const modePopover = diagram.locator(".mining-lib-popover");
  await expect(modePopover).toBeVisible();
  await expect(modePopover.locator(".mining-lib-mode-section")).toHaveCount(2);
  await expect(
    modePopover.locator('.mining-lib-mode-section[data-section="count"] .mining-lib-pill-chip'),
  ).toHaveCount(4);
  await expect(
    modePopover.locator('.mining-lib-mode-section[data-section="time"] .mining-lib-pill-chip'),
  ).toHaveCount(2);
  await expect(modePopover.locator(".mining-lib-pill-chip[aria-pressed='true']")).toHaveText("Abs");

  // Tap "Case" — count mode flips and the popover dismisses.
  await modePopover.locator(".mining-lib-pill-chip", { hasText: "Case" }).click();
  await expect(modePopover).toHaveCount(0);
  await expect(diagram.locator(".mining-lib-svg")).toHaveAttribute("data-count-mode", "case");
  // Mode trigger icon still sigma (Count family covers Case).
  await expect(modeBtn).toHaveAttribute("data-icon", "sigma");

  // Phase 22: tap ▾ Variants → its own popover with the variant list;
  // tap ▾ Filters → its own popover with the slim Filters panel.
  await variantsBtn.click();
  await expect(diagram.locator(".mining-lib-popover .mining-lib-variants-panel")).toBeVisible();
  await expect(
    diagram.locator(".mining-lib-popover .mining-lib-variants-panel .mining-lib-panel-bulk"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await filtersBtn.click();
  await expect(diagram.locator(".mining-lib-popover .mining-lib-filters-panel")).toBeVisible();
  await expect(diagram.locator(".mining-lib-popover .mining-lib-variants-panel")).toHaveCount(0);
});

test("Showcase · mobile-case opens with one loan_amount_band attribute filter active", async ({
  page,
}) => {
  await gotoShowcase(page, "mobile-case");

  // Phase 36 curation (S4): the page calls `setFilters([attribute-clause])`
  // for `over_750k`. The `▾ Filters` trigger's count-suffix span becomes
  // visible and reads " · 1".
  const diagram = page.locator("mining-lib-diagram").first();
  const filtersCount = diagram.locator('button[data-popover="filters"] .mining-lib-trigger-count');
  await expect(filtersCount).toBeVisible();
  await expect(filtersCount).toHaveText(/·\s*1/);
});
