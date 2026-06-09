import { expect, type Page, test } from "@playwright/test";

type ThemeOption = {
  dark?: boolean;
  nodeFill?: string;
  nodeStroke?: string;
  nodeText?: string;
  nodeMutedText?: string;
  edgeStroke?: string;
  edgeLabelText?: string;
  edgeLabelFill?: string;
  edgeLabelStroke?: string;
  background?: string;
  fontFamily?: string;
  fontSize?: number;
  nodeRadius?: number;
  nodePadding?: number;
  strokeWidth?: number;
};

declare global {
  interface Window {
    MiningLib: {
      createDiagram: (target: string, config: { theme?: ThemeOption }) => unknown;
      parseCsv: (text: string) => { log: unknown };
      buildDfg: (log: unknown) => unknown;
    };
    __freshDiagram: ReturnType<Window["MiningLib"]["createDiagram"]> & {
      render: (dfg: unknown) => void;
      setTheme: (partial: ThemeOption) => void;
      getTheme: () => ThemeOption;
    };
  }
}

async function loadFreshDiagram(page: Page, options: { theme?: ThemeOption } = {}) {
  await page.goto("/phase3.built.html");
  // Wait until the global UMD has registered and the page-bootstrap
  // diagram has rendered something — guarantees the fixture CSV is
  // already cached by the page's fetch().
  await page.waitForFunction(() =>
    Boolean((window as unknown as { __diagram?: unknown }).__diagram),
  );
  await page.evaluate(async (opts) => {
    document.querySelector("#mount")?.replaceChildren();
    const handle = window.MiningLib.createDiagram("#mount", opts);
    const response = await fetch("/runs/n5-fixture/events.csv");
    const text = await response.text();
    const { log } = window.MiningLib.parseCsv(text);
    const dfg = window.MiningLib.buildDfg(log);
    (handle as { render: (d: unknown) => void }).render(dfg);
    window.__freshDiagram = handle as Window["__freshDiagram"];
  }, options);
}

async function readHostVar(page: Page, varName: string): Promise<string> {
  return page.evaluate((name) => {
    const host = document.querySelector("#mount mining-lib-diagram") as HTMLElement | null;
    if (!host) return "";
    return host.style.getPropertyValue(name).trim();
  }, varName);
}

test.describe("theme — Phase 9", () => {
  test("default theme paints a Vercel-flavoured light look", async ({ page }) => {
    await loadFreshDiagram(page, {});
    await expect(page.locator('#mount svg[data-theme="light"]')).toHaveCount(1);
    expect(await readHostVar(page, "--mining-node-fill")).toBe("#f8fafc");
    expect(await readHostVar(page, "--mining-edge-stroke")).toBe("#d4d4d8");

    const rxValues = await page
      .locator("#mount svg g.mining-lib-node > rect")
      .evaluateAll((rects: Element[]) => rects.map((r) => r.getAttribute("rx")));
    expect(rxValues.length).toBeGreaterThan(0);
    for (const v of rxValues) expect(v).toBe("6");

    const firstEdgeLinecap = await page
      .locator("#mount svg path.mining-lib-edge")
      .first()
      .getAttribute("stroke-linecap");
    expect(firstEdgeLinecap).toBe("round");
  });

  test("theme: { dark: true } swaps palette but not geometry", async ({ page }) => {
    await loadFreshDiagram(page, { theme: { dark: true } });
    await expect(page.locator('#mount svg[data-theme="dark"]')).toHaveCount(1);
    expect(await readHostVar(page, "--mining-node-fill")).toBe("#0d0e12");

    const rxValues = await page
      .locator("#mount svg g.mining-lib-node > rect")
      .evaluateAll((rects: Element[]) => rects.map((r) => r.getAttribute("rx")));
    for (const v of rxValues) expect(v).toBe("6");
  });

  test("partial theme overrides one field without disturbing the rest", async ({ page }) => {
    await loadFreshDiagram(page, { theme: { nodeRadius: 12 } });
    const rxValues = await page
      .locator("#mount svg g.mining-lib-node > rect")
      .evaluateAll((rects: Element[]) => rects.map((r) => r.getAttribute("rx")));
    expect(rxValues.length).toBeGreaterThan(0);
    for (const v of rxValues) expect(v).toBe("12");
    expect(await readHostVar(page, "--mining-node-fill")).toBe("#f8fafc");
  });

  test("embedder can override the default tint via theme.nodeFill", async ({ page }) => {
    await loadFreshDiagram(page, { theme: { nodeFill: "#fef3c7" } });
    expect(await readHostVar(page, "--mining-node-fill")).toBe("#fef3c7");
  });

  test("handle.setTheme({ dark: true }) flips the variables in place", async ({ page }) => {
    await loadFreshDiagram(page, {});
    expect(await readHostVar(page, "--mining-node-fill")).toBe("#f8fafc");
    await page.evaluate(() => window.__freshDiagram.setTheme({ dark: true }));
    expect(await readHostVar(page, "--mining-node-fill")).toBe("#0d0e12");
    await expect(page.locator('#mount svg[data-theme="dark"]')).toHaveCount(1);
  });

  test("setTheme preserves a custom geometry override across a dark/light flip", async ({
    page,
  }) => {
    await loadFreshDiagram(page, { theme: { nodeRadius: 12 } });
    await page.evaluate(() => window.__freshDiagram.setTheme({ dark: true }));
    const rxValues = await page
      .locator("#mount svg g.mining-lib-node > rect")
      .evaluateAll((rects: Element[]) => rects.map((r) => r.getAttribute("rx")));
    for (const v of rxValues) expect(v).toBe("12");
    expect(await readHostVar(page, "--mining-node-fill")).toBe("#0d0e12");
  });

  test("edge label renders as a chip group with rx=3 chip + count text", async ({ page }) => {
    await loadFreshDiagram(page, {});
    const groups = page.locator("#mount svg g.mining-lib-edge-label");
    await expect(groups).toHaveCount(10);

    const first = groups.first();
    await expect(first.locator("rect.mining-lib-edge-label-chip")).toHaveCount(1);
    await expect(first.locator("text.mining-lib-edge-label-text")).toHaveCount(1);
    const chipRx = await first.locator("rect.mining-lib-edge-label-chip").getAttribute("rx");
    expect(chipRx).toBe("3");
  });
});
