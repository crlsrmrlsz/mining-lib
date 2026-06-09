import { expect, type Page, test } from "@playwright/test";

/**
 * Phase 37 — runtime layout-direction (rankdir) toggle.
 *
 * Unit tests (createDiagram.test.ts / MiningLibDiagram.test.ts) cover the
 * handle + web-component logic in jsdom. These e2e checks add what jsdom
 * can't model: real-browser chrome overflow after a flip, and a real pointer
 * drag whose override must be discarded on relayout.
 */

const HOST = "#mount mining-lib-diagram";
const VIEWPORT = `${HOST} svg .mining-lib-viewport`;
const PRIMARY = `${HOST} .mining-lib-pill-primary`;
const UTILITIES = `${HOST} .mining-lib-pill-utilities`;
const ZOOM = `${HOST} .mining-lib-pill-zoom`;
const TOGGLE = `${UTILITIES} button[title="Toggle layout direction"]`;
const DRAG_TARGET = "submitted";

type BBox = { x: number; y: number; width: number; height: number };

function within(child: BBox, parent: BBox, tol = 1): boolean {
  return (
    child.x >= parent.x - tol &&
    child.y >= parent.y - tol &&
    child.x + child.width <= parent.x + parent.width + tol &&
    child.y + child.height <= parent.y + parent.height + tol
  );
}

async function getRankdir(page: Page): Promise<string> {
  return page.evaluate(() =>
    (window as unknown as { __diagram: { getRankdir(): string } }).__diagram.getRankdir(),
  );
}

/** Aspect ratio (w/h) of the laid-out content — zoom-independent (getBBox is pre-transform). */
async function contentAspect(page: Page): Promise<number> {
  return page.locator(VIEWPORT).evaluate((el) => {
    const b = (el as unknown as SVGGraphicsElement).getBBox();
    return b.width / b.height;
  });
}

/** World-space (pre-zoom) centre of a node, read from its transform translate. */
async function nodeWorldCenter(page: Page, activity: string): Promise<{ x: number; y: number }> {
  return page
    .locator(`${HOST} svg g.mining-lib-node[data-activity="${activity}"]`)
    .evaluate((g) => {
      const m = (g.getAttribute("transform") ?? "").match(
        /translate\(\s*([-0-9.eE+]+)\s*[, ]\s*([-0-9.eE+]+)\s*\)/,
      );
      if (!m) throw new Error("node missing translate");
      const rect = g.querySelector("rect");
      const w = Number(rect?.getAttribute("width") ?? 0);
      const h = Number(rect?.getAttribute("height") ?? 0);
      return { x: Number(m[1]) + w / 2, y: Number(m[2]) + h / 2 };
    });
}

const PAGE = "/phase14.built.html?fixture=n1000-realistic&w=1200&h=720";

test.describe("rankdir toggle (Phase 37)", () => {
  test("utilities-pill button flips TB → LR and re-lays-out horizontally", async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator(VIEWPORT)).toBeVisible();
    expect(await getRankdir(page)).toBe("TB");
    const before = await contentAspect(page);

    await page.locator(TOGGLE).click();

    expect(await getRankdir(page)).toBe("LR");
    // LR unrolls the funnel horizontally → the content aspect (w/h) grows.
    expect(await contentAspect(page)).toBeGreaterThan(before);
  });

  test("the toggle glyph reflects the current orientation", async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator(VIEWPORT)).toBeVisible();
    const btn = page.locator(TOGGLE);
    await expect(btn).toHaveAttribute("data-icon", "layoutVertical");
    await btn.click();
    await expect(btn).toHaveAttribute("data-icon", "layoutHorizontal");
  });

  test("flipping orientation discards manual node-drag overrides", async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator(VIEWPORT)).toBeVisible();

    const node = page.locator(`${HOST} svg g.mining-lib-node[data-activity="${DRAG_TARGET}"]`);
    await node.hover();
    const box = await node.boundingBox();
    if (!box) throw new Error(`node "${DRAG_TARGET}" not visible`);
    const original = await nodeWorldCenter(page, DRAG_TARGET);

    // Real pointer drag → sets a node-position override.
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 240, box.y + box.height / 2 + 180, { steps: 20 });
    await page.mouse.up();
    const dragged = await nodeWorldCenter(page, DRAG_TARGET);
    expect(Math.hypot(dragged.x - original.x, dragged.y - original.y)).toBeGreaterThan(50);

    await page.locator(TOGGLE).click();
    expect(await getRankdir(page)).toBe("LR");

    // Override cleared: the node is re-laid-out by dagre, not pinned at the
    // drag spot. (Were the override kept, afterFlip would equal `dragged`.)
    const afterFlip = await nodeWorldCenter(page, DRAG_TARGET);
    expect(Math.hypot(afterFlip.x - dragged.x, afterFlip.y - dragged.y)).toBeGreaterThan(50);
  });

  for (const w of [1200, 400]) {
    test(`no chrome surface overflows the host after a flip at width ${w}`, async ({ page }) => {
      await page.goto(`/phase14.built.html?fixture=n1000-realistic&w=${w}&h=720`);
      await expect(page.locator(VIEWPORT)).toBeVisible();

      await page.locator(TOGGLE).click();
      expect(await getRankdir(page)).toBe("LR");

      const host = await page.locator(HOST).boundingBox();
      expect(host).not.toBeNull();
      for (const sel of [PRIMARY, UTILITIES, ZOOM]) {
        const loc = page.locator(sel);
        if ((await loc.count()) === 0 || !(await loc.isVisible())) continue;
        const box = await loc.boundingBox();
        if (box && host) {
          expect(within(box, host), `${sel} should fit within the host after a flip`).toBe(true);
        }
      }
    });
  }
});
