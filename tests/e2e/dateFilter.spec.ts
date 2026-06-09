import { expect, type Page, test } from "@playwright/test";

const HOST = "#mount mining-lib-diagram";
const SVG = `${HOST} svg.mining-lib-svg`;
const FILTERS_PANEL = `${HOST} .mining-lib-filters-panel`;
const FILTERS_TRIGGER = `${HOST} button[data-popover="filters"]`;
const DATE_SECTION = `${FILTERS_PANEL} details.mining-lib-date-section`;
const DATE_FROM = `${DATE_SECTION} input.mining-lib-date-input[data-kind="from"]`;
const DATE_TO = `${DATE_SECTION} input.mining-lib-date-input[data-kind="to"]`;
const DATE_ANCHOR = `${DATE_SECTION} select.mining-lib-date-anchor`;
const DATE_HANDLES = `${DATE_SECTION} line.mining-lib-date-handle`;

type AttributeValue = string | number | boolean | null;
type DateAnchor = "started" | "ended" | "contained" | "intersecting";
type FilterClause =
  | { kind: "variant"; sequences: string[] }
  | { kind: "branch"; edge: [string, string] }
  | { kind: "node"; activity: string }
  | { kind: "resourceAt"; activity: string; resources: string[] }
  | { kind: "attribute"; attribute: string; values: AttributeValue[] }
  | { kind: "date"; from: string | null; to: string | null; anchor: DateAnchor };

async function openFiltersPopover(page: Page): Promise<void> {
  const popover = page.locator(`${HOST} .mining-lib-popover .mining-lib-filters-panel`);
  if ((await popover.count()) > 0) return;
  await page.locator(FILTERS_TRIGGER).click();
  await popover.waitFor({ state: "visible" });
}

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

test("S1 — typing a narrow range with `ended` anchor filters cases", async ({ page }) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  await setFilters(page, []); // clear default top-K variant filter
  const fullEdges = await page.locator(`${SVG} path.mining-lib-edge`).count();

  await openFiltersPopover(page);
  // The n1000 fixture has all cases starting 2024-01-02 (so `started`
  // anchor is binary — either all 1000 cases or 0). Use `ended` anchor
  // on a narrow February window — only cases whose last event lands in
  // Feb 1–7 survive. That's a proper subset.
  await page.locator(DATE_ANCHOR).selectOption("ended");
  await page.locator(DATE_FROM).fill("2024-02-01");
  await page.locator(DATE_FROM).press("Tab");
  await page.locator(DATE_TO).fill("2024-02-07");
  await page.locator(DATE_TO).press("Tab");

  // Chip appears in Active row with the `(Ended)` suffix.
  const chip = page.locator(`${FILTERS_PANEL} .mining-lib-filters-chip[data-kind='date']`);
  await expect(chip).toHaveCount(1);
  await expect(chip.locator(".mining-lib-filters-chip-label")).toHaveText(
    "Feb 1 – Feb 7, 2024 (Ended)",
  );

  // Filter is in the diagram's clause list.
  const filters = await getFilters(page);
  expect(filters.find((c) => c.kind === "date")).toBeDefined();

  // SVG is still rendered (non-empty filter set).
  await expect(page.locator(SVG)).toBeVisible();
  const filteredEdges = await page.locator(`${SVG} path.mining-lib-edge`).count();
  expect(filteredEdges).toBeLessThanOrEqual(fullEdges);
  expect(filteredEdges).toBeGreaterThan(0);
});

test("S2 — date inputs pre-fill with log min/max when no clause exists", async ({ page }) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  await setFilters(page, []);
  await openFiltersPopover(page);

  // Pre-filled values match the log's actual date range, not empty.
  const fromValue = await page.locator(DATE_FROM).inputValue();
  const toValue = await page.locator(DATE_TO).inputValue();
  expect(fromValue).not.toBe("");
  expect(toValue).not.toBe("");
  expect(fromValue < toValue).toBe(true);

  // No clause exists despite the visible values — pre-fill is display only.
  expect(await getFilters(page)).toHaveLength(0);
});

test("S3 — anchor dropdown change relabels chip + refilters diagram", async ({ page }) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  await setFilters(page, [
    { kind: "date", from: "2024-03-01", to: "2024-03-31", anchor: "started" },
  ]);
  await openFiltersPopover(page);
  await expect(
    page.locator(`${FILTERS_PANEL} .mining-lib-filters-chip[data-kind='date']`),
  ).toHaveCount(1);

  await page.locator(DATE_ANCHOR).selectOption("ended");

  // Chip relabels with the (Ended) suffix.
  await expect(
    page.locator(
      `${FILTERS_PANEL} .mining-lib-filters-chip[data-kind='date'] .mining-lib-filters-chip-label`,
    ),
  ).toHaveText("Mar 1 – Mar 31, 2024 (Ended)");
  const filters = await getFilters(page);
  const date = filters.find((c) => c.kind === "date");
  if (date?.kind === "date") {
    expect(date.anchor).toBe("ended");
  }
});

