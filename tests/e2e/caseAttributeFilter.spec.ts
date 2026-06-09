import { expect, type Page, test } from "@playwright/test";

const HOST = "#mount mining-lib-diagram";
const SVG = `${HOST} svg.mining-lib-svg`;
const FILTERS_PANEL = `${HOST} .mining-lib-filters-panel`;
const FILTERS_TRIGGER = `${HOST} button[data-popover="filters"]`;
const SELECTION_PILL = `${HOST} .mining-lib-pill-selection`;

async function openFiltersPopover(page: Page): Promise<void> {
  const popover = page.locator(`${HOST} .mining-lib-popover .mining-lib-filters-panel`);
  if ((await popover.count()) > 0) return;
  await page.locator(FILTERS_TRIGGER).click();
  await popover.waitFor({ state: "visible" });
}

type AttributeValue = string | number | boolean | null;
type FilterClause =
  | { kind: "variant"; sequences: string[] }
  | { kind: "branch"; edge: [string, string] }
  | { kind: "node"; activity: string }
  | { kind: "resourceAt"; activity: string; resources: string[] }
  | { kind: "attribute"; attribute: string; values: AttributeValue[] };

async function getFilters(page: Page): Promise<FilterClause[]> {
  return page.evaluate(() => {
    const handle = (window as unknown as { __diagram: { getFilters(): FilterClause[] } }).__diagram;
    return handle.getFilters();
  });
}

async function setFilters(page: Page, clauses: FilterClause[]): Promise<void> {
  await page.evaluate((cl) => {
    (
      window as unknown as { __diagram: { setFilters(c: FilterClause[]): void } }
    ).__diagram.setFilters(cl);
  }, clauses);
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

test("Scenario 1 — panel sections render for n1000 with expected rows + counts", async ({
  page,
}) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  // Clear the default top-K variant filter so the per-row counts
  // reflect the unfiltered log (Decision D6: dynamic counts).
  await setFilters(page, []);
  await openFiltersPopover(page);

  const sections = page.locator(`${FILTERS_PANEL} details.mining-lib-attr-section`);
  await expect(sections).toHaveCount(2);
  // Schema order: applicant_type first, priority second.
  await expect(sections.first()).toHaveAttribute("data-attribute", "case:applicant_type");
  await expect(sections.nth(1)).toHaveAttribute("data-attribute", "case:priority");

  // Priority rows: low/normal/high with the full unfiltered counts.
  const prioritySection = sections.nth(1);
  const priorityRows = prioritySection.locator(".mining-lib-attr-row");
  await expect(priorityRows).toHaveCount(3);
  const values: Record<string, string | null> = {};
  const valueLabels = await prioritySection.locator(".mining-lib-attr-value").allTextContents();
  const counts = await prioritySection.locator(".mining-lib-attr-count").allTextContents();
  for (let i = 0; i < valueLabels.length; i++) {
    values[valueLabels[i] as string] = counts[i] ?? null;
  }
  expect(values).toEqual({ normal: "597", high: "219", low: "184" });
});

test("Scenario 2 — tick `Priority → high` → chip appears + diagram filters", async ({ page }) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  await openFiltersPopover(page);

  // Find the `high` checkbox inside the Priority section.
  const prioritySection = page.locator(
    `${FILTERS_PANEL} details.mining-lib-attr-section[data-attribute='case:priority']`,
  );
  const highRow = prioritySection
    .locator(".mining-lib-attr-row")
    .filter({ has: page.locator(".mining-lib-attr-value", { hasText: /^high$/ }) });
  await highRow.locator("input[type='checkbox']").check();

  // Chip lands in Active row.
  const chip = page.locator(`${FILTERS_PANEL} .mining-lib-filters-chip[data-kind='attribute']`);
  await expect(chip).toHaveCount(1);
  await expect(chip.locator(".mining-lib-filters-chip-label")).toHaveText("Priority: high");

  // Programmatic verify of the clause.
  expect(await getFilters(page)).toContainEqual({
    kind: "attribute",
    attribute: "case:priority",
    values: ["high"],
  });
});

test("Scenario 3 — multi-value within attribute (OR within clause)", async ({ page }) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  await setFilters(page, [
    { kind: "attribute", attribute: "case:priority", values: ["high", "low"] },
  ]);
  await openFiltersPopover(page);

  const chip = page.locator(`${FILTERS_PANEL} .mining-lib-filters-chip[data-kind='attribute']`);
  await expect(chip.locator(".mining-lib-filters-chip-label")).toHaveText("Priority: high, low");

  // Counts: high stays at 219 (full), low stays at 184 (full); normal drops to 0.
  const prioritySection = page.locator(
    `${FILTERS_PANEL} details.mining-lib-attr-section[data-attribute='case:priority']`,
  );
  const normalRow = prioritySection
    .locator(".mining-lib-attr-row")
    .filter({ has: page.locator(".mining-lib-attr-value", { hasText: /^normal$/ }) });
  await expect(normalRow.locator(".mining-lib-attr-count")).toHaveText("0");
});

test("Scenario 4 — AND across attributes (priority + applicant_type)", async ({ page }) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  await setFilters(page, [
    { kind: "attribute", attribute: "case:priority", values: ["high"] },
    { kind: "attribute", attribute: "case:applicant_type", values: ["renewal"] },
  ]);
  await openFiltersPopover(page);

  // Two chips.
  const chips = page.locator(`${FILTERS_PANEL} .mining-lib-filters-chip[data-kind='attribute']`);
  await expect(chips).toHaveCount(2);
});

