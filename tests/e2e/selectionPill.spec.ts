import { expect, type Page, test } from "@playwright/test";

const HOST = "#mount mining-lib-diagram";
const SVG = `${HOST} svg.mining-lib-svg`;
const SELECTION_PILL = `${HOST} .mining-lib-pill-selection`;

async function selectNode(page: Page, id: string): Promise<void> {
  await page.evaluate((nodeId: string) => {
    (
      window as unknown as {
        __diagram: { select(t: { kind: "node"; id: string }): void };
      }
    ).__diagram.select({ kind: "node", id: nodeId });
  }, id);
}

async function pillTopPx(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document
      .querySelector("mining-lib-diagram")
      ?.shadowRoot?.querySelector(".mining-lib-pill-selection") as HTMLElement | null;
    if (!el) return Number.NaN;
    return Number.parseFloat(el.style.top);
  });
}

test("Scenario A — pill mounts above the selection (anchor=above)", async ({ page }) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  await selectNode(page, "review_in_progress");
  const pill = page.locator(SELECTION_PILL);
  await expect(pill).toBeVisible();
  await expect(pill).toHaveAttribute("data-anchor", "above");
});

test("Scenario B — pill flips to below when the selection is near the host's top edge", async ({
  page,
}) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  await selectNode(page, "submitted");
  const pill = page.locator(SELECTION_PILL);
  await expect(pill).toBeVisible();

  // Pan a moderate amount up so the node sits near the top edge but
  // is still visible — the anchor should flip from above to below.
  const svgBox = await page.locator(SVG).boundingBox();
  if (!svgBox) throw new Error("svg not measurable");
  await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);
  // Three small wheel ticks to pan the diagram down by ~150 px.
  for (let i = 0; i < 3; i += 1) {
    await page.mouse.wheel(0, -50);
  }
  await page.waitForTimeout(50);
  // The pill's anchor flips to below at some point during the pan;
  // assert the data-anchor attribute reflects that.
  await expect(pill).toHaveAttribute("data-anchor", "below");
});

test("Scenario C — Esc clears selection and unmounts the pill", async ({ page }) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  await selectNode(page, "review_in_progress");
  await expect(page.locator(SELECTION_PILL)).toBeVisible();

  await page.locator(SVG).focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(SELECTION_PILL)).toHaveCount(0);
});

test("Scenario D — × button clears selection (Esc-equivalent)", async ({ page }) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  await selectNode(page, "review_in_progress");
  await page.locator(`${SELECTION_PILL} .mining-lib-pill-close`).click();
  await expect(page.locator(SELECTION_PILL)).toHaveCount(0);
});

test("Scenario E — controls=primary tr bl (no ctx) suppresses the pill entirely", async ({
  page,
}) => {
  await page.goto(
    "/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720&controls=primary%20tr%20bl",
  );
  await expect(page.locator(SVG)).toBeVisible();

  await selectNode(page, "review_in_progress");
  // Selection outline still renders on the SVG node.
  await expect(
    page.locator('#mount mining-lib-diagram g.mining-lib-node[data-activity="review_in_progress"]'),
  ).toHaveClass(/mining-lib-selected/);
  // But the floating pill never mounts.
  await expect(page.locator(SELECTION_PILL)).toHaveCount(0);
});

test("Scenario F — pill repositions after a zoom (top changes)", async ({ page }) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  await selectNode(page, "review_in_progress");
  const before = await pillTopPx(page);
  expect(Number.isFinite(before)).toBe(true);

  // Zoom in — the projected bbox moves, the pill should reposition.
  await page.evaluate(() => {
    (window as unknown as { __diagram: { zoomTo(k: number): void } }).__diagram.zoomTo(2.5);
  });
  await page.waitForTimeout(50);
  const after = await pillTopPx(page);
  expect(Number.isFinite(after)).toBe(true);
  // Top changed — pill is tracking the bbox.
  expect(Math.abs(after - before)).toBeGreaterThan(1);
});

test("Scenario G — × sits in the pill's top-right corner (Phase 22)", async ({ page }) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=1200&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  // Pick a node with a Resources block to verify the corner placement
  // holds across multi-row pill heights.
  await selectNode(page, "review_in_progress");
  const pillBox = await page.locator(SELECTION_PILL).boundingBox();
  const closeBox = await page.locator(`${SELECTION_PILL} .mining-lib-pill-close`).boundingBox();
  if (pillBox === null || closeBox === null) {
    throw new Error("pill or close button not measurable");
  }
  // Close button's right edge within 12 px of the pill's right edge.
  const pillRight = pillBox.x + pillBox.width;
  const closeRight = closeBox.x + closeBox.width;
  expect(Math.abs(pillRight - closeRight)).toBeLessThanOrEqual(12);
  // Close button's top edge within 12 px of the pill's top edge.
  expect(Math.abs(closeBox.y - pillBox.y)).toBeLessThanOrEqual(12);
});
