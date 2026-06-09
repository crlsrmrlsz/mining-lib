import { expect, type Page, test } from "@playwright/test";

const HOST = "#mount mining-lib-diagram";
const SVG = `${HOST} svg.mining-lib-svg`;
const FILTERS_TRIGGER = `${HOST} button[data-popover="filters"]`;
const FILTERS_PANEL = `${HOST} .mining-lib-popover .mining-lib-filters-panel`;
const CASE_SECTION = `${FILTERS_PANEL} details.mining-lib-case-section`;
const CASE_INPUT = `${CASE_SECTION} input.mining-lib-case-input`;
const TRACE_PANEL = `${HOST} .mining-lib-trace-panel`;
const TRACE_ROW = `${TRACE_PANEL} .mining-lib-trace-row`;

type AttributeValue = string | number | boolean | null;
type FilterClause =
  | { kind: "variant"; sequences: string[] }
  | { kind: "branch"; edge: [string, string] }
  | { kind: "node"; activity: string }
  | { kind: "resourceAt"; activity: string; resources: string[] }
  | { kind: "attribute"; attribute: string; values: AttributeValue[] }
  | { kind: "date"; from: string | null; to: string | null; anchor: "started" | "ended" }
  | { kind: "caseId"; caseIds: string[] };

async function openFiltersPopover(page: Page): Promise<void> {
  const popover = page.locator(FILTERS_PANEL);
  if ((await popover.count()) > 0) return;
  await page.locator(FILTERS_TRIGGER).click();
  await popover.waitFor({ state: "visible" });
}

async function setTraceCase(page: Page, caseId: string | null): Promise<void> {
  await page.evaluate((id) => {
    (
      window as unknown as { __diagram: { setTraceCase(c: string | null): void } }
    ).__diagram.setTraceCase(id);
  }, caseId);
}

async function getTraceCase(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    return (
      window as unknown as { __diagram: { getTraceCase(): string | null } }
    ).__diagram.getTraceCase();
  });
}

async function setFilters(page: Page, clauses: FilterClause[]): Promise<void> {
  await page.evaluate((cl) => {
    (
      window as unknown as { __diagram: { setFilters(c: FilterClause[]): void } }
    ).__diagram.setFilters(cl);
  }, clauses);
}

async function getFilters(page: Page): Promise<FilterClause[]> {
  return page.evaluate(() => {
    return (
      window as unknown as { __diagram: { getFilters(): FilterClause[] } }
    ).__diagram.getFilters();
  });
}

async function setHappyPathVariant(page: Page, seq: string[]): Promise<void> {
  await page.evaluate((s) => {
    (
      window as unknown as {
        __diagram: { setHappyPathVariant(s: string[] | null): void };
      }
    ).__diagram.setHappyPathVariant(s);
  }, seq);
}

async function getHappyPathVariant(page: Page): Promise<string[] | null> {
  return page.evaluate(() => {
    return (
      window as unknown as { __diagram: { getHappyPathVariant(): string[] | null } }
    ).__diagram.getHappyPathVariant();
  });
}

test("S1 — Case section in Filters popover commits a caseId filter + mounts the Trace panel", async ({
  page,
}) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  await setFilters(page, []); // clear default top-K variant filter

  await openFiltersPopover(page);
  await expect(page.locator(CASE_SECTION)).toBeVisible();

  await page.locator(CASE_INPUT).fill("case_0042");
  await page.locator(CASE_INPUT).press("Enter");

  // The case picker IS the filter — a caseId clause appears in the
  // filter list and the Trace panel mounts.
  const filters = await getFilters(page);
  const caseClause = filters.find(
    (c): c is Extract<FilterClause, { kind: "caseId" }> => c.kind === "caseId",
  );
  expect(caseClause?.caseIds).toEqual(["case_0042"]);
  await expect(page.locator(TRACE_PANEL)).toBeVisible();
  expect(await page.locator(TRACE_ROW).count()).toBeGreaterThan(0);
});

test("S2 — typing in the combobox + Enter commits via the same path", async ({ page }) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  await setFilters(page, []);
  await openFiltersPopover(page);
  await page.locator(CASE_INPUT).fill("case_0043");
  await page.locator(CASE_INPUT).press("Enter");
  expect(await getTraceCase(page)).toBe("case_0043");
});

test("S3 — there is no separate `Filter to this case` button on the Trace panel (case = filter)", async ({
  page,
}) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  await setFilters(page, []);
  await setTraceCase(page, "case_0042");
  await expect(page.locator(TRACE_PANEL)).toBeVisible();
  await expect(page.locator(`${TRACE_PANEL} .mining-lib-trace-filter-button`)).toHaveCount(0);
  // setTraceCase itself produced the clause.
  const filters = await getFilters(page);
  const caseClause = filters.find(
    (c): c is Extract<FilterClause, { kind: "caseId" }> => c.kind === "caseId",
  );
  expect(caseClause?.caseIds).toEqual(["case_0042"]);
});