test("Scenario 5 — chip × removes the entire attribute clause", async ({ page }) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  await setFilters(page, [
    { kind: "attribute", attribute: "case:priority", values: ["high", "low"] },
    { kind: "attribute", attribute: "case:applicant_type", values: ["renewal"] },
  ]);
  await openFiltersPopover(page);

  // Click × on the priority chip.
  await page
    .locator(
      `${FILTERS_PANEL} .mining-lib-filters-chip[data-kind='attribute'][data-attribute='case:priority'] .mining-lib-filters-chip-x`,
    )
    .click();

  // Priority chip gone; applicant_type chip remains.
  const remaining = await getFilters(page);
  const attrs = remaining.filter((c) => c.kind === "attribute");
  expect(attrs).toEqual([
    { kind: "attribute", attribute: "case:applicant_type", values: ["renewal"] },
  ]);

  // Priority section checkboxes all unchecked now.
  const prioritySection = page.locator(
    `${FILTERS_PANEL} details.mining-lib-attr-section[data-attribute='case:priority']`,
  );
  const checked = prioritySection.locator("input[type='checkbox']:checked");
  await expect(checked).toHaveCount(0);
});

test("Scenario 6 — selection-pill Attributes block toggles a clause", async ({ page }) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  // Clear default top-K filter so we have a clean slate.
  await setFilters(page, []);
  await selectNode(page, "review_in_progress");
  await expect(page.locator(SELECTION_PILL)).toBeVisible();
  await expect(page.locator(`${SELECTION_PILL} .mining-lib-pill-attrs`)).toBeVisible();

  // Click the Priority → high toggle row inside the pill.
  const highRow = page
    .locator(`${SELECTION_PILL} .mining-lib-pill-attr-row`)
    .filter({ has: page.locator(".mining-lib-pill-attr-value", { hasText: /^high$/ }) });
  await highRow.click();

  // After click, selection clears → pill un-mounts; chip appears in panel.
  const filters = await getFilters(page);
  const attrs = filters.filter((c) => c.kind === "attribute");
  expect(attrs).toContainEqual({
    kind: "attribute",
    attribute: "case:priority",
    values: ["high"],
  });
});

test("Scenario 7 — programmatic setFilters API parity (defensive copy on getFilters)", async ({
  page,
}) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  await setFilters(page, [{ kind: "attribute", attribute: "case:priority", values: ["high"] }]);

  await openFiltersPopover(page);
  // The popover mount is visible, but the Filters panel's
  // attribute sections re-render asynchronously after the
  // `setFilters` call above commits state. Wait for the specific
  // `case:priority` section to land inside the popover before
  // asserting on its child checkbox — otherwise the assertion
  // races the panel-rebuild under parallel workers.
  await page
    .locator(`${FILTERS_PANEL} details.mining-lib-attr-section[data-attribute='case:priority']`)
    .waitFor({ state: "visible" });
  const checked = page.locator(
    `${FILTERS_PANEL} details.mining-lib-attr-section[data-attribute='case:priority'] input[type='checkbox']:checked`,
  );
  await expect(checked).toHaveCount(1);

  // Mutating the array returned by getFilters does not affect internal state.
  const mutation = await page.evaluate(() => {
    const handle = (
      window as unknown as {
        __diagram: {
          getFilters(): FilterClause[];
          setFilters(c: FilterClause[]): void;
        };
      }
    ).__diagram;
    const got = handle.getFilters();
    const attr = got.find((c) => c.kind === "attribute") as Extract<
      FilterClause,
      { kind: "attribute" }
    >;
    attr.values.push("low");
    const again = handle.getFilters();
    const attrAgain = again.find((c) => c.kind === "attribute") as Extract<
      FilterClause,
      { kind: "attribute" }
    >;
    return attrAgain.values;
  });
  expect(mutation).toEqual(["high"]);
});

test("Scenario 8 — mono-value column auto-hidden", async ({ page }) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  // Synthesise a tiny log whose only case attribute is constant
  // (`case:tenant=acme`) and re-render with it. The Filters panel
  // must NOT show a `Tenant` section.
  await page.evaluate(() => {
    const csv = [
      "case:concept:name,concept:name,time:timestamp,org:resource,lifecycle:transition,case:tenant",
      "c1,a,2024-01-01 00:00:00+00:00,,complete,acme",
      "c1,b,2024-01-01 00:01:00+00:00,,complete,acme",
      "c2,a,2024-01-01 00:00:00+00:00,,complete,acme",
      "c2,b,2024-01-01 00:01:00+00:00,,complete,acme",
    ].join("\n");
    const MiningLib = (
      window as unknown as {
        MiningLib: {
          parseCsv(t: string): { log: unknown };
          buildDfg(l: unknown): unknown;
        };
      }
    ).MiningLib;
    const { log } = MiningLib.parseCsv(csv);
    const dfg = MiningLib.buildDfg(log);
    (
      window as unknown as {
        __diagram: { render(d: unknown, l: unknown): void };
      }
    ).__diagram.render(dfg, log);
  });

  await openFiltersPopover(page);
  // Only `case:tenant` exists, and it's mono-value → 0 sections.
  await expect(page.locator(`${FILTERS_PANEL} details.mining-lib-attr-section`)).toHaveCount(0);
});
