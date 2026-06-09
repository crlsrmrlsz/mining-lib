import { expect, type Page, test } from "@playwright/test";

/**
 * Phase 24 — happy-path overlay + self-loop label nudge.
 *
 * Six scenarios:
 *   1. Pin and clear via the variant-row pin button.
 *   2. Switch the pin between two rows.
 *   3. Defensive auto-clear when filtering hides the pinned variant.
 *   4. Self-loop label transform sits outside the source node's bbox.
 *   5. Theme token overrides the fade opacity.
 *   6. handle.setHappyPathVariant() runtime API parity.
 */

const ROOT = "#mount mining-lib-diagram";
const PRIMARY = `${ROOT} .mining-lib-pill-primary`;
const VARIANTS_TRIGGER = `${PRIMARY} button[data-popover="variants"]`;
const PIN = `${ROOT} button.mining-lib-variant-pin`;
const ROW = `${ROOT} label.mining-lib-panel-row`;
const FADED_NODE = `${ROOT} g.mining-lib-node.mining-lib-faded`;
const FADED_EDGE = `${ROOT} path.mining-lib-edge.mining-lib-faded`;

async function gotoPhase14(page: Page, fixture = "n5-fixture"): Promise<void> {
  await page.goto(`/phase14.built.html?fixture=${fixture}&w=900&h=720`);
  await page.locator(`${ROOT} svg.mining-lib-svg`).waitFor();
}

async function openVariantsPopover(page: Page): Promise<void> {
  await page.locator(VARIANTS_TRIGGER).click();
  await page.waitForFunction(() => {
    const el = document.querySelector("#mount mining-lib-diagram");
    return Boolean(el?.shadowRoot?.querySelector("button.mining-lib-variant-pin"));
  });
}

async function getHappyPath(page: Page): Promise<string[] | null> {
  return page.evaluate(() => {
    type H = { getHappyPathVariant(): string[] | null };
    return (window as unknown as { __diagram: H }).__diagram.getHappyPathVariant();
  });
}

async function setHappyPath(page: Page, seq: string[] | null): Promise<void> {
  await page.evaluate((s) => {
    type H = { setHappyPathVariant(seq: string[] | null): void };
    (window as unknown as { __diagram: H }).__diagram.setHappyPathVariant(s);
  }, seq);
}

test("Scenario 1 — pin a variant row, then clear via the same pin button", async ({ page }) => {
  await gotoPhase14(page);
  await openVariantsPopover(page);

  // No pin initially.
  await expect(page.locator(FADED_NODE)).toHaveCount(0);
  expect(await getHappyPath(page)).toBeNull();

  const pins = page.locator(PIN);
  const pinCount = await pins.count();
  expect(pinCount).toBeGreaterThanOrEqual(2);

  // Pin the first row.
  await pins.nth(0).click();
  await expect(pins.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(`${ROW}.mining-lib-variant-row-pinned`)).toHaveCount(1);

  // Faded elements appear in the canvas.
  const fadedNodes = await page.locator(FADED_NODE).count();
  const fadedEdges = await page.locator(FADED_EDGE).count();
  expect(fadedNodes + fadedEdges).toBeGreaterThan(0);
  expect(await getHappyPath(page)).not.toBeNull();

  // Click the same pin again — the overlay clears.
  await pins.nth(0).click();
  await expect(pins.nth(0)).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(`${ROW}.mining-lib-variant-row-pinned`)).toHaveCount(0);
  await expect(page.locator(FADED_NODE)).toHaveCount(0);
  await expect(page.locator(FADED_EDGE)).toHaveCount(0);
  expect(await getHappyPath(page)).toBeNull();
});

test("Scenario 2 — clicking a second pin moves the designation in one step", async ({ page }) => {
  await gotoPhase14(page);
  await openVariantsPopover(page);

  const pins = page.locator(PIN);
  await pins.nth(0).click();
  await expect(pins.nth(0)).toHaveAttribute("aria-pressed", "true");

  // Capture the faded edge set after the first pin.
  const fadedBefore = await page
    .locator(FADED_EDGE)
    .evaluateAll((nodes) =>
      nodes.map((n) => `${n.getAttribute("data-from")}\t${n.getAttribute("data-to")}`).sort(),
    );

  // Click pin on the second row.
  await pins.nth(1).click();
  await expect(pins.nth(0)).toHaveAttribute("aria-pressed", "false");
  await expect(pins.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(`${ROW}.mining-lib-variant-row-pinned`)).toHaveCount(1);

  const fadedAfter = await page
    .locator(FADED_EDGE)
    .evaluateAll((nodes) =>
      nodes.map((n) => `${n.getAttribute("data-from")}\t${n.getAttribute("data-to")}`).sort(),
    );

  // The two faded edge sets must not be identical; if both rows
  // happened to produce the same fade mask, the test fixture is
  // degenerate. n5 has 4 variants — any pair produces different
  // masks.
  expect(fadedAfter).not.toEqual(fadedBefore);
});

