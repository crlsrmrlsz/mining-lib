import { expect, type Page, test } from "@playwright/test";

const HOST = "#mount mining-lib-diagram";
const SVG = `${HOST} svg.mining-lib-svg`;
const FILTERS_PANEL = `${HOST} .mining-lib-filters-panel`;
const SELECTION_PILL = `${HOST} .mining-lib-pill-selection`;
const RESOURCE_BLOCK = `${SELECTION_PILL} .mining-lib-resource-block`;

type FilterClause =
  | { kind: "variant"; sequences: string[] }
  | { kind: "branch"; edge: [string, string] }
  | { kind: "node"; activity: string }
  | { kind: "resourceAt"; activity: string; resources: string[] };

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

async function getFilters(page: Page): Promise<FilterClause[]> {
  return page.evaluate(() => {
    const handle = (window as unknown as { __diagram: { getFilters(): FilterClause[] } }).__diagram;
    return handle.getFilters();
  });
}

test("Scenario 1 — node selection on a log with resources shows the breakdown", async ({
  page,
}) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  await selectNode(page, "intake_validation");
  await expect(page.locator(SELECTION_PILL)).toBeVisible();
  await expect(page.locator(RESOURCE_BLOCK)).toBeVisible();
  await expect(page.locator(`${RESOURCE_BLOCK} .mining-lib-resource-header`)).toHaveText(
    "Resources",
  );
  // Top-5 list + optional `+N others`.
  const rows = page.locator(`${RESOURCE_BLOCK} .mining-lib-resource-row`);
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(6);
});

test("Scenario 2 — unassigned-only node (e.g. submitted) shows one (unassigned) row", async ({
  page,
}) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  await selectNode(page, "submitted");
  await expect(page.locator(RESOURCE_BLOCK)).toBeVisible();
  const rows = page.locator(`${RESOURCE_BLOCK} .mining-lib-resource-row`);
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator(".resource-label")).toHaveText("(unassigned)");
  await expect(
    page.locator(`${RESOURCE_BLOCK} .mining-lib-resource-bar-segment-unassigned`),
  ).toHaveCount(1);
});

test("Scenario 3 — clicking a row toggles a resourceAt clause + the DFG re-renders", async ({
  page,
}) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  // The Filters panel must NOT contain a Resource section (deleted in
  // this rework).
  await expect(page.locator(`${FILTERS_PANEL} details.mining-lib-filters-resource`)).toHaveCount(0);

  await selectNode(page, "intake_validation");
  const buttons = page.locator(`${RESOURCE_BLOCK} .mining-lib-resource-row-btn`);
  const buttonCount = await buttons.count();
  expect(buttonCount).toBeGreaterThan(0);

  // Click the first resource row → creates a resourceAt clause for
  // this activity with one resource.
  await buttons.nth(0).click();

  const after = await getFilters(page);
  const clause = after.find(
    (c): c is { kind: "resourceAt"; activity: string; resources: string[] } =>
      c.kind === "resourceAt",
  );
  expect(clause).toBeDefined();
  expect(clause?.activity).toBe("intake_validation");
  expect(clause?.resources).toHaveLength(1);

  // A chip lands in the Active row.
  const chip = page.locator(`${FILTERS_PANEL} .mining-lib-filters-chip[data-kind="resourceAt"]`);
  await expect(chip).toHaveCount(1);
  await expect(chip.locator(".mining-lib-filters-chip-label")).toContainText(
    "at intake_validation",
  );

  // The toggled row reports aria-pressed=true.
  await expect(buttons.nth(0)).toHaveAttribute("aria-pressed", "true");
});