test("S4 — replacing the clause list without a caseId clause clears the trace pin", async ({
  page,
}) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  await setFilters(page, []);
  await setTraceCase(page, "case_0042");
  expect(await getTraceCase(page)).toBe("case_0042");
  // Replace clauses with a non-caseId set → pin clears as a natural
  // consequence (no separate clearStaleTraceCase any more).
  await setFilters(page, [{ kind: "caseId", caseIds: ["case_0001"] }]);
  expect(await getTraceCase(page)).toBe("case_0001"); // now the new single-id case is the trace
  await setFilters(page, [{ kind: "node", activity: "submitted" }]);
  expect(await getTraceCase(page)).toBeNull();
  await expect(page.locator(TRACE_PANEL)).toHaveCount(0);
});

test("S5 — pinning a trace clears any happy-path variant (D1: trace wins)", async ({ page }) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  await setFilters(page, []);
  await setHappyPathVariant(page, ["submitted", "intake_validation", "rejected"]);
  expect(await getHappyPathVariant(page)).not.toBeNull();
  await setTraceCase(page, "case_0042");
  expect(await getHappyPathVariant(page)).toBeNull();
  expect(await getTraceCase(page)).toBe("case_0042");
});

test("S6 — hovering a panel row accents the matching DFG node", async ({ page }) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  await setFilters(page, []);
  await setTraceCase(page, "case_0042");
  await expect(page.locator(TRACE_PANEL)).toBeVisible();
  const firstRow = page.locator(TRACE_ROW).first();
  const firstActivity = await firstRow.getAttribute("data-activity");
  expect(firstActivity).not.toBeNull();
  await firstRow.hover();
  await expect(
    page.locator(
      `${SVG} g.mining-lib-node.mining-lib-trace-target-hover[data-activity="${firstActivity}"]`,
    ),
  ).toHaveCount(1);
});

test("S7 — hovering a DFG node highlights all matching panel rows (rework loops)", async ({
  page,
}) => {
  // case_0382 in n1000-realistic has five request_additional_info
  // events (the most rework-heavy case in the fixture).
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  await setFilters(page, []);
  await setTraceCase(page, "case_0382");
  await expect(page.locator(TRACE_PANEL)).toBeVisible();
  const reworkNode = page.locator(
    `${SVG} g.mining-lib-node[data-activity="request_additional_info"]`,
  );
  await reworkNode.hover();
  const highlightedRows = page.locator(
    `${TRACE_PANEL} .mining-lib-trace-row.mining-lib-trace-row-hover`,
  );
  expect(await highlightedRows.count()).toBeGreaterThanOrEqual(5);
});

test("S8 — Case section's popup is populated from the unfiltered log (always usable)", async ({
  page,
}) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  // Even when an existing filter narrows the visible set heavily, the
  // case picker stays operational with the full log's case ids — the
  // user can always escape an over-narrow filter by picking a case.
  await setFilters(page, [{ kind: "node", activity: "request_additional_info" }]);
  await openFiltersPopover(page);
  await expect(page.locator(CASE_INPUT)).toBeEnabled();
  // The custom-combobox popup has one <li> per case id, sourced from
  // the unfiltered log. Phase-28b: replaced the native <datalist>
  // with a chevron-driven popup for consistent affordance.
  const itemCount = await page
    .locator(`${CASE_SECTION} ul.mining-lib-case-popup li.mining-lib-case-popup-item`)
    .count();
  expect(itemCount).toBeGreaterThan(0);
});

test("S9 — programmatic setTraceCase + element-property attribute reflection", async ({ page }) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  await setFilters(page, []);

  // Path A: setting via the handle pins the trace + mounts the panel,
  // but does NOT reflect to the `trace-case` attribute (matches the
  // existing handle-vs-attribute split for setCountMode / setTheme).
  await setTraceCase(page, "case_0007");
  expect(await getTraceCase(page)).toBe("case_0007");
  await expect(page.locator(TRACE_PANEL)).toBeVisible();

  // Path B: setting the element's `traceCase` property DOES reflect.
  await page.evaluate(() => {
    (document.querySelector("mining-lib-diagram") as unknown as { traceCase: string }).traceCase =
      "case_0008";
  });
  expect(await getTraceCase(page)).toBe("case_0008");
  await expect(page.locator(HOST)).toHaveAttribute("trace-case", "case_0008");

  // Clearing via element property removes the attribute.
  await page.evaluate(() => {
    (
      document.querySelector("mining-lib-diagram") as unknown as { traceCase: undefined }
    ).traceCase = undefined;
  });
  expect(await getTraceCase(page)).toBeNull();
  expect(await page.locator(HOST).getAttribute("trace-case")).toBeNull();
});
