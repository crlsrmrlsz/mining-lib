import { expect, type Page, test } from "@playwright/test";

const DRAG_TARGET = "review_in_progress";

type Point = { x: number; y: number };

async function nodeCenter(page: Page, activity: string): Promise<Point> {
  const box = await page
    .locator(`#mount svg g.mining-lib-node[data-activity="${activity}"]`)
    .boundingBox();
  if (!box) throw new Error(`node "${activity}" not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

type DragResult = { from: Point; to: Point };

async function dragNode(page: Page, activity: string, dx: number, dy: number): Promise<DragResult> {
  const node = page.locator(`#mount svg g.mining-lib-node[data-activity="${activity}"]`);
  await node.scrollIntoViewIfNeeded();
  await node.hover();
  const from = await nodeCenter(page, activity);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 20 });
  await page.mouse.up();
  const to = await nodeCenter(page, activity);
  return { from, to };
}

function parseCatmullRom(d: string): { start: Point; end: Point; segmentCount: number } | null {
  const num = "([-0-9.eE+]+)";
  const mMatch = d.match(new RegExp(`^M\\s+${num}\\s+${num}`));
  if (!mMatch) return null;
  const start = { x: Number(mMatch[1]), y: Number(mMatch[2]) };
  const segmentRx = new RegExp(
    `C\\s+${num}\\s+${num},\\s*${num}\\s+${num},\\s*${num}\\s+${num}`,
    "g",
  );
  const segments = Array.from(d.matchAll(segmentRx));
  if (segments.length === 0) return null;
  const last = segments[segments.length - 1];
  if (!last) return null;
  const end = { x: Number(last[5]), y: Number(last[6]) };
  return { start, end, segmentCount: segments.length };
}

async function nodeWorldCenter(page: Page, activity: string): Promise<Point> {
  return page.locator(`#mount svg g.mining-lib-node[data-activity="${activity}"]`).evaluate((g) => {
    const transform = g.getAttribute("transform") ?? "";
    const m = transform.match(/translate\(\s*([-0-9.eE+]+)\s*[, ]\s*([-0-9.eE+]+)\s*\)/);
    if (!m) throw new Error(`missing translate on ${g.getAttribute("data-activity")}`);
    const tx = Number(m[1]);
    const ty = Number(m[2]);
    const rect = g.querySelector("rect");
    const w = Number(rect?.getAttribute("width") ?? 0);
    const h = Number(rect?.getAttribute("height") ?? 0);
    return { x: tx + w / 2, y: ty + h / 2 };
  });
}

