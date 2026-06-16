import { expect, type Page, test } from "@playwright/test";

// export-image.built.html auto-loads the n5 fixture through loadLog and exposes
// window.__diagram (the DiagramHandle) + window.__lastLoad once rendered.
// The utilities-pill download icon carries data-popover="export"; the
// page's own Download SVG / PNG buttons live at #download-svg / #download-png.
// The UMD global is MiningLib. Each test gets a fresh browser context.

const PAGE = "/export-image.built.html?fixture=n5-fixture";
const NODE = "#mount mining-lib-diagram svg.mining-lib-svg g.mining-lib-node";
const LIVE_VIEWPORT = "#mount mining-lib-diagram svg.mining-lib-svg g.mining-lib-viewport";
const BEND = "#mount mining-lib-diagram svg.mining-lib-svg circle.mining-lib-bend-handle";

type ExportHandle = {
  exportSvg(): string;
  exportPng(opts?: { scale?: number }): Promise<Blob>;
  getVariants(): { sequence: string[] }[];
  setVariantFilter(sigs: string[] | null): void;
  zoomTo(k: number): void;
};
type ExportWindow = { __lastLoad?: unknown; __diagram: ExportHandle };

async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as ExportWindow).__lastLoad !== undefined);
  await expect(page.locator(NODE).first()).toBeVisible();
}

async function exportViewBox(
  page: Page,
): Promise<{ minX: number; minY: number; width: number; height: number }> {
  const vb = await page.evaluate(
    () =>
      new DOMParser()
        .parseFromString((window as unknown as ExportWindow).__diagram.exportSvg(), "image/svg+xml")
        .documentElement.getAttribute("viewBox") ?? "",
  );
  const [minX = 0, minY = 0, width = 0, height = 0] = vb.split(" ").map(Number);
  return { minX, minY, width, height };
}

test("exportSvg returns a self-contained, renderable SVG of the full n5 graph", async ({
  page,
}) => {
  await page.goto(PAGE);
  await waitForReady(page);

  const info = await page.evaluate(async () => {
    const svg = (window as unknown as ExportWindow).__diagram.exportSvg();
    const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
    const img = new Image();
    const loaded = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
    return {
      startsWithSvg: svg.trimStart().startsWith("<svg"),
      styles: root.querySelectorAll("style").length,
      nodes: root.querySelectorAll("g.mining-lib-node").length,
      edges: root.querySelectorAll("path.mining-lib-edge").length,
      loaded,
      naturalWidth: img.naturalWidth,
    };
  });

  expect(info.startsWithSvg).toBe(true);
  expect(info.styles).toBe(1);
  expect(info.nodes).toBe(9);
  expect(info.edges).toBe(10);
  expect(info.loaded).toBe(true);
  expect(info.naturalWidth).toBeGreaterThan(0);
});

test("export captures the full graph at identity transform, ignoring pan/zoom", async ({
  page,
}) => {
  await page.goto(PAGE);
  await waitForReady(page);

  // Export at rest, then zoom the live view and export again.
  const before = await page.evaluate(() =>
    new DOMParser()
      .parseFromString((window as unknown as ExportWindow).__diagram.exportSvg(), "image/svg+xml")
      .documentElement.getAttribute("viewBox"),
  );

  await page.evaluate(() => (window as unknown as ExportWindow).__diagram.zoomTo(2.5));
  // The live viewport now carries a non-identity transform.
  const liveTransform = await page.locator(LIVE_VIEWPORT).getAttribute("transform");
  expect(liveTransform).toBeTruthy();

  const after = await page.evaluate(() => {
    const root = new DOMParser().parseFromString(
      (window as unknown as ExportWindow).__diagram.exportSvg(),
      "image/svg+xml",
    ).documentElement;
    return {
      viewBox: root.getAttribute("viewBox"),
      viewportTransform:
        root.querySelector("g.mining-lib-viewport")?.getAttribute("transform") ?? null,
    };
  });

  // The export is identical before/after zoom (transient pan/zoom discarded)…
  expect(after.viewBox).toBe(before);
  // …its content group is at identity (the live transform was dropped)…
  expect(after.viewportTransform).toBeNull();
  // …and the viewBox is the full-layout box (0 0 w h, all finite/positive).
  const parts = (after.viewBox ?? "").split(" ").map(Number);
  expect(parts).toHaveLength(4);
  expect(parts[0]).toBe(0);
  expect(parts[1]).toBe(0);
  expect(parts[2]).toBeGreaterThan(0);
  expect(parts[3]).toBeGreaterThan(0);
});

