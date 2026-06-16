import { expect, type Page, test } from "@playwright/test";

// Free-pan model (replaces the former bounded "pan clamp"): the camera pans
// without bounds at any zoom, so the diagram can be moved fully off-screen in
// any direction — consistent whether the graph is smaller or larger than the
// viewport. `resetView()` (also `0` / double-click) re-frames it to fit.

type Rect = { left: number; right: number; top: number; bottom: number };

function intersects(a: Rect, b: Rect): boolean {
  return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
}

async function svgRect(page: Page): Promise<Rect> {
  const box = await page.locator("#mount svg.mining-lib-svg").boundingBox();
  if (!box) throw new Error("svg not visible");
  return { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height };
}

async function nodeRects(page: Page): Promise<Rect[]> {
  return page.locator("#mount svg g.mining-lib-node").evaluateAll((els) =>
    els.map((el) => {
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
    }),
  );
}

async function anyNodeOnScreen(page: Page): Promise<boolean> {
  const svg = await svgRect(page);
  const nodes = await nodeRects(page);
  expect(nodes.length).toBeGreaterThan(0);
  return nodes.some((n) => intersects(n, svg));
}

// Drag the camera straight down from an empty top corner, repeatedly, to push
// the whole graph past the bottom edge. Starting in the corner keeps the
// grab point off any node so every pass registers as a pan.
async function dragDownRepeatedly(page: Page, passes: number, distance: number): Promise<void> {
  const svg = page.locator("#mount svg.mining-lib-svg");
  const box = await svg.boundingBox();
  if (!box) throw new Error("svg not visible");
  const x = box.x + box.width - 25;
  const y = box.y + 25;
  for (let i = 0; i < passes; i++) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + distance, { steps: 12 });
    await page.mouse.up();
  }
}

test.describe("free pan (unbounded camera)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/render.built.html");
    await expect(page.locator("#mount svg .mining-lib-viewport")).toBeVisible();
  });

  test("drag at default zoom can push the graph fully off-screen", async ({ page }) => {
    await dragDownRepeatedly(page, 5, 700);
    expect(await anyNodeOnScreen(page), "no node should remain on screen after a free pan").toBe(
      false,
    );
  });

  test("drag while zoomed in can push the graph fully off-screen", async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown as { __diagram: { zoomTo(k: number): void } }).__diagram.zoomTo(3);
    });
    await dragDownRepeatedly(page, 8, 700);
    expect(
      await anyNodeOnScreen(page),
      "no node should remain on screen after a free pan while zoomed",
    ).toBe(false);
  });

  test("resetView re-frames the graph after it is panned off-screen", async ({ page }) => {
    await dragDownRepeatedly(page, 5, 700);
    expect(await anyNodeOnScreen(page), "precondition: graph is panned off-screen").toBe(false);

    await page.evaluate(() => {
      (window as unknown as { __diagram: { resetView(): void } }).__diagram.resetView();
    });

    expect(await anyNodeOnScreen(page), "resetView must bring the graph back on screen").toBe(true);
  });

  test("a pan still updates the camera transform", async ({ page }) => {
    const before = await page.evaluate(
      () =>
        (
          window as unknown as { __diagram: { getTransform(): { x: number; y: number } } }
        ).__diagram.getTransform().y,
    );
    await dragDownRepeatedly(page, 1, 200);
    const after = await page.evaluate(
      () =>
        (
          window as unknown as { __diagram: { getTransform(): { x: number; y: number } } }
        ).__diagram.getTransform().y,
    );
    expect(after, "downward drag must increase the camera translate").toBeGreaterThan(before);
  });
});