test.describe("node drag", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/phase3.built.html");
    await expect(page.locator("#mount svg .mining-lib-viewport")).toBeVisible();
  });

  test("drag moves a node to a new position", async ({ page }) => {
    const { from, to } = await dragNode(page, DRAG_TARGET, 200, 150);
    expect(to.x - from.x).toBeGreaterThan(190);
    expect(to.x - from.x).toBeLessThan(210);
    expect(to.y - from.y).toBeGreaterThan(140);
    expect(to.y - from.y).toBeLessThan(160);
  });

  test("incident edges remain parseable Catmull-Rom paths after drag", async ({ page }) => {
    await dragNode(page, DRAG_TARGET, 200, 150);

    const outEdges = page.locator(`#mount svg path.mining-lib-edge[data-from="${DRAG_TARGET}"]`);
    const inEdges = page.locator(`#mount svg path.mining-lib-edge[data-to="${DRAG_TARGET}"]`);

    const outCount = await outEdges.count();
    const inCount = await inEdges.count();
    expect(outCount + inCount).toBeGreaterThan(0);

    for (let i = 0; i < outCount; i++) {
      const d = (await outEdges.nth(i).getAttribute("d")) ?? "";
      const parsed = parseCatmullRom(d);
      expect(parsed, `out-edge ${i} should be a Catmull-Rom path, got ${d}`).not.toBeNull();
      if (!parsed) continue;
      expect(parsed.segmentCount).toBeGreaterThanOrEqual(1);
    }

    for (let i = 0; i < inCount; i++) {
      const d = (await inEdges.nth(i).getAttribute("d")) ?? "";
      const parsed = parseCatmullRom(d);
      expect(parsed, `in-edge ${i} should be a Catmull-Rom path, got ${d}`).not.toBeNull();
      if (!parsed) continue;
      expect(parsed.segmentCount).toBeGreaterThanOrEqual(1);
    }
  });

  test("1-pixel drag does not restructure the edge path (no drag-start pop)", async ({ page }) => {
    const node = page.locator(`#mount svg g.mining-lib-node[data-activity="${DRAG_TARGET}"]`);
    await node.scrollIntoViewIfNeeded();

    const edgeDs = async () =>
      page
        .locator(
          `#mount svg path.mining-lib-edge[data-from="${DRAG_TARGET}"], ` +
            `#mount svg path.mining-lib-edge[data-to="${DRAG_TARGET}"]`,
        )
        .evaluateAll((els) => els.map((el) => el.getAttribute("d") ?? ""));

    const before = await edgeDs();
    expect(before.length).toBeGreaterThan(0);

    await dragNode(page, DRAG_TARGET, 1, 1);
    const after = await edgeDs();
    expect(after.length).toBe(before.length);

    for (let i = 0; i < before.length; i++) {
      const beforeSegments = (before[i] ?? "").match(/C/g)?.length ?? 0;
      const afterSegments = (after[i] ?? "").match(/C/g)?.length ?? 0;
      expect(
        afterSegments,
        `edge ${i} segment count changed: before=${beforeSegments}, after=${afterSegments}`,
      ).toBe(beforeSegments);
    }
  });

  test("count-mode switch preserves dragged positions", async ({ page }) => {
    const { to: afterDrag } = await dragNode(page, DRAG_TARGET, 200, 150);

    await page.evaluate(() => {
      (
        window as unknown as { __diagram: { setCountMode(m: string): void } }
      ).__diagram.setCountMode("case");
    });

    const afterMode = await nodeCenter(page, DRAG_TARGET);
    expect(Math.abs(afterMode.x - afterDrag.x)).toBeLessThan(2);
    expect(Math.abs(afterMode.y - afterDrag.y)).toBeLessThan(2);
  });

  test("handle.render(newDfg) clears dragged positions", async ({ page }) => {
    const { to: afterDrag } = await dragNode(page, DRAG_TARGET, 200, 150);

    await page.evaluate(async () => {
      const mod = (
        window as unknown as {
          MiningLib: {
            parseCsv(text: string): { log: unknown };
            buildDfg(log: unknown): unknown;
          };
          __diagram: { render(dfg: unknown): void };
        }
      ).MiningLib;
      const text = await fetch("/runs/n5-fixture/events.csv").then((r) => r.text());
      const { log } = mod.parseCsv(text);
      const fresh = mod.buildDfg(log);
      (window as unknown as { __diagram: { render(dfg: unknown): void } }).__diagram.render(fresh);
    });

    const afterRender = await nodeCenter(page, DRAG_TARGET);
    const dx = afterRender.x - afterDrag.x;
    const dy = afterRender.y - afterDrag.y;
    const distance = Math.hypot(dx, dy);
    expect(distance, "fresh Dfg should reset the node back to dagre's position").toBeGreaterThan(
      10,
    );
  });

  test("marker-end attribute stays attached through the drag", async ({ page }) => {
    const edges = page.locator(
      `#mount svg path.mining-lib-edge[data-from="${DRAG_TARGET}"], ` +
        `#mount svg path.mining-lib-edge[data-to="${DRAG_TARGET}"]`,
    );
    const count = await edges.count();
    expect(count).toBeGreaterThan(0);

    const node = page.locator(`#mount svg g.mining-lib-node[data-activity="${DRAG_TARGET}"]`);
    await node.scrollIntoViewIfNeeded();
    await node.hover();
    const start = await nodeCenter(page, DRAG_TARGET);
    await page.mouse.down();
    await page.mouse.move(start.x + 80, start.y + 60, { steps: 10 });

    for (let i = 0; i < count; i++) {
      const marker = await edges.nth(i).getAttribute("marker-end");
      expect(marker).toBe("url(#mining-lib-arrow)");
    }
    await page.mouse.up();

    for (let i = 0; i < count; i++) {
      const marker = await edges.nth(i).getAttribute("marker-end");
      expect(marker).toBe("url(#mining-lib-arrow)");
    }
  });

  test("edge stroke ends ARROW_CLEARANCE units before the dragged node's border", async ({
    page,
  }) => {
    const ARROW_CLEARANCE = 10;
    await dragNode(page, DRAG_TARGET, 200, 150);

    const center = await nodeWorldCenter(page, DRAG_TARGET);
    const size = await page
      .locator(`#mount svg g.mining-lib-node[data-activity="${DRAG_TARGET}"] rect`)
      .evaluate((rect) => ({
        width: Number(rect.getAttribute("width") ?? 0),
        height: Number(rect.getAttribute("height") ?? 0),
      }));
    const halfW = size.width / 2;
    const halfH = size.height / 2;

    const inEdges = page.locator(`#mount svg path.mining-lib-edge[data-to="${DRAG_TARGET}"]`);
    const inCount = await inEdges.count();
    expect(inCount).toBeGreaterThan(0);

    for (let i = 0; i < inCount; i++) {
      const d = (await inEdges.nth(i).getAttribute("d")) ?? "";
      const parsed = parseCatmullRom(d);
      expect(parsed, `in-edge ${i} d="${d}" should be a Catmull-Rom path`).not.toBeNull();
      if (!parsed) continue;
      const dx = parsed.end.x - center.x;
      const dy = parsed.end.y - center.y;
      // End point should be outside the node rect by ARROW_CLEARANCE along one axis.
      const signedClearX = Math.abs(dx) - halfW;
      const signedClearY = Math.abs(dy) - halfH;
      const clearance = Math.max(signedClearX, signedClearY);
      // endpointOnNode places the endpoint ARROW_CLEARANCE units along the
      // approach direction past the border. For diagonal edges the
      // max-projection clearance the test computes is
      // ARROW_CLEARANCE × cos(angle), which can be as low as ~7 for a 45°
      // approach. Lower bound reflects that geometric reality.
      expect(
        clearance,
        `in-edge ${i} should end ~${ARROW_CLEARANCE} units past the node border; got ${clearance.toFixed(2)} (dx=${dx.toFixed(2)}, dy=${dy.toFixed(2)})`,
      ).toBeGreaterThan(ARROW_CLEARANCE * 0.7);
      expect(clearance).toBeLessThan(ARROW_CLEARANCE + 2);
    }
  });

  test("drag on SVG background still pans the viewport", async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown as { __diagram: { zoomTo(k: number): void } }).__diagram.zoomTo(3);
    });

    const viewport = page.locator("#mount svg .mining-lib-viewport");
    const before = (await viewport.getAttribute("transform")) ?? "";

    const svg = page.locator("#mount svg.mining-lib-svg");
    const box = await svg.boundingBox();
    if (!box) throw new Error("svg not visible");

    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y + 80, { steps: 10 });
    await page.mouse.up();

    const after = (await viewport.getAttribute("transform")) ?? "";
    expect(after).not.toBe(before);
    expect(after).toMatch(/translate\(/);
  });

  test("first render draws every edge as a smooth cubic curve", async ({ page }) => {
    const ds = await page
      .locator("#mount svg path.mining-lib-edge")
      .evaluateAll((els) => els.map((el) => el.getAttribute("d") ?? ""));
    expect(ds.length).toBeGreaterThan(0);
    for (const d of ds) {
      expect(d, "edge d attribute must use cubic-bezier segments").toMatch(/^M[^L]*C/);
      expect(d, "edge d attribute must not contain polyline L commands").not.toMatch(/\sL\s/);
    }
  });

  test("double-click resets both zoom and dragged positions (Phase 13: to fit-to-view)", async ({
    page,
  }) => {
    const originalWorld = await nodeWorldCenter(page, DRAG_TARGET);
    const initialScale = await page.evaluate(
      () =>
        (
          window as unknown as { __diagram: { getTransform(): { k: number } } }
        ).__diagram.getTransform().k,
    );

    await dragNode(page, DRAG_TARGET, 200, 150);
    const afterDragWorld = await nodeWorldCenter(page, DRAG_TARGET);
    expect(
      Math.hypot(afterDragWorld.x - originalWorld.x, afterDragWorld.y - originalWorld.y),
    ).toBeGreaterThan(50);

    await page.evaluate(() => {
      (window as unknown as { __diagram: { zoomTo(k: number): void } }).__diagram.zoomTo(3);
    });

    await page.locator("#mount svg.mining-lib-svg").dblclick();

    const afterScale = await page.evaluate(
      () =>
        (
          window as unknown as { __diagram: { getTransform(): { k: number } } }
        ).__diagram.getTransform().k,
    );
    expect(afterScale).toBeCloseTo(initialScale, 5);

    const afterResetWorld = await nodeWorldCenter(page, DRAG_TARGET);
    expect(Math.abs(afterResetWorld.x - originalWorld.x)).toBeLessThan(2);
    expect(Math.abs(afterResetWorld.y - originalWorld.y)).toBeLessThan(2);
  });

  test("handle.resetView() clears dragged positions", async ({ page }) => {
    const originalWorld = await nodeWorldCenter(page, DRAG_TARGET);
    await dragNode(page, DRAG_TARGET, 200, 150);

    await page.evaluate(() => {
      (window as unknown as { __diagram: { resetView(): void } }).__diagram.resetView();
    });

    const afterResetWorld = await nodeWorldCenter(page, DRAG_TARGET);
    expect(Math.abs(afterResetWorld.x - originalWorld.x)).toBeLessThan(2);
    expect(Math.abs(afterResetWorld.y - originalWorld.y)).toBeLessThan(2);
  });
});
