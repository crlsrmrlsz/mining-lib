import { expect, type Page, test } from "@playwright/test";

// Phase 32 follow-up: a node/edge can't be dragged outside the visible
// canvas — the *element* drag is clamped to the on-screen drawing area, so
// flinging a node past the edge stops it at the edge instead of stranding it.
// The *camera* pan, by contrast, is unbounded (free pan) — the whole diagram
// can be slid fully off-screen and re-framed with resetView. Verified on
// export-image.built.html (n5).

const NODE = "#mount mining-lib-diagram svg.mining-lib-svg g.mining-lib-node";
const BEND = "#mount mining-lib-diagram svg.mining-lib-svg circle.mining-lib-bend-handle";
const SVG_CELL = "#mount mining-lib-diagram .mining-lib-svg-cell";

async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __lastLoad?: unknown }).__lastLoad !== undefined,
  );
  await expect(page.locator(NODE).first()).toBeVisible();
}

test("a node cannot be dragged outside the visible canvas (clamped to the edge)", async ({
  page,
}) => {
  await page.goto("/export-image.built.html?fixture=n5-fixture&w=640&h=480");
  await waitForReady(page);

  const node = page.locator(NODE).first();
  const activity = await node.getAttribute("data-activity");
  const start = await node.boundingBox();
  const cell = await page.locator(SVG_CELL).boundingBox();
  if (!start || !cell) throw new Error("node / cell not visible");

  // Try to fling the node far past the host's right + bottom edges.
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(1600, cell.y + cell.height + 400, { steps: 25 });
  await page.mouse.up();

  const dragged = page.locator(`${NODE}[data-activity="${activity}"]`);
  const nb = await dragged.boundingBox();
  const cb = await page.locator(SVG_CELL).boundingBox();
  expect(nb).not.toBeNull();
  expect(cb).not.toBeNull();
  if (!nb || !cb) return;

  // The node stayed fully within the visible canvas (1px tolerance).
  expect(nb.x).toBeGreaterThanOrEqual(cb.x - 1);
  expect(nb.y).toBeGreaterThanOrEqual(cb.y - 1);
  expect(nb.x + nb.width).toBeLessThanOrEqual(cb.x + cb.width + 1);
  expect(nb.y + nb.height).toBeLessThanOrEqual(cb.y + cb.height + 1);
  // It did travel toward the bottom-right corner it was flung at.
  expect(nb.x + nb.width).toBeGreaterThan(cb.x + cb.width / 2);
  expect(nb.y + nb.height).toBeGreaterThan(cb.y + cb.height / 2);
});

test("the whole diagram can be panned freely out of the canvas (free pan)", async ({ page }) => {
  await page.goto("/export-image.built.html?fixture=n5-fixture&w=640&h=480");
  await waitForReady(page);

  const cell = await page.locator(SVG_CELL).boundingBox();
  if (!cell) throw new Error("cell not visible");

  // Pan hard to the right by dragging empty canvas (the top-left corner is
  // empty for the centred n5 graph, so the gesture is a pan, not a node drag).
  await page.mouse.move(cell.x + 8, cell.y + 8);
  await page.mouse.down();
  await page.mouse.move(cell.x + cell.width + 900, cell.y + 8, { steps: 25 });
  await page.mouse.up();

  // Free pan: the whole graph slid past the canvas's right edge — even the
  // leftmost node now sits entirely to the right of the visible canvas.
  const info = await page.locator(NODE).evaluateAll((els) => ({
    count: els.length,
    minLeft: Math.min(...els.map((el) => el.getBoundingClientRect().left)),
  }));
  expect(info.count).toBe(9);
  expect(info.minLeft).toBeGreaterThan(cell.x + cell.width);
});

test("an edge bend cannot be dragged outside the visible canvas", async ({ page }) => {
  await page.goto("/export-image.built.html?fixture=n5-fixture&w=640&h=480");
  await waitForReady(page);

  const handle = page.locator(BEND).first();
  await expect(handle).toBeVisible();
  const start = await handle.boundingBox();
  const cell = await page.locator(SVG_CELL).boundingBox();
  if (!start || !cell) throw new Error("handle / cell not visible");

  const ref = await handle.evaluate((el) => ({
    from: el.getAttribute("data-from") ?? "",
    to: el.getAttribute("data-to") ?? "",
    index: el.getAttribute("data-index") ?? "",
  }));

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(1700, start.y + start.height / 2, { steps: 25 });
  await page.mouse.up();

  const moved = page.locator(
    `${BEND}[data-from="${ref.from}"][data-to="${ref.to}"][data-index="${ref.index}"]`,
  );
  const hb = await moved.boundingBox();
  const cb = await page.locator(SVG_CELL).boundingBox();
  expect(hb).not.toBeNull();
  expect(cb).not.toBeNull();
  if (!hb || !cb) return;
  // The handle's centre stayed inside the visible canvas.
  const cx = hb.x + hb.width / 2;
  expect(cx).toBeLessThanOrEqual(cb.x + cb.width + 1);
  expect(cx).toBeGreaterThan(cb.x + cb.width / 2);
});