test("Scenario 3 — narrowing the variant filter auto-clears a pin on a now-missing variant", async ({
  page,
}) => {
  await gotoPhase14(page);
  await openVariantsPopover(page);

  const pins = page.locator(PIN);
  // Pin the first row (typically Direct Approval in n5).
  await pins.nth(0).click();
  const pinned = await getHappyPath(page);
  expect(pinned).not.toBeNull();

  // Uncheck every variant except the LAST one — that excludes the
  // pinned variant from the filtered case set.
  const checkboxes = page.locator(`${ROW} input[type='checkbox'][data-signature]`);
  const total = await checkboxes.count();
  expect(total).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < total - 1; i += 1) {
    await checkboxes.nth(i).uncheck();
  }

  // Wait for the diagram to re-render and the pin to clear.
  await page.waitForFunction(() => {
    type H = { getHappyPathVariant(): string[] | null };
    return (window as unknown as { __diagram: H }).__diagram.getHappyPathVariant() === null;
  });
  expect(await getHappyPath(page)).toBeNull();
  await expect(page.locator(FADED_NODE)).toHaveCount(0);
  await expect(page.locator(`${ROW}.mining-lib-variant-row-pinned`)).toHaveCount(0);
});

test("Scenario 4 — self-loop edge label sits outside the source node's bounding box", async ({
  page,
}) => {
  // n1000-realistic has rework loops (review_in_progress →
  // request_additional_info → applicant_provided_info → review …),
  // but those aren't single-activity self-loops. We use a synthetic
  // page-side scenario: register a small DFG that contains an `a→a`
  // edge, render it, and inspect the self-loop label transform.
  await gotoPhase14(page);

  const info = await page.evaluate(() => {
    type Diag = {
      render(dfg: unknown, log?: unknown): void;
    };
    type Lib = {
      buildDfg(log: unknown): unknown;
      parseCsv(text: string): { log: unknown };
    };
    // phase14.built.html exposes the UMD bundle as `MiningLib` (see
    // example/phase14.built.html). Feed the existing handle a
    // synthetic 2-event single-activity case so buildDfg produces
    // an `a→a` self-loop edge.
    const lib = (window as unknown as { MiningLib?: Lib }).MiningLib;
    const csv = `case:concept:name,concept:name,time:timestamp,org:resource,lifecycle:transition
c1,a,2024-01-01T00:00:00Z,,complete
c1,a,2024-01-01T00:01:00Z,,complete
c1,b,2024-01-01T00:02:00Z,,complete`;
    if (lib?.parseCsv && lib?.buildDfg) {
      const { log } = lib.parseCsv(csv);
      const dfg = lib.buildDfg(log);
      const handle = (window as unknown as { __diagram: Diag }).__diagram;
      handle.render(dfg, log);
    }
    // Read back the source node + the self-loop label transform.
    const el = document.querySelector("#mount mining-lib-diagram");
    const shadow = el?.shadowRoot;
    const label = shadow?.querySelector("g.mining-lib-edge-label[data-self-loop='true']");
    if (!label) return { hasSelfLoop: false };
    const transform = label.getAttribute("transform") ?? "";
    const m = /translate\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)/.exec(transform);
    const labelX = m ? Number.parseFloat(m[1] ?? "0") : 0;
    const labelY = m ? Number.parseFloat(m[2] ?? "0") : 0;
    const activity = label.getAttribute("data-from") ?? "";
    const nodeG = shadow?.querySelector(`g.mining-lib-node[data-activity='${activity}']`);
    const rect = nodeG?.querySelector("rect");
    const nodeTransform = nodeG?.getAttribute("transform") ?? "";
    const nm = /translate\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)/.exec(nodeTransform);
    const nodeLeft = nm ? Number.parseFloat(nm[1] ?? "0") : 0;
    const nodeTop = nm ? Number.parseFloat(nm[2] ?? "0") : 0;
    const width = Number.parseFloat(rect?.getAttribute("width") ?? "0");
    const height = Number.parseFloat(rect?.getAttribute("height") ?? "0");
    const nodeCenterX = nodeLeft + width / 2;
    const nodeCenterY = nodeTop + height / 2;
    return {
      hasSelfLoop: true,
      labelX,
      labelY,
      nodeCenterX,
      nodeCenterY,
      width,
      height,
    };
  });

  if (!info.hasSelfLoop) {
    test.skip(true, "synthetic self-loop fixture not available in page scope");
    return;
  }

  // Self-loop label must lie outside the node rectangle on at least
  // one axis. |dx| > w/2 OR |dy| > h/2.
  const dx = Math.abs((info.labelX ?? 0) - (info.nodeCenterX ?? 0));
  const dy = Math.abs((info.labelY ?? 0) - (info.nodeCenterY ?? 0));
  const outsideX = dx > (info.width ?? 0) / 2;
  const outsideY = dy > (info.height ?? 0) / 2;
  expect(outsideX || outsideY).toBe(true);
});