test("S4 — programmatic open-ended `from` clause → `After …` chip", async ({ page }) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  // Inputs pre-fill with log bounds in the UI now, so the user can't
  // reach a from-only clause by typing. The clause is still reachable
  // programmatically (and that path is what the chip wording supports).
  await setFilters(page, [{ kind: "date", from: "2024-04-01", to: null, anchor: "started" }]);
  await openFiltersPopover(page);

  await expect(
    page.locator(
      `${FILTERS_PANEL} .mining-lib-filters-chip[data-kind='date'] .mining-lib-filters-chip-label`,
    ),
  ).toHaveText("After Apr 1, 2024");
});

test("S5a — input values update live during brush drag (visual preview, no commit)", async ({
  page,
}) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  await setFilters(page, []);
  await openFiltersPopover(page);

  // Input now pre-fills with log min/max — capture the starting value
  // so we can verify the drag changed it.
  const startingFrom = await page.locator(DATE_FROM).inputValue();

  const handle = page.locator(DATE_HANDLES).first();
  const box = await handle.boundingBox();
  if (!box) throw new Error("handle has no bounding box");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Move halfway across the histogram and pause mid-drag.
  await page.mouse.move(startX + 80, startY, { steps: 10 });

  // While the mouse is still down, the `from` input should already
  // reflect the in-flight bound (live visual preview) — different from
  // the starting pre-filled value — and no clause should have been
  // committed yet.
  const liveValue = await page.locator(DATE_FROM).inputValue();
  expect(liveValue).not.toBe(startingFrom);
  expect(await getFilters(page)).toHaveLength(0); // commit holds until release

  await page.mouse.up();

  // After release the clause commits with the same bound the input
  // showed mid-drag.
  const filters = await getFilters(page);
  const date = filters.find((c) => c.kind === "date");
  expect(date).toBeDefined();
  if (date?.kind === "date") {
    expect(date.from).toBe(liveValue);
  }
});

test("S5 — histogram brush drag commits a new bound on release", async ({ page }) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  await setFilters(page, []);
  await openFiltersPopover(page);

  // Capture starting `from` value (initially null because no clause).
  expect(await getFilters(page)).toHaveLength(0);

  // Grab the left handle (the first .mining-lib-date-handle); drag to
  // the right by ~60 px. The drag commits on release (Decision D8).
  const handle = page.locator(DATE_HANDLES).first();
  const box = await handle.boundingBox();
  if (!box) throw new Error("handle has no bounding box");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 60, startY, { steps: 5 });
  await page.mouse.up();

  // A date clause now exists with a non-null `from`.
  const filters = await getFilters(page);
  const date = filters.find((c) => c.kind === "date");
  expect(date).toBeDefined();
  if (date?.kind === "date") {
    expect(date.from).not.toBeNull();
  }
});

test("S6 — auto-swap when from > to is typed", async ({ page }) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  await setFilters(page, []);
  await openFiltersPopover(page);

  // n1000 log spans Jan 2 – Mar 25. Pick two dates well within so the
  // pre-fill log-bound on the untouched side doesn't interfere with
  // the swap math.
  await page.locator(DATE_FROM).fill("2024-02-15");
  await page.locator(DATE_FROM).press("Tab");
  await page.locator(DATE_TO).fill("2024-02-01");
  await page.locator(DATE_TO).press("Tab");

  // Chip reads the swapped range.
  await expect(
    page.locator(
      `${FILTERS_PANEL} .mining-lib-filters-chip[data-kind='date'] .mining-lib-filters-chip-label`,
    ),
  ).toHaveText("Feb 1 – Feb 15, 2024");
});

test("S7 — empty log → section auto-hides (no DOM)", async ({ page }) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  // Render an empty Dfg + an empty log (no events). The date section
  // must not appear in the Filters popover.
  await page.evaluate(() => {
    const emptyLog = {
      cases: new Map(),
      events: [],
      schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
    };
    const emptyDfg = { nodes: new Map(), edges: new Map() };
    (
      window as unknown as {
        __diagram: { render(d: unknown, l: unknown): void };
      }
    ).__diagram.render(emptyDfg, emptyLog);
  });

  await openFiltersPopover(page);
  await expect(page.locator(DATE_SECTION)).toHaveCount(0);
});

test("S8 — programmatic setFilters round-trips a date clause", async ({ page }) => {
  await page.goto("/phase14.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  await setFilters(page, [
    { kind: "date", from: "2024-03-01", to: "2024-03-31", anchor: "started" },
  ]);
  const after = await getFilters(page);
  expect(after).toHaveLength(1);
  expect(after[0]).toEqual({
    kind: "date",
    from: "2024-03-01",
    to: "2024-03-31",
    anchor: "started",
  });

  // Popover reflects the value in the inputs.
  await openFiltersPopover(page);
  await expect(page.locator(DATE_FROM)).toHaveValue("2024-03-01");
  await expect(page.locator(DATE_TO)).toHaveValue("2024-03-31");
  await expect(page.locator(DATE_ANCHOR)).toHaveValue("started");
});
