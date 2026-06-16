import { expect, type Page, test } from "@playwright/test";

const HOST = "#mount mining-lib-diagram";
const SVG = `${HOST} svg.mining-lib-svg`;
const FILTERS_PANEL = `${HOST} .mining-lib-filters-panel`;
const FILTERS_TRIGGER = `${HOST} button[data-popover="filters"]`;
const SELECTION_PILL = `${HOST} .mining-lib-pill-selection`;

// Phase 22c: rails retired — the Filters panel lives inside the
// ▾ Filters popover at every width. Tests that read chip state need
// the popover open. Helper opens it idempotently.
async function openFiltersPopover(page: Page): Promise<void> {
  const popover = page.locator(`${HOST} .mining-lib-popover .mining-lib-filters-panel`);
  if ((await popover.count()) > 0) return;
  await page.locator(FILTERS_TRIGGER).click();
  await popover.waitFor({ state: "visible" });
}

type FilterClause =
  | { kind: "variant"; sequences: string[] }
  | { kind: "branch"; edge: [string, string] }
  | { kind: "node"; activity: string };

async function getFilters(page: Page): Promise<FilterClause[]> {
  return page.evaluate(() => {
    const handle = (window as unknown as { __diagram: { getFilters(): FilterClause[] } }).__diagram;
    return handle.getFilters();
  });
}

async function selectNode(page: Page, id: string): Promise<void> {
  await page.evaluate((nodeId: string) => {
    (
      window as unknown as {
        __diagram: { select(t: { kind: "node"; id: string }): void };
      }
    ).__diagram.select({ kind: "node", id: nodeId });
  }, id);
}

async function selectEdge(page: Page, id: string): Promise<void> {
  await page.evaluate((edgeId: string) => {
    (
      window as unknown as {
        __diagram: { select(t: { kind: "edge"; id: string }): void };
      }
    ).__diagram.select({ kind: "edge", id: edgeId });
  }, id);
}

test("Scenario 1 — click a node → pill → Filter to cases through this → chip appears", async ({
  page,
}) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  await selectNode(page, "review_in_progress");
  await expect(page.locator(SELECTION_PILL)).toBeVisible();
  await page.locator(`${SELECTION_PILL} .mining-lib-pill-filter`).click();

  // Pill un-mounts; chip lands in Active section of Filters panel
  // (which lives in the stash until the user opens the popover).
  await expect(page.locator(SELECTION_PILL)).toHaveCount(0);
  await openFiltersPopover(page);
  const chip = page.locator(`${FILTERS_PANEL} .mining-lib-filters-chip[data-kind="node"]`);
  await expect(chip).toHaveCount(1);
  await expect(chip.locator(".mining-lib-filters-chip-label")).toHaveText("At review_in_progress");
  await expect(page.locator(`${FILTERS_PANEL} .mining-lib-filters-active`)).toBeVisible();
  await expect(page.locator(`${FILTERS_PANEL} .mining-lib-clear-all`)).toBeVisible();
});

test("Scenario 2 — compose two clauses; chip × removes one", async ({ page }) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  await selectEdge(page, "submitted→intake_validation");
  await page.locator(`${SELECTION_PILL} .mining-lib-pill-filter`).click();
  await selectNode(page, "review_in_progress");
  await page.locator(`${SELECTION_PILL} .mining-lib-pill-filter`).click();

  // Two non-variant chips inside the Filters popover. Open it first.
  await openFiltersPopover(page);
  await expect(page.locator(`${FILTERS_PANEL} .mining-lib-filters-chip`)).toHaveCount(2);
  const beforeNonVariant = (await getFilters(page)).filter((c) => c.kind !== "variant");
  expect(beforeNonVariant).toHaveLength(2);

  await page
    .locator(
      `${FILTERS_PANEL} .mining-lib-filters-chip[data-kind="branch"] .mining-lib-filters-chip-x`,
    )
    .click();
  const afterNonVariant = (await getFilters(page)).filter((c) => c.kind !== "variant");
  expect(afterNonVariant).toEqual([{ kind: "node", activity: "review_in_progress" }]);
});

test("Scenario 3 — Clear all wipes non-variant chips, leaves variant ticks alone", async ({
  page,
}) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  await page.evaluate(() => {
    (
      window as unknown as {
        __diagram: {
          setFilters(c: FilterClause[]): void;
          getFilters(): FilterClause[];
          getVariants(): { sequence: string[] }[];
        };
      }
    ).__diagram.setFilters([
      { kind: "branch", edge: ["a", "b"] },
      { kind: "node", activity: "review_in_progress" },
    ]);
  });
  await openFiltersPopover(page);
  await expect(page.locator(`${FILTERS_PANEL} .mining-lib-filters-chip`)).toHaveCount(2);

  await page.locator(`${FILTERS_PANEL} .mining-lib-clear-all`).click();
  // Variant clause auto-applied (top-K) on n1000 survives; non-variant chips gone.
  const after = await getFilters(page);
  expect(after.every((c) => c.kind === "variant")).toBe(true);
  await expect(page.locator(`${FILTERS_PANEL} .mining-lib-filters-chip`)).toHaveCount(0);
});

test("Scenario 5 — Filters popover width is stable when an attribute filter adds a chip", async ({
  page,
}) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  await openFiltersPopover(page);
  const popover = page.locator(`${HOST} .mining-lib-popover:has(.mining-lib-filters-panel)`);
  await expect(popover).toBeVisible();

  // Width with no active filters (the Active chip row is hidden).
  const before = await popover.boundingBox();
  if (!before) throw new Error("expected popover bounding box");

  // Check the first case-attribute value → an attribute chip appears in the
  // Active row at the top of the panel (this is the "tag" that used to resize
  // the menu).
  await page
    .locator(`${FILTERS_PANEL} .mining-lib-attr-row input[type="checkbox"]`)
    .first()
    .check();
  await expect(
    page.locator(`${FILTERS_PANEL} .mining-lib-filters-chip[data-kind="attribute"]`),
  ).toHaveCount(1);

  // The menu width must not change when the chip row appears.
  const after = await popover.boundingBox();
  if (!after) throw new Error("expected popover bounding box");
  expect(Math.round(after.width)).toBe(Math.round(before.width));
});

test("Scenario 4 — repeat click on the same edge does not duplicate the chip", async ({ page }) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  // First click-to-filter.
  await selectEdge(page, "submitted→intake_validation");
  await page.locator(`${SELECTION_PILL} .mining-lib-pill-filter`).click();

  // Second click-to-filter on the same edge.
  await selectEdge(page, "submitted→intake_validation");
  await page.locator(`${SELECTION_PILL} .mining-lib-pill-filter`).click();

  await expect(
    page.locator(`${FILTERS_PANEL} .mining-lib-filters-chip[data-kind="branch"]`),
  ).toHaveCount(1);
});