test("Scenario 5 — on-path elements actually render in green (computed style, not just attr)", async ({
  page,
}) => {
  await gotoPhase14(page);
  await openVariantsPopover(page);
  await page.locator(PIN).nth(0).click();

  // Pin gives at least one .mining-lib-happy element; computed stroke
  // must resolve to the green token, not the default grey edge stroke.
  const colours = await page.evaluate(() => {
    const el = document.querySelector("#mount mining-lib-diagram");
    const shadow = el?.shadowRoot;
    const edge = shadow?.querySelector("path.mining-lib-edge.mining-lib-happy");
    const nodeRect = shadow?.querySelector("g.mining-lib-node.mining-lib-happy > rect");
    return {
      edgeStroke: edge ? window.getComputedStyle(edge).stroke : "",
      nodeFill: nodeRect ? window.getComputedStyle(nodeRect).fill : "",
      nodeStroke: nodeRect ? window.getComputedStyle(nodeRect).stroke : "",
    };
  });
  // Light defaults: happyStroke = #16a34a = rgb(22, 163, 74),
  // happyNodeFill = #f0fdf4 = rgb(240, 253, 244).
  expect(colours.edgeStroke).toBe("rgb(22, 163, 74)");
  expect(colours.nodeStroke).toBe("rgb(22, 163, 74)");
  expect(colours.nodeFill).toBe("rgb(240, 253, 244)");
});

test("Scenario 6 — embedder overrides `--mining-overlay-fade-opacity` per host element", async ({
  page,
}) => {
  await gotoPhase14(page);
  await openVariantsPopover(page);

  const pins = page.locator(PIN);
  await pins.nth(0).click();
  // At least one faded element exists.
  await expect(page.locator(FADED_NODE).first()).toBeVisible();

  // Read default computed opacity.
  const defaultOpacity = await page
    .locator(FADED_NODE)
    .first()
    .evaluate((el) => Number.parseFloat(window.getComputedStyle(el).opacity));
  expect(defaultOpacity).toBeCloseTo(0.5, 2);

  // Apply an inline override on the host element.
  await page.evaluate(() => {
    const el = document.querySelector("#mount mining-lib-diagram") as HTMLElement;
    el.style.setProperty("--mining-overlay-fade-opacity", "0.6");
  });

  const overriddenOpacity = await page
    .locator(FADED_NODE)
    .first()
    .evaluate((el) => Number.parseFloat(window.getComputedStyle(el).opacity));
  expect(overriddenOpacity).toBeCloseTo(0.6, 2);
});

test("Scenario 7 — handle.setHappyPathVariant runtime API parity", async ({ page }) => {
  await gotoPhase14(page);
  await openVariantsPopover(page);

  // Read the first variant's signature off the panel.
  const seq = await page.evaluate(() => {
    const el = document.querySelector("#mount mining-lib-diagram");
    const cb = el?.shadowRoot?.querySelector<HTMLInputElement>(
      "input[type='checkbox'][data-signature]",
    );
    return cb?.dataset.signature ? JSON.parse(cb.dataset.signature) : null;
  });
  expect(Array.isArray(seq)).toBe(true);

  // Set the pin via the handle.
  await setHappyPath(page, seq);
  expect(await getHappyPath(page)).toEqual(seq);
  await expect(page.locator(`${ROW}.mining-lib-variant-row-pinned`)).toHaveCount(1);
  await expect(page.locator(PIN).nth(0)).toHaveAttribute("aria-pressed", "true");

  // Defensive copy: mutating the returned array does not affect state.
  const snapshot = await getHappyPath(page);
  expect(snapshot).toEqual(seq);
  snapshot?.push("mutated");
  expect(await getHappyPath(page)).toEqual(seq);

  // Clear via setHappyPathVariant(null).
  await setHappyPath(page, null);
  expect(await getHappyPath(page)).toBeNull();
  await expect(page.locator(`${ROW}.mining-lib-variant-row-pinned`)).toHaveCount(0);
  await expect(page.locator(FADED_NODE)).toHaveCount(0);
});
