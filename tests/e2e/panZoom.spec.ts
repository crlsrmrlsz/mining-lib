import { expect, type Page, test } from "@playwright/test";

function scaleFromTransform(attr: string | null): number {
  if (!attr) return 1;
  const match = attr.match(/scale\(([-0-9.eE+]+)(?:\s*,\s*[-0-9.eE+]+)?\)/);
  return match ? Number(match[1]) : 1;
}

async function getTransformAttr(page: Page): Promise<string | null> {
  return page.locator("#mount svg .mining-lib-viewport").getAttribute("transform");
}

test.describe("pan and zoom gestures", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/render.built.html");
    await expect(page.locator("#mount svg .mining-lib-viewport")).toBeVisible();
  });

  test("svg carries tabindex='0' so keyboard shortcuts can reach it", async ({ page }) => {
    await expect(page.locator("#mount svg.mining-lib-svg")).toHaveAttribute("tabindex", "0");
  });

  test("wheel event zooms the viewport in (scale grows past initial fit)", async ({ page }) => {
    const initialScale = await page.evaluate(
      () =>
        (
          window as unknown as { __diagram: { getTransform(): { k: number } } }
        ).__diagram.getTransform().k,
    );
    const svg = page.locator("#mount svg.mining-lib-svg");
    await svg.hover({ position: { x: 200, y: 200 } });
    await page.mouse.wheel(0, -200);

    await expect
      .poll(async () => scaleFromTransform(await getTransformAttr(page)))
      .toBeGreaterThan(initialScale);
  });

  test("double-click resets the viewport to the fit-to-view transform after a programmatic zoom", async ({
    page,
  }) => {
    const initialScale = await page.evaluate(() => {
      return (
        window as unknown as { __diagram: { getTransform(): { k: number } } }
      ).__diagram.getTransform().k;
    });

    await page.evaluate(() => {
      (window as unknown as { __diagram: { zoomTo(k: number): void } }).__diagram.zoomTo(3);
    });
    await expect.poll(async () => scaleFromTransform(await getTransformAttr(page))).toBe(3);

    const svg = page.locator("#mount svg.mining-lib-svg");
    await svg.dblclick();

    await expect
      .poll(async () => scaleFromTransform(await getTransformAttr(page)))
      .toBeCloseTo(initialScale, 5);
  });

  test("drag-pan moves the viewport (translate appears in transform)", async ({ page }) => {
    // Phase 6 clamps pan to layout bounds. At k=1 with n5's small content
    // and a wide viewport, content fits with slack and pan is locked. Zoom
    // in first so content is larger than the viewport and drag has room to
    // produce a non-identity translate.
    await page.evaluate(() => {
      (window as unknown as { __diagram: { zoomTo(k: number): void } }).__diagram.zoomTo(3);
    });

    const svg = page.locator("#mount svg.mining-lib-svg");
    const box = await svg.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const transformBefore =
      (await page.locator("#mount svg .mining-lib-viewport").getAttribute("transform")) ?? "";

    await svg.hover({ position: { x: 200, y: 200 } });
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + 100, { steps: 10 });
    await page.mouse.up();

    const transformAfter = (await getTransformAttr(page)) ?? "";
    expect(transformAfter).toMatch(/translate\(/);
    expect(transformAfter).not.toBe(transformBefore);
  });

  test("'+' key zooms in, '0' resets to fit-to-view", async ({ page }) => {
    const initialScale = await page.evaluate(() => {
      return (
        window as unknown as { __diagram: { getTransform(): { k: number } } }
      ).__diagram.getTransform().k;
    });

    const svg = page.locator("#mount svg.mining-lib-svg");
    await svg.focus();
    await page.keyboard.press("+");
    await page.keyboard.press("+");
    await page.keyboard.press("+");

    await expect
      .poll(async () => scaleFromTransform(await getTransformAttr(page)))
      .toBeCloseTo(initialScale * 1.728, 2);

    await page.keyboard.press("0");
    await expect
      .poll(async () => scaleFromTransform(await getTransformAttr(page)))
      .toBeCloseTo(initialScale, 5);
  });
});
