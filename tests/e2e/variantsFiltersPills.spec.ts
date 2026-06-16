/**
 * Phase 22 — Variants / Filters pill split + selection-pill close
 * affordance. End-state assertions: split panels, count-suffix
 * triggers, no-chip-for-variant policy, cornered ×, state survival
 * across the 480 px breakpoint.
 */

import { expect, type Page, test } from "@playwright/test";

const HOST = "#mount mining-lib-diagram";
const SVG = `${HOST} svg.mining-lib-svg`;
const PRIMARY = `${HOST} .mining-lib-pill-primary`;
const RIGHT_RAIL = `${HOST} .mining-lib-rail-right`;
const VARIANTS_PANEL = `${HOST} .mining-lib-variants-panel`;
const FILTERS_PANEL = `${HOST} .mining-lib-filters-panel`;
const SELECTION_PILL = `${HOST} .mining-lib-pill-selection`;

async function setFilters(page: Page, clauses: unknown[]): Promise<void> {
  await page.evaluate((c) => {
    (
      window as unknown as { __diagram: { setFilters(clauses: unknown[]): void } }
    ).__diagram.setFilters(c);
  }, clauses);
}

async function selectNode(page: Page, id: string): Promise<void> {
  await page.evaluate((nodeId: string) => {
    (
      window as unknown as { __diagram: { select(t: { kind: "node"; id: string }): void } }
    ).__diagram.select({ kind: "node", id: nodeId });
  }, id);
}

test("Scenario 1 — Desktop emits the 3-pill primary trio (Mode + Variants + Filters), no rail", async ({
  page,
}) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  // Phase 22c: rails retired. The wide chrome matches narrow:
  // three independent floating pills at top center, utilities top-right,
  // zoom bottom-left.
  await expect(page.locator(RIGHT_RAIL)).toHaveCount(0);
  const primary = page.locator(PRIMARY);
  await expect(primary).toBeVisible();
  await expect(primary.locator('button[data-popover="mode"]')).toBeVisible();
  await expect(primary.locator('button[data-popover="variants"]')).toBeVisible();
  await expect(primary.locator('button[data-popover="filters"]')).toBeVisible();

  // Phase 27 follow-up (2026-05-22): the Case picker was folded back
  // into the Filters popover, so the primary row is back to three
  // pills — Mode → Variants → Filters.
  const triggers = primary.locator("button[data-popover]");
  await expect(triggers).toHaveCount(3);
  const order = await triggers.evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).dataset.popover),
  );
  expect(order).toEqual(["mode", "variants", "filters"]);
});

test("Scenario 2 — ▾ Variants trigger shows `· 3/4` for a partial tick at narrow", async ({
  page,
}) => {
  await page.goto("/control-bar.built.html?w=400&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  const variantsBtn = page.locator(`${PRIMARY} button[data-popover="variants"]`);
  // n5 fixture (default for control-bar without explicit fixture) has 4 variants.
  await expect(variantsBtn).toContainText("▾ Variants");
  await expect(variantsBtn).not.toContainText("/");

  // Pick 3 of the 4 variants the diagram knows about and tick those.
  // Variant signature format is `JSON.stringify(sequence)` per `variantSignature`.
  const sigs = await page.evaluate(() => {
    const variants = (
      window as unknown as { __diagram: { getVariants(): Array<{ sequence: string[] }> } }
    ).__diagram.getVariants();
    return variants.slice(0, 3).map((v) => JSON.stringify(v.sequence));
  });
  expect(sigs).toHaveLength(3);

  await setFilters(page, [{ kind: "variant", sequences: sigs }]);
  await expect(variantsBtn).toContainText("· 3/4");
  await expect(variantsBtn.locator(".mining-lib-trigger-count")).toContainText("3/4");
});

test("Scenario 3 — ▾ Filters trigger shows `· N` after a pill push-filter", async ({ page }) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=400&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  const filtersBtn = page.locator(`${PRIMARY} button[data-popover="filters"]`);
  // No active chips — plain `▾ Filters`.
  await expect(filtersBtn).not.toContainText("/");
  await expect(filtersBtn.locator(".mining-lib-trigger-count")).toHaveAttribute("hidden", "");

  // Push one node clause programmatically (mirrors the pill action).
  await setFilters(page, [{ kind: "node", activity: "intake_validation" }]);
  await expect(filtersBtn).toContainText("· 1");
  await expect(filtersBtn.locator(".mining-lib-trigger-count")).toContainText("· 1");

  // Two clauses → "· 2".
  await setFilters(page, [
    { kind: "node", activity: "intake_validation" },
    { kind: "branch", edge: ["submitted", "intake_validation"] },
  ]);
  await expect(filtersBtn).toContainText("· 2");

  // Cleared → no suffix.
  await setFilters(page, []);
  await expect(filtersBtn.locator(".mining-lib-trigger-count")).toHaveAttribute("hidden", "");
});

