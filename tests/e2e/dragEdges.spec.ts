import { expect, type Locator, type Page, test } from "@playwright/test";

type Point = { x: number; y: number };

type HandleRef = {
  from: string;
  to: string;
  index: number;
};

async function firstHandle(page: Page): Promise<{ ref: HandleRef; locator: Locator }> {
  const locator = page.locator("#mount svg circle.mining-lib-bend-handle").first();
  await expect(locator).toBeVisible();
  const ref = await locator.evaluate((el) => ({
    from: el.getAttribute("data-from") ?? "",
    to: el.getAttribute("data-to") ?? "",
    index: Number(el.getAttribute("data-index") ?? "-1"),
  }));
  return { ref, locator };
}

async function handleByRef(page: Page, ref: HandleRef): Promise<Locator> {
  return page.locator(
    `#mount svg circle.mining-lib-bend-handle[data-from="${ref.from}"][data-to="${ref.to}"][data-index="${ref.index}"]`,
  );
}

async function handleWorldCenter(handle: Locator): Promise<Point> {
  return handle.evaluate((c) => ({
    x: Number(c.getAttribute("cx")),
    y: Number(c.getAttribute("cy")),
  }));
}

async function handleScreenCenter(handle: Locator): Promise<Point> {
  const box = await handle.boundingBox();
  if (!box) throw new Error("handle not visible");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function dragHandle(
  page: Page,
  handle: Locator,
  dx: number,
  dy: number,
): Promise<{ from: Point; to: Point }> {
  await handle.scrollIntoViewIfNeeded();
  const from = await handleScreenCenter(handle);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 20 });
  await page.mouse.up();
  const to = await handleScreenCenter(handle);
  return { from, to };
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

async function nodeScreenCenter(page: Page, activity: string): Promise<Point> {
  const box = await page
    .locator(`#mount svg g.mining-lib-node[data-activity="${activity}"]`)
    .boundingBox();
  if (!box) throw new Error(`node "${activity}" not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function dragNode(
  page: Page,
  activity: string,
  dx: number,
  dy: number,
): Promise<{ from: Point; to: Point }> {
  const node = page.locator(`#mount svg g.mining-lib-node[data-activity="${activity}"]`);
  await node.scrollIntoViewIfNeeded();
  await node.hover();
  const from = await nodeScreenCenter(page, activity);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 20 });
  await page.mouse.up();
  const to = await nodeScreenCenter(page, activity);
  return { from, to };
}

function countCSegments(d: string): number {
  return d.match(/C/g)?.length ?? 0;
}

