import { expect, type Page, test } from "@playwright/test";

const VIEWPORT = "#mount mining-lib-diagram svg .mining-lib-viewport";

async function getTransform(page: Page): Promise<{ k: number; x: number; y: number }> {
  return page.evaluate(() => {
    const handle = (
      window as unknown as {
        __diagram: { getTransform(): { k: number; x: number; y: number } };
      }
    ).__diagram;
    return handle.getTransform();
  });
}

async function svgBox(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator("#mount mining-lib-diagram svg.mining-lib-svg").boundingBox();
  if (!box) throw new Error("svg not visible");
  return box;
}

async function nodeBoxes(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number }[]> {
  return page.locator("#mount mining-lib-diagram g.mining-lib-node").evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
}

test("Scenario 1 — n5 fits at k=1 in a roomy host (downscale-only invariant)", async ({ page }) => {
  await page.goto("/responsive-fit.built.html?w=2000&h=1200");
  await expect(page.locator(VIEWPORT)).toBeVisible();

  const t = await getTransform(page);
  expect(t.k).toBe(1);

  const svg = await svgBox(page);
  for (const node of await nodeBoxes(page)) {
    expect(node.x).toBeGreaterThanOrEqual(svg.x - 1);
    expect(node.y).toBeGreaterThanOrEqual(svg.y - 1);
    expect(node.x + node.width).toBeLessThanOrEqual(svg.x + svg.width + 1);
    expect(node.y + node.height).toBeLessThanOrEqual(svg.y + svg.height + 1);
  }
});

test("Scenario 2 — Tight host downscales below k=1", async ({ page }) => {
  await page.goto("/responsive-fit.built.html?w=400&h=300");
  await expect(page.locator(VIEWPORT)).toBeVisible();

  const t = await getTransform(page);
  expect(t.k).toBeLessThan(1);
  expect(t.k).toBeGreaterThan(0);

  const svg = await svgBox(page);
  for (const node of await nodeBoxes(page)) {
    expect(node.x).toBeGreaterThanOrEqual(svg.x - 1);
    expect(node.y).toBeGreaterThanOrEqual(svg.y - 1);
    expect(node.x + node.width).toBeLessThanOrEqual(svg.x + svg.width + 1);
    expect(node.y + node.height).toBeLessThanOrEqual(svg.y + svg.height + 1);
  }
});

test("Scenario 3 — Resize re-fits to the new viewport", async ({ page }) => {
  await page.goto("/responsive-fit.built.html?w=400&h=400");
  await expect(page.locator(VIEWPORT)).toBeVisible();

  const tBefore = await getTransform(page);

  await page.evaluate(() => {
    const mount = (window as unknown as { __mount: HTMLElement }).__mount;
    mount.style.width = "1500px";
    mount.style.height = "900px";
  });

  // ResizeObserver fires within a frame; poll for the change.
  await expect
    .poll(async () => (await getTransform(page)).k, { timeout: 3000 })
    .toBeGreaterThan(tBefore.k);

  const tAfter = await getTransform(page);
  expect(tAfter.k).toBeGreaterThan(tBefore.k);
  expect(tAfter.k).toBeLessThanOrEqual(1);
});

test("Scenario 4 — Reset paths restore fit-to-view", async ({ page }) => {
  await page.goto("/responsive-fit.built.html?w=600&h=500");
  await expect(page.locator(VIEWPORT)).toBeVisible();

  const fit = await getTransform(page);
  expect(fit.k).toBeLessThan(1);

  // dblclick reset
  await page.evaluate(() => {
    (window as unknown as { __diagram: { zoomTo(k: number): void } }).__diagram.zoomTo(3);
  });
  await page.locator("#mount mining-lib-diagram svg.mining-lib-svg").dblclick();
  let after = await getTransform(page);
  expect(after.k).toBeCloseTo(fit.k, 5);

  // resetView() reset
  await page.evaluate(() => {
    (window as unknown as { __diagram: { zoomTo(k: number): void } }).__diagram.zoomTo(2);
  });
  await page.evaluate(() => {
    (window as unknown as { __diagram: { resetView(): void } }).__diagram.resetView();
  });
  after = await getTransform(page);
  expect(after.k).toBeCloseTo(fit.k, 5);
});

test("Scenario 5 — Empty filter keeps a finite viewBox (no NaN/Infinity)", async ({ page }) => {
  await page.goto("/responsive-fit.built.html?w=800&h=600");
  await expect(page.locator(VIEWPORT)).toBeVisible();

  await page.evaluate(() => {
    (
      window as unknown as { __diagram: { setVariantFilter(s: string[] | null): void } }
    ).__diagram.setVariantFilter([]);
  });

  const viewBox = await page
    .locator("#mount mining-lib-diagram svg.mining-lib-svg")
    .getAttribute("viewBox");
  expect(viewBox).toMatch(/^0 0 \d+(?:\.\d+)? \d+(?:\.\d+)?$/);

  const t = await getTransform(page);
  expect(Number.isFinite(t.k)).toBe(true);
  expect(Number.isFinite(t.x)).toBe(true);
  expect(Number.isFinite(t.y)).toBe(true);
});