test("Scenario 4 — Variant clauses do NOT chip in the Filters panel", async ({ page }) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  // A variant clause + a node clause: only the node should chip.
  await setFilters(page, [
    {
      kind: "variant",
      sequences: ["submitted,intake_validation,assigned_to_reviewer,review_in_progress,approved"],
    },
    { kind: "node", activity: "intake_validation" },
  ]);
  const chips = page.locator(`${FILTERS_PANEL} .mining-lib-filters-chip`);
  await expect(chips).toHaveCount(1);
  await expect(chips.first()).toHaveAttribute("data-kind", "node");
  // No variant-flavoured chip anywhere in the Filters panel.
  await expect(
    page.locator(`${FILTERS_PANEL} .mining-lib-filters-chip[data-kind="variant"]`),
  ).toHaveCount(0);
});

test("Scenario 5 — Selection pill × stays in the top-right corner across multi-row heights", async ({
  page,
}) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  // Single-row pill — `submitted` (every event unassigned, so a
  // single (unassigned) row inside the Resources block).
  await selectNode(page, "submitted");
  await expect(page.locator(SELECTION_PILL)).toBeVisible();
  {
    const pillBox = await page.locator(SELECTION_PILL).boundingBox();
    const closeBox = await page.locator(`${SELECTION_PILL} .mining-lib-pill-close`).boundingBox();
    if (pillBox === null || closeBox === null) throw new Error("box not measurable");
    expect(Math.abs(pillBox.x + pillBox.width - (closeBox.x + closeBox.width))).toBeLessThanOrEqual(
      12,
    );
    expect(Math.abs(closeBox.y - pillBox.y)).toBeLessThanOrEqual(12);
  }

  // Multi-row pill — `intake_validation` (multiple resources, taller pill).
  await selectNode(page, "intake_validation");
  await expect(page.locator(SELECTION_PILL)).toBeVisible();
  {
    const pillBox = await page.locator(SELECTION_PILL).boundingBox();
    const closeBox = await page.locator(`${SELECTION_PILL} .mining-lib-pill-close`).boundingBox();
    if (pillBox === null || closeBox === null) throw new Error("box not measurable");
    expect(Math.abs(pillBox.x + pillBox.width - (closeBox.x + closeBox.width))).toBeLessThanOrEqual(
      12,
    );
    expect(Math.abs(closeBox.y - pillBox.y)).toBeLessThanOrEqual(12);
    // The pill is genuinely multi-row — height should exceed a single
    // row's typical ~32 px envelope. Sanity check.
    expect(pillBox.height).toBeGreaterThan(60);
  }
});

test("Scenario 6 — Resize across the 480 px breakpoint preserves variant ticks AND active chips", async ({
  page,
}) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  // Set up state at desktop: a partial variant clause + a non-variant chip.
  // Variant signature format is `JSON.stringify(sequence)`.
  const variantSigs = await page.evaluate(() => {
    const v = (
      window as unknown as { __diagram: { getVariants(): Array<{ sequence: string[] }> } }
    ).__diagram.getVariants();
    return v.slice(0, 2).map((entry) => JSON.stringify(entry.sequence));
  });
  expect(variantSigs.length).toBeGreaterThan(0);
  await setFilters(page, [
    { kind: "variant", sequences: variantSigs },
    { kind: "node", activity: "intake_validation" },
  ]);

  // Desktop assertions: chip in rail's Filters panel, variant ticks
  // visible in rail's Variants panel.
  await expect(page.locator(`${FILTERS_PANEL} .mining-lib-filters-chip`)).toHaveCount(1);
  const tickedDesktop = await page
    .locator(`${VARIANTS_PANEL} input[type='checkbox']:checked`)
    .count();
  expect(tickedDesktop).toBe(variantSigs.length);

  // Flip to narrow.
  await page.evaluate(() => {
    (document.getElementById("mount") as HTMLElement).style.width = "400px";
  });
  await expect(page.locator(HOST)).toHaveAttribute("data-form-factor", "narrow");

  // Trigger labels reflect state.
  const variantsBtn = page.locator(`${PRIMARY} button[data-popover="variants"]`);
  const filtersBtn = page.locator(`${PRIMARY} button[data-popover="filters"]`);
  await expect(variantsBtn).toContainText("/");
  await expect(filtersBtn).toContainText("· 1");

  // Open the Variants popover; tick count survives.
  await variantsBtn.click();
  const variantsPopover = page.locator(`${HOST} .mining-lib-popover .mining-lib-variants-panel`);
  await expect(variantsPopover).toBeVisible();
  const tickedNarrow = await variantsPopover.locator("input[type='checkbox']:checked").count();
  expect(tickedNarrow).toBe(variantSigs.length);
  await page.keyboard.press("Escape");

  // Open the Filters popover; chip survives.
  await filtersBtn.click();
  await expect(page.locator(`${HOST} .mining-lib-popover .mining-lib-filters-chip`)).toHaveCount(1);
  await page.keyboard.press("Escape");

  // Flip back to desktop. Rail-mounted panels reflect state.
  await page.evaluate(() => {
    (document.getElementById("mount") as HTMLElement).style.width = "1200px";
  });
  await expect(page.locator(HOST)).toHaveAttribute("data-form-factor", "wide");
  await expect(page.locator(`${FILTERS_PANEL} .mining-lib-filters-chip`)).toHaveCount(1);
  const tickedRestored = await page
    .locator(`${VARIANTS_PANEL} input[type='checkbox']:checked`)
    .count();
  expect(tickedRestored).toBe(variantSigs.length);
});