test.describe("edge bend drag", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/render.built.html");
    await expect(page.locator("#mount svg .mining-lib-viewport")).toBeVisible();
  });

  test("each edge renders exactly one bend handle", async ({ page }) => {
    const handles = page.locator("#mount svg circle.mining-lib-bend-handle");
    const edges = page.locator("#mount svg path.mining-lib-edge");
    const handleCount = await handles.count();
    const edgeCount = await edges.count();
    expect(edgeCount).toBeGreaterThan(0);
    expect(handleCount).toBe(edgeCount);

    const grouped = await handles.evaluateAll((els) => {
      const counts = new Map<string, number>();
      for (const el of els) {
        const key = `${el.getAttribute("data-from")}→${el.getAttribute("data-to")}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return [...counts.values()];
    });
    for (const count of grouped) {
      expect(count).toBe(1);
    }
  });

  test("each visible handle has a transparent hit ring at the same waypoint", async ({ page }) => {
    const visible = page.locator("#mount svg circle.mining-lib-bend-handle");
    const hits = page.locator("#mount svg circle.mining-lib-bend-handle-hit");
    expect(await visible.count()).toBe(await hits.count());
    const sample = await visible.first().evaluate((el) => ({
      from: el.getAttribute("data-from"),
      to: el.getAttribute("data-to"),
      index: el.getAttribute("data-index"),
      cx: Number(el.getAttribute("cx")),
      cy: Number(el.getAttribute("cy")),
      r: Number(el.getAttribute("r")),
    }));
    const hit = page.locator(
      `#mount svg circle.mining-lib-bend-handle-hit[data-from="${sample.from}"][data-to="${sample.to}"][data-index="${sample.index}"]`,
    );
    const hitAttrs = await hit.evaluate((el) => ({
      cx: Number(el.getAttribute("cx")),
      cy: Number(el.getAttribute("cy")),
      r: Number(el.getAttribute("r")),
    }));
    expect(hitAttrs.cx).toBeCloseTo(sample.cx, 3);
    expect(hitAttrs.cy).toBeCloseTo(sample.cy, 3);
    expect(hitAttrs.r).toBeGreaterThan(sample.r);
  });

  test("drag yields a clean two-segment bend that pivots through the cursor", async ({ page }) => {
    // Every edge renders as a two-C-segment Catmull-Rom curve through
    // the handle anchor at rest. After a drag, the polyline is still
    // exactly [start, dragged, end] (two C segments) but the middle
    // waypoint is wherever the cursor released. This proves the
    // collapse-on-start mutation persisted: the underlying polyline is
    // 3-point, regardless of how many points dagre originally laid.
    const { ref, locator } = await firstHandle(page);
    const beforeScreen = await handleScreenCenter(locator);

    await page.mouse.move(beforeScreen.x, beforeScreen.y);
    await page.mouse.down();
    await page.mouse.move(beforeScreen.x + 50, beforeScreen.y + 40, { steps: 20 });
    await page.mouse.up();

    // Handle sticks to the cursor: screen-pixel delta matches input regardless
    // of the svg's viewBox-to-css-pixel ratio.
    const afterScreen = await handleScreenCenter(locator);
    expect(afterScreen.x - beforeScreen.x).toBeGreaterThan(48);
    expect(afterScreen.x - beforeScreen.x).toBeLessThan(52);
    expect(afterScreen.y - beforeScreen.y).toBeGreaterThan(38);
    expect(afterScreen.y - beforeScreen.y).toBeLessThan(42);

    const afterWorld = await handleWorldCenter(locator);
    const edgeD =
      (await page
        .locator(`#mount svg path.mining-lib-edge[data-from="${ref.from}"][data-to="${ref.to}"]`)
        .getAttribute("d")) ?? "";

    expect(countCSegments(edgeD)).toBe(2);

    const segmentRx =
      /C\s+([-0-9.eE+]+)\s+([-0-9.eE+]+),\s*([-0-9.eE+]+)\s+([-0-9.eE+]+),\s*([-0-9.eE+]+)\s+([-0-9.eE+]+)/g;
    const segments = [...edgeD.matchAll(segmentRx)];
    const first = segments[0];
    expect(first, `expected at least one C segment in d="${edgeD}"`).toBeDefined();
    if (!first) return;
    const ex = Number(first[5]);
    const ey = Number(first[6]);
    expect(Math.abs(ex - afterWorld.x)).toBeLessThan(2);
    expect(Math.abs(ey - afterWorld.y)).toBeLessThan(2);
  });

  test("every edge renders a clean two-segment bend at rest", async ({ page }) => {
    // Rest-state collapse: even before any drag, the rendered path is a
    // [start, anchor, end] Catmull-Rom curve so the visible shape matches
    // what the user sees during/after drag (no shape jump on grab).
    const edges = page.locator("#mount svg path.mining-lib-edge");
    const ds = await edges.evaluateAll((paths) => paths.map((p) => p.getAttribute("d") ?? ""));
    expect(ds.length).toBeGreaterThan(0);
    for (const d of ds) {
      const c = d.match(/C/g)?.length ?? 0;
      expect(c).toBe(2);
    }
  });

  test("a straight 2-point edge also exposes a draggable bend handle", async ({ page }) => {
    // Find any edge whose pre-drag d has exactly one C segment — i.e. the
    // dagre-routed polyline is straight (length === 2). Its handle sits at
    // the geometric midpoint and should still be draggable.
    const edges = page.locator("#mount svg path.mining-lib-edge");
    const total = await edges.count();
    let target: { from: string; to: string } | null = null;
    for (let i = 0; i < total; i++) {
      const edge = edges.nth(i);
      const d = (await edge.getAttribute("d")) ?? "";
      if (countCSegments(d) === 1) {
        target = {
          from: (await edge.getAttribute("data-from")) ?? "",
          to: (await edge.getAttribute("data-to")) ?? "",
        };
        break;
      }
    }
    test.skip(!target, "no straight 2-point edge in this fixture");
    if (!target) return;

    const handle = page.locator(
      `#mount svg circle.mining-lib-bend-handle[data-from="${target.from}"][data-to="${target.to}"]`,
    );
    await expect(handle).toBeVisible();
    const beforeScreen = await handleScreenCenter(handle);

    await page.mouse.move(beforeScreen.x, beforeScreen.y);
    await page.mouse.down();
    await page.mouse.move(beforeScreen.x + 30, beforeScreen.y + 30, { steps: 15 });
    await page.mouse.up();

    const afterScreen = await handleScreenCenter(handle);
    expect(afterScreen.x - beforeScreen.x).toBeGreaterThan(28);
    expect(afterScreen.x - beforeScreen.x).toBeLessThan(32);
    expect(afterScreen.y - beforeScreen.y).toBeGreaterThan(28);
    expect(afterScreen.y - beforeScreen.y).toBeLessThan(32);

    const after =
      (await page
        .locator(
          `#mount svg path.mining-lib-edge[data-from="${target.from}"][data-to="${target.to}"]`,
        )
        .getAttribute("d")) ?? "";
    expect(countCSegments(after)).toBe(2);
  });

  test("bend override survives setCountMode", async ({ page }) => {
    const { locator } = await firstHandle(page);
    await dragHandle(page, locator, 50, 40);
    const after = await handleWorldCenter(locator);

    await page.evaluate(() => {
      (
        window as unknown as { __diagram: { setCountMode(m: string): void } }
      ).__diagram.setCountMode("case");
    });

    const afterMode = await handleWorldCenter(locator);
    expect(Math.abs(afterMode.x - after.x)).toBeLessThan(2);
    expect(Math.abs(afterMode.y - after.y)).toBeLessThan(2);
  });

  test("node drag preserves the bend overrides on incident edges", async ({ page }) => {
    const { ref, locator } = await firstHandle(page);
    await dragHandle(page, locator, 50, 40);
    const postBend = await handleWorldCenter(locator);

    const incidentNode = ref.from;
    await dragNode(page, incidentNode, 80, 0);

    const postNodeDrag = await handleWorldCenter(locator);
    expect(Math.abs(postNodeDrag.x - postBend.x)).toBeLessThan(2);
    expect(Math.abs(postNodeDrag.y - postBend.y)).toBeLessThan(2);
  });

  test("double-click resets both bend and node overrides", async ({ page }) => {
    const { ref, locator } = await firstHandle(page);
    const originalWorld = await handleWorldCenter(locator);

    await dragHandle(page, locator, 50, 40);
    const draggedWorld = await handleWorldCenter(locator);
    expect(
      Math.hypot(draggedWorld.x - originalWorld.x, draggedWorld.y - originalWorld.y),
    ).toBeGreaterThan(20);

    const incidentNode = ref.from;
    const originalNodeWorld = await nodeWorldCenter(page, incidentNode);
    await dragNode(page, incidentNode, 80, 0);

    await page.locator("#mount svg.mining-lib-svg").dblclick();

    const resetHandle = await handleByRef(page, ref);
    const resetWorld = await handleWorldCenter(resetHandle);
    expect(Math.abs(resetWorld.x - originalWorld.x)).toBeLessThan(2);
    expect(Math.abs(resetWorld.y - originalWorld.y)).toBeLessThan(2);

    const resetNodeWorld = await nodeWorldCenter(page, incidentNode);
    expect(Math.abs(resetNodeWorld.x - originalNodeWorld.x)).toBeLessThan(2);
    expect(Math.abs(resetNodeWorld.y - originalNodeWorld.y)).toBeLessThan(2);
  });

  test("handle.resetView() clears bend overrides", async ({ page }) => {
    const { ref, locator } = await firstHandle(page);
    const originalWorld = await handleWorldCenter(locator);
    await dragHandle(page, locator, 50, 40);

    await page.evaluate(() => {
      (window as unknown as { __diagram: { resetView(): void } }).__diagram.resetView();
    });

    const resetHandle = await handleByRef(page, ref);
    const resetWorld = await handleWorldCenter(resetHandle);
    expect(Math.abs(resetWorld.x - originalWorld.x)).toBeLessThan(2);
    expect(Math.abs(resetWorld.y - originalWorld.y)).toBeLessThan(2);
  });

  test("handle.render(newDfg) clears bend overrides", async ({ page }) => {
    const { ref, locator } = await firstHandle(page);
    const original = await handleWorldCenter(locator);
    await dragHandle(page, locator, 50, 40);
    const dragged = await handleWorldCenter(locator);
    expect(Math.hypot(dragged.x - original.x, dragged.y - original.y)).toBeGreaterThan(20);

    await page.evaluate(async () => {
      const lib = (
        window as unknown as {
          MiningLib: {
            parseCsv(text: string): { log: unknown };
            buildDfg(log: unknown): unknown;
          };
          __diagram: { render(dfg: unknown): void };
        }
      ).MiningLib;
      const text = await fetch("/runs/n5-fixture/events.csv").then((r) => r.text());
      const { log } = lib.parseCsv(text);
      const fresh = lib.buildDfg(log);
      (window as unknown as { __diagram: { render(dfg: unknown): void } }).__diagram.render(fresh);
    });

    const restored = await handleByRef(page, ref);
    const restoredWorld = await handleWorldCenter(restored);
    expect(Math.abs(restoredWorld.x - original.x)).toBeLessThan(2);
    expect(Math.abs(restoredWorld.y - original.y)).toBeLessThan(2);
  });

  test("drag on SVG background still pans (handles do not capture pan gestures)", async ({
    page,
  }) => {
    const viewport = page.locator("#mount svg .mining-lib-viewport");
    const before = (await viewport.getAttribute("transform")) ?? "";

    const svg = page.locator("#mount svg.mining-lib-svg");
    const box = await svg.boundingBox();
    if (!box) throw new Error("svg not visible");

    await page.mouse.move(box.x + 5, box.y + 5);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y + 80, { steps: 10 });
    await page.mouse.up();

    const after = (await viewport.getAttribute("transform")) ?? "";
    expect(after).not.toBe(before);
  });

  test("off-centre click inside the hit ring still grabs the handle", async ({ page }) => {
    const { locator } = await firstHandle(page);
    const beforeScreen = await handleScreenCenter(locator);
    const beforeWorld = await handleWorldCenter(locator);

    // Click 7 px right of the visible centre — outside r=4 visible,
    // inside r=10 hit ring.
    await page.mouse.move(beforeScreen.x + 7, beforeScreen.y);
    await page.mouse.down();
    await page.mouse.move(beforeScreen.x + 7 + 30, beforeScreen.y + 30, { steps: 15 });
    await page.mouse.up();

    const afterWorld = await handleWorldCenter(locator);
    expect(afterWorld.x).not.toBe(beforeWorld.x);
    expect(afterWorld.y).not.toBe(beforeWorld.y);
  });

  test("zoomed drag tracks the cursor 1:1 in screen pixels", async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown as { __diagram: { zoomTo(k: number): void } }).__diagram.zoomTo(1.5);
    });

    // d3-zoom can render handles outside the SVG bounding box at non-default
    // zoom (no clip). Pick the first handle whose BCR centre falls strictly
    // inside the SVG's BCR so the cursor lands on a real hit ring, not an
    // overlapping page element above/around the canvas.
    const svgBox = await page.locator("#mount svg.mining-lib-svg").boundingBox();
    if (!svgBox) throw new Error("svg not visible");
    const handles = page.locator("#mount svg circle.mining-lib-bend-handle");
    const total = await handles.count();
    let beforeScreen: Point | null = null;
    let locator = handles.first();
    for (let i = 0; i < total; i++) {
      const candidate = handles.nth(i);
      const box = await candidate.boundingBox();
      if (!box) continue;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      if (
        cx > svgBox.x + 20 &&
        cx < svgBox.x + svgBox.width - 20 &&
        cy > svgBox.y + 20 &&
        cy < svgBox.y + svgBox.height - 60
      ) {
        locator = candidate;
        beforeScreen = { x: cx, y: cy };
        break;
      }
    }
    if (!beforeScreen) throw new Error("no on-canvas handle at k=1.5");

    await page.mouse.move(beforeScreen.x, beforeScreen.y);
    await page.mouse.down();
    await page.mouse.move(beforeScreen.x + 50, beforeScreen.y + 30, { steps: 20 });
    await page.mouse.up();

    const afterScreen = await handleScreenCenter(locator);
    expect(afterScreen.x - beforeScreen.x).toBeGreaterThan(48);
    expect(afterScreen.x - beforeScreen.x).toBeLessThan(52);
    expect(afterScreen.y - beforeScreen.y).toBeGreaterThan(28);
    expect(afterScreen.y - beforeScreen.y).toBeLessThan(32);
  });
});