test("Scenario 4 — clicking the same row a second time toggles the resource off", async ({
  page,
}) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  await selectNode(page, "intake_validation");
  const firstBtn = page.locator(`${RESOURCE_BLOCK} .mining-lib-resource-row-btn`).first();
  await firstBtn.click();
  await expect(firstBtn).toHaveAttribute("aria-pressed", "true");

  await firstBtn.click();
  await expect(firstBtn).toHaveAttribute("aria-pressed", "false");
  // The clause should be stripped (resources became empty).
  const after = await getFilters(page);
  expect(after.some((c) => c.kind === "resourceAt")).toBe(false);
  await expect(
    page.locator(`${FILTERS_PANEL} .mining-lib-filters-chip[data-kind="resourceAt"]`),
  ).toHaveCount(0);
});

test("Scenario 5 — clicking two resources on the same node extends the clause (OR within activity)", async ({
  page,
}) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  await selectNode(page, "intake_validation");
  const buttons = page.locator(`${RESOURCE_BLOCK} .mining-lib-resource-row-btn`);
  await buttons.nth(0).click();
  await buttons.nth(1).click();

  const after = await getFilters(page);
  const clauses = after.filter((c) => c.kind === "resourceAt");
  expect(clauses).toHaveLength(1);
  const clause = clauses[0] as { kind: "resourceAt"; activity: string; resources: string[] };
  expect(clause.resources).toHaveLength(2);
  // Chip shows the "+ N" tail format.
  await expect(
    page.locator(
      `${FILTERS_PANEL} .mining-lib-filters-chip[data-kind="resourceAt"] .mining-lib-filters-chip-label`,
    ),
  ).toContainText("+ 1 at intake_validation");
});

test("Scenario 6 — chip × removes the resourceAt clause; rows revert to inactive", async ({
  page,
}) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  await page.evaluate(() => {
    (
      window as unknown as {
        __diagram: { setFilters(cs: FilterClause[]): void };
      }
    ).__diagram.setFilters([
      { kind: "resourceAt", activity: "intake_validation", resources: ["clerk_002"] },
    ]);
  });

  await selectNode(page, "intake_validation");
  // Phase 22c: Filters panel lives in the ▾ Filters popover at every
  // width; open it to access the chip.
  await page.locator('#mount mining-lib-diagram button[data-popover="filters"]').click();
  const chip = page.locator(`${FILTERS_PANEL} .mining-lib-filters-chip[data-kind="resourceAt"]`);
  await expect(chip).toHaveCount(1);

  await chip.locator(".mining-lib-filters-chip-x").click();
  await expect(chip).toHaveCount(0);

  const after = await getFilters(page);
  expect(after.some((c) => c.kind === "resourceAt")).toBe(false);
});

test("Scenario 7 — no-resource log: pill has no breakdown block at all", async ({ page }) => {
  await page.goto("/control-bar.built.html?fixture=n5-fixture&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  await page.evaluate(async () => {
    const win = window as unknown as {
      __diagram: { render(dfg: unknown, log: unknown): void };
      MiningLib: {
        parseCsv(text: string): {
          log: {
            cases: Map<string, { id: string; events: unknown[]; attributes: unknown }>;
            events: { resource: string | null }[];
            schema: unknown;
          };
        };
        buildDfg(log: unknown): unknown;
      };
    };
    const response = await fetch("/runs/n5-fixture/events.csv");
    const text = await response.text();
    const { log } = win.MiningLib.parseCsv(text);
    for (const ev of log.events) ev.resource = null;
    const dfg = win.MiningLib.buildDfg(log);
    win.__diagram.render(dfg, log);
  });

  await selectNode(page, "intake_validation");
  await expect(page.locator(SELECTION_PILL)).toBeVisible();
  await expect(page.locator(RESOURCE_BLOCK)).toHaveCount(0);
});

test("Scenario 8 — edge selection never renders the breakdown", async ({ page }) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  await selectEdge(page, "submitted→intake_validation");
  await expect(page.locator(SELECTION_PILL)).toBeVisible();
  await expect(page.locator(RESOURCE_BLOCK)).toHaveCount(0);
  await expect(page.locator(`${SELECTION_PILL} .mining-lib-pill-separator`)).toHaveCount(0);
});
