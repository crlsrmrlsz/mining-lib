import { expect, type Page, test } from "@playwright/test";

const PANEL = "#mount mining-lib-diagram .mining-lib-panel";
const ROW = "#mount mining-lib-diagram label.mining-lib-panel-row";
const VISIBLE_ROW = "#mount mining-lib-diagram label.mining-lib-panel-row:not([hidden])";
const CHECKBOX = "#mount mining-lib-diagram input[type='checkbox'][data-signature]";
const NODE = "#mount mining-lib-diagram g.mining-lib-node";
const EDGE = "#mount mining-lib-diagram path.mining-lib-edge";
const EXPANDER = "#mount mining-lib-diagram button.mining-lib-panel-show-all";

async function goto(page: Page, topK?: number): Promise<void> {
  const url = topK == null ? "/phase12.built.html" : `/phase12.built.html?topK=${topK}`;
  await page.goto(url);
  // Phase 22c: the variant panel lives inside the ▾ Variants
  // popover at every width (desktop rails retired). Tap the
  // trigger then wait for the variant checkboxes to enter the
  // shadow DOM.
  const trigger = page.locator('#mount mining-lib-diagram button[data-popover="variants"]');
  await trigger.click();
  await page.waitForFunction(() => {
    const el = document.querySelector("#mount mining-lib-diagram");
    return Boolean(el?.shadowRoot?.querySelector("input[type='checkbox'][data-signature]"));
  });
}

test("Scenario 1 — n5 fixture: panel shows all 4 variants, no expander", async ({ page }) => {
  await goto(page);

  await expect(page.locator(PANEL)).toHaveCount(1);
  await expect(page.locator(CHECKBOX)).toHaveCount(4);

  for (let i = 0; i < 4; i += 1) {
    await expect(page.locator(CHECKBOX).nth(i)).toBeChecked();
  }

  await expect(page.locator(EXPANDER)).toHaveCount(0);
});

test("Scenario 2 — Untick the rework-loop variant → its unique edges disappear", async ({
  page,
}) => {
  await goto(page);

  const reworkRow = page.locator(`${ROW}[title*='request_additional_info']`);
  await reworkRow.locator("input[type='checkbox']").uncheck();

  await expect(page.locator(`${EDGE}[data-from='request_additional_info']`)).toHaveCount(0);

  await expect(page.locator(`${NODE}[data-activity='submitted']`)).toHaveCount(1);
  await expect(page.locator(`${NODE}[data-activity='approved']`)).toHaveCount(1);

  const filter = await page.evaluate(() => {
    const handle = (window as unknown as { __diagram: { getVariantFilter(): string[] | null } })
      .__diagram;
    return handle.getVariantFilter();
  });
  expect(Array.isArray(filter)).toBe(true);
  expect(filter).toHaveLength(3);
});

test("Scenario 3 — variant-top-k=2: top-2 visible AND ticked; bottom-2 hidden AND unticked", async ({
  page,
}) => {
  await goto(page, 2);

  await expect(page.locator(ROW)).toHaveCount(4);
  await expect(page.locator(VISIBLE_ROW)).toHaveCount(2);

  const expander = page.locator(EXPANDER);
  await expect(expander).toHaveCount(1);
  await expect(expander).toContainText("Show all");
  await expect(expander).toContainText("4");

  // Default selection: top-2 ticked, bottom-2 unticked (mirrors visibility).
  await expect(page.locator(CHECKBOX).nth(0)).toBeChecked();
  await expect(page.locator(CHECKBOX).nth(1)).toBeChecked();
  await expect(page.locator(CHECKBOX).nth(2)).not.toBeChecked();
  await expect(page.locator(CHECKBOX).nth(3)).not.toBeChecked();

  // Filter is the top-2 signatures.
  const filter = await page.evaluate(() => {
    const handle = (window as unknown as { __diagram: { getVariantFilter(): string[] | null } })
      .__diagram;
    return handle.getVariantFilter();
  });
  expect(Array.isArray(filter)).toBe(true);
  expect(filter).toHaveLength(2);

  // Clicking expander reveals all rows; selection state unchanged
  // (visibility is purely positional, not coupled to checked state).
  await expander.click();
  await expect(page.locator(VISIBLE_ROW)).toHaveCount(4);
  await expect(expander).toContainText("Show top");
  await expect(expander).toContainText("2");
  await expect(page.locator(CHECKBOX).nth(2)).not.toBeChecked();
  await expect(page.locator(CHECKBOX).nth(3)).not.toBeChecked();
});

test("Scenario 8 — 'All' / 'None' bulk buttons", async ({ page }) => {
  await goto(page, 2);

  // Default: top-2 selected (filter has 2 signatures).
  let filter = await page.evaluate(() => {
    const h = (window as unknown as { __diagram: { getVariantFilter(): string[] | null } })
      .__diagram;
    return h.getVariantFilter();
  });
  expect(filter).toHaveLength(2);

  // Click "All" → filter null, all 4 ticked, full diagram.
  await page.locator("#mount mining-lib-diagram .mining-lib-panel-bulk-all").click();
  filter = await page.evaluate(() => {
    const h = (window as unknown as { __diagram: { getVariantFilter(): string[] | null } })
      .__diagram;
    return h.getVariantFilter();
  });
  expect(filter).toBeNull();
  for (let i = 0; i < 4; i += 1) {
    await expect(page.locator(CHECKBOX).nth(i)).toBeChecked();
  }

  // Click "None" → filter [], 0 nodes, all unticked.
  await page.locator("#mount mining-lib-diagram .mining-lib-panel-bulk-none").click();
  filter = await page.evaluate(() => {
    const h = (window as unknown as { __diagram: { getVariantFilter(): string[] | null } })
      .__diagram;
    return h.getVariantFilter();
  });
  expect(filter).toEqual([]);
  await expect(page.locator(NODE)).toHaveCount(0);
  for (let i = 0; i < 4; i += 1) {
    await expect(page.locator(CHECKBOX).nth(i)).not.toBeChecked();
  }
});

test("Scenario 5 — Untick everything → 0 nodes / 0 edges, no placeholder", async ({ page }) => {
  await goto(page);

  for (let i = 0; i < 4; i += 1) {
    await page.locator(CHECKBOX).nth(i).uncheck();
  }

  await expect(page.locator(NODE)).toHaveCount(0);
  await expect(page.locator(EDGE)).toHaveCount(0);

  const placeholder = page.locator("#mount mining-lib-diagram svg.mining-lib-svg text", {
    hasText: "No data loaded",
  });
  await expect(placeholder).toHaveCount(0);
});

test("Scenario 7 — Setting variantTopK after render redraws panel only (filter unchanged)", async ({
  page,
}) => {
  await goto(page);

  await expect(page.locator(EXPANDER)).toHaveCount(0);

  await page.evaluate(() => {
    const el = (window as unknown as { __el: { variantTopK: number } }).__el;
    el.variantTopK = 2;
  });

  await expect(page.locator(VISIBLE_ROW)).toHaveCount(2);
  await expect(page.locator(EXPANDER)).toHaveCount(1);

  const filter = await page.evaluate(() => {
    const handle = (window as unknown as { __diagram: { getVariantFilter(): string[] | null } })
      .__diagram;
    return handle.getVariantFilter();
  });
  expect(filter).toBeNull();
});