test("export reflects an active variant filter (fewer edges)", async ({ page }) => {
  await page.goto(PAGE);
  await waitForReady(page);

  const counts = await page.evaluate(() => {
    const d = (window as unknown as ExportWindow).__diagram;
    const countEdges = (svg: string) =>
      new DOMParser()
        .parseFromString(svg, "image/svg+xml")
        .documentElement.querySelectorAll("path.mining-lib-edge").length;
    const full = countEdges(d.exportSvg());
    const shortest = d
      .getVariants()
      .slice()
      .sort((a, b) => a.sequence.length - b.sequence.length)[0];
    if (!shortest) throw new Error("expected at least one variant");
    d.setVariantFilter([JSON.stringify(shortest.sequence)]);
    return { full, filtered: countEdges(d.exportSvg()) };
  });

  expect(counts.filtered).toBeGreaterThan(0);
  expect(counts.filtered).toBeLessThan(counts.full);
});

test("exportPng yields an opaque image/png at viewBox × scale", async ({ page }) => {
  await page.goto(PAGE);
  await waitForReady(page);

  const info = await page.evaluate(async () => {
    const d = (window as unknown as ExportWindow).__diagram;
    const vb =
      new DOMParser()
        .parseFromString(d.exportSvg(), "image/svg+xml")
        .documentElement.getAttribute("viewBox") ?? "";
    const [, , wStr, hStr] = vb.split(" ");
    const blob = await d.exportPng({ scale: 2 });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("png load failed"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    let cornerAlpha = 0;
    if (ctx) {
      ctx.drawImage(img, 0, 0);
      cornerAlpha = ctx.getImageData(0, 0, 1, 1).data[3] ?? 0;
    }
    URL.revokeObjectURL(url);
    return {
      type: blob.type,
      size: blob.size,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      expectedW: Math.round(Number(wStr) * 2),
      expectedH: Math.round(Number(hStr) * 2),
      cornerAlpha,
    };
  });

  expect(info.type).toBe("image/png");
  expect(info.size).toBeGreaterThan(0);
  expect(info.naturalWidth).toBe(info.expectedW);
  expect(info.naturalHeight).toBe(info.expectedH);
  // Default theme bg is transparent → export falls back to an opaque white.
  expect(info.cornerAlpha).toBe(255);
});

test("the download icon opens an SVG/PNG menu and downloads a PNG", async ({ page }) => {
  await page.goto(PAGE);
  await waitForReady(page);

  await page.locator('#mount mining-lib-diagram button[data-popover="export"]').click();
  const svgOption = page.locator(
    '#mount mining-lib-diagram .mining-lib-popover button[data-format="svg"]',
  );
  const pngOption = page.locator(
    '#mount mining-lib-diagram .mining-lib-popover button[data-format="png"]',
  );
  await expect(svgOption).toBeVisible();
  await expect(pngOption).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await pngOption.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("process-diagram.png");
});

test("export frames content dragged outside the dagre layout box (no clipping)", async ({
  page,
}) => {
  // Small host → fit-to-view scale ≤ 1, leaving viewport room to the
  // right of the host to drag a bend handle well past the layout box.
  await page.goto("/export-image.built.html?fixture=n5-fixture&w=640&h=480");
  await waitForReady(page);

  const before = await exportViewBox(page);

  // Drag the first edge bend handle far to the right — reproduces the
  // "move edges to the right" report.
  const handle = page.locator(BEND).first();
  await expect(handle).toBeVisible();
  const ref = await handle.evaluate((el) => ({
    from: el.getAttribute("data-from") ?? "",
    to: el.getAttribute("data-to") ?? "",
    index: el.getAttribute("data-index") ?? "",
  }));
  const box = await handle.boundingBox();
  if (!box) throw new Error("bend handle not visible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(1700, box.y + box.height / 2, { steps: 20 });
  await page.mouse.up();

  const draggedCx = await page
    .locator(`${BEND}[data-from="${ref.from}"][data-to="${ref.to}"][data-index="${ref.index}"]`)
    .evaluate((c) => Number(c.getAttribute("cx")));

  // Precondition: the drag pushed the bend past the old frame's right
  // edge — otherwise the test wouldn't exercise the bug.
  expect(draggedCx).toBeGreaterThan(before.minX + before.width);

  // Requirement: the export frames the dragged content — its right edge
  // reaches at least the dragged point, so nothing is clipped.
  const after = await exportViewBox(page);
  expect(after.minX + after.width).toBeGreaterThanOrEqual(draggedCx);
});
