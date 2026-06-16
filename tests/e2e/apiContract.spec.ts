import { expect, type Page, test } from "@playwright/test";

/**
 * Phase 39 Group B — the consolidated public-API contract suite.
 *
 * One place that asserts the SHAPE of the public surface:
 *  1. every `DiagramHandle` set/get round-trips and composes,
 *  2. every `<mining-lib-diagram>` attribute reflects to its property (and
 *     the reverse), incl. the `variantTopK` property — its only public
 *     channel — and the `handle`/`dfg`/`log` properties,
 *  3. the three web-component edge cases: multiple observed attributes set
 *     before connect all apply (the Phase-36 upgrade-queue regression guard),
 *     the construction-only `zoom` warn-and-ignore, and factory↔element
 *     parity,
 *  4. the full `::part()` catalog lands on real shadow surfaces.
 *
 * Behaviour DEPTH lives in the feature specs (controlBar / theme /
 * rankdirToggle / variantFilter / caseTrace / happyPathOverlay / imageExport /
 * panZoom / parts); this suite tests the CONTRACT, not the pixels. Mounts the
 * deterministic n5 fixture via the control-bar demo, which exposes
 * `window.__diagram` (handle), `window.__el` (element) and the `MiningLib`
 * UMD global. Engine-agnostic — runs on every Playwright project (Group E
 * adds Firefox + WebKit).
 */

const PAGE = "/control-bar.built.html?fixture=n5-fixture&w=1200&h=720";
const HOST = "#mount mining-lib-diagram";
const VIEWPORT = `${HOST} svg .mining-lib-viewport`;

type Variant = { sequence: string[]; count: number; percentage: number };

type Handle = {
  render(dfg: unknown, log?: unknown): void;
  setCountMode(m: string): void;
  getCountMode(): string;
  setTheme(t: { dark?: boolean }): void;
  getTheme(): { dark: boolean };
  setPreset(p: string): void;
  getPreset(): string;
  setRankdir(d: string): void;
  getRankdir(): string;
  getVariants(): Variant[];
  setFilters(c: unknown[]): void;
  getFilters(): { kind: string }[];
  setVariantFilter(s: string[] | null): void;
  getVariantFilter(): string[] | null;
  setHappyPathVariant(s: string[] | null): void;
  getHappyPathVariant(): string[] | null;
  setTraceCase(id: string | null): void;
  getTraceCase(): string | null;
  getTransform(): { x: number; y: number; k: number };
  resetView(): void;
  zoomTo(k: number): void;
  select(t: { kind: string; id: string } | null): void;
  getSelected(): { kind: string; id: string } | null;
  exportSvg(): string;
  exportPng(o?: { scale?: number }): Promise<Blob>;
  destroy(): void;
};

type MiningEl = HTMLElement & {
  countMode?: string;
  preset?: string;
  rankdir?: string;
  traceCase?: string;
  variantTopK: number;
  theme?: unknown;
  happyPathVariant?: string[];
  zoom?: unknown;
  dfg: unknown;
  log: unknown;
  handle: Handle;
};

type Lib = {
  parseCsv(t: string): { log: unknown };
  buildDfg(log: unknown): unknown;
  createDiagram(t: string | HTMLElement, c?: Record<string, unknown>): Handle;
};

type Win = Window & typeof globalThis & { __diagram: Handle; __el: MiningEl; MiningLib: Lib };

async function goto(page: Page): Promise<void> {
  await page.goto(PAGE);
  await expect(page.locator(VIEWPORT)).toBeVisible();
}

test.describe("handle method contract — set/get round-trip + compose", () => {
  test("count mode round-trips and composes", async ({ page }) => {
    await goto(page);
    const r = await page.evaluate(() => {
      const d = (window as unknown as Win).__diagram;
      d.setCountMode("case");
      const first = d.getCountMode();
      d.setCountMode("meanDuration");
      return { first, second: d.getCountMode() };
    });
    expect(r.first).toBe("case");
    expect(r.second).toBe("meanDuration");
  });

  test("theme set/get round-trips (dark flip)", async ({ page }) => {
    await goto(page);
    const r = await page.evaluate(() => {
      const d = (window as unknown as Win).__diagram;
      const before = d.getTheme().dark;
      d.setTheme({ dark: true });
      return { before, after: d.getTheme().dark };
    });
    expect(r.before).toBe(false);
    expect(r.after).toBe(true);
  });

  test("preset round-trips", async ({ page }) => {
    await goto(page);
    const got = await page.evaluate(() => {
      const d = (window as unknown as Win).__diagram;
      d.setPreset("linear");
      return d.getPreset();
    });
    expect(got).toBe("linear");
  });

  test("rankdir round-trips", async ({ page }) => {
    await goto(page);
    const got = await page.evaluate(() => {
      const d = (window as unknown as Win).__diagram;
      d.setRankdir("LR");
      return d.getRankdir();
    });
    expect(got).toBe("LR");
  });

  test("getVariants returns the n5 variant set, sorted count-desc", async ({ page }) => {
    await goto(page);
    const v = await page.evaluate(() => (window as unknown as Win).__diagram.getVariants());
    expect(v.length).toBe(4);
    expect(v[0]?.count).toBe(2);
    const counts = v.map((x) => x.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    expect(v.reduce((s, x) => s + x.percentage, 0)).toBeCloseTo(100, 0);
  });

  test("variant filter round-trips via signatures and lands as a variant clause", async ({
    page,
  }) => {
    await goto(page);
    const r = await page.evaluate(() => {
      const d = (window as unknown as Win).__diagram;
      const sig = d.getVariants()[0]?.sequence.join("\t") ?? "";
      d.setVariantFilter([sig]);
      return { sig, got: d.getVariantFilter(), kinds: d.getFilters().map((c) => c.kind) };
    });
    expect(r.got).toEqual([r.sig]);
    expect(r.kinds).toContain("variant");
  });

  test("setFilters round-trips a node clause and clears on []", async ({ page }) => {
    await goto(page);
    const r = await page.evaluate(() => {
      const d = (window as unknown as Win).__diagram;
      d.setFilters([{ kind: "node", activity: "submitted" }]);
      const after = d.getFilters();
      d.setFilters([]);
      return { after, cleared: d.getFilters() };
    });
    expect(r.after).toEqual([{ kind: "node", activity: "submitted" }]);
    expect(r.cleared).toEqual([]);
  });

  test("happy-path variant round-trips, clears, and returns a defensive copy", async ({ page }) => {
    await goto(page);
    const r = await page.evaluate(() => {
      const d = (window as unknown as Win).__diagram;
      const seq = d.getVariants()[0]?.sequence ?? [];
      d.setHappyPathVariant(seq);
      const got = d.getHappyPathVariant();
      // Mutating the returned array must NOT leak into internal state.
      if (got) got.push("__tamper__");
      const afterTamper = d.getHappyPathVariant();
      d.setHappyPathVariant(null);
      return { seq, afterTamper, cleared: d.getHappyPathVariant() };
    });
    expect(r.afterTamper).toEqual(r.seq);
    expect(r.cleared).toBeNull();
  });

  test("trace case round-trips and clears", async ({ page }) => {
    await goto(page);
    const r = await page.evaluate(() => {
      const d = (window as unknown as Win).__diagram;
      d.setTraceCase("case_0001");
      const pinned = d.getTraceCase();
      d.setTraceCase(null);
      return { pinned, cleared: d.getTraceCase() };
    });
    expect(r.pinned).toBe("case_0001");
    expect(r.cleared).toBeNull();
  });

  test("selection round-trips and clears", async ({ page }) => {
    await goto(page);
    const r = await page.evaluate(() => {
      const d = (window as unknown as Win).__diagram;
      d.select({ kind: "node", id: "submitted" });
      const sel = d.getSelected();
      d.select(null);
      return { sel, cleared: d.getSelected() };
    });
    expect(r.sel).toEqual({ kind: "node", id: "submitted" });
    expect(r.cleared).toBeNull();
  });

  test("zoomTo reflects in getTransform; resetView restores the fit", async ({ page }) => {
    await goto(page);
    const r = await page.evaluate(() => {
      const d = (window as unknown as Win).__diagram;
      d.zoomTo(3);
      const zoomedK = d.getTransform().k;
      d.resetView();
      return { zoomedK, resetK: d.getTransform().k };
    });
    expect(r.zoomedK).toBeCloseTo(3, 5);
    // resetView re-fits (Phase 13) — it does not stay at the zoomed scale.
    expect(r.resetK).not.toBeCloseTo(3, 1);
    expect(r.resetK).toBeGreaterThan(0);
  });

  test("exportSvg returns a self-contained SVG; exportPng returns a PNG blob", async ({ page }) => {
    await goto(page);
    const r = await page.evaluate(async () => {
      const d = (window as unknown as Win).__diagram;
      const svg = d.exportSvg();
      const blob = await d.exportPng({ scale: 1 });
      return {
        hasSvg: svg.includes("<svg"),
        hasStyle: svg.includes("<style"),
        type: blob.type,
        size: blob.size,
      };
    });
    expect(r.hasSvg).toBe(true);
    expect(r.hasStyle).toBe(true);
    expect(r.type).toBe("image/png");
    expect(r.size).toBeGreaterThan(0);
  });

  test("render() re-renders a freshly built DFG (variants follow the source log)", async ({
    page,
  }) => {
    await goto(page);
    const variantCount = await page.evaluate(async () => {
      const win = window as unknown as Win;
      const text = await (await fetch("/runs/n5-fixture/events.csv")).text();
      const { log } = win.MiningLib.parseCsv(text);
      const dfg = win.MiningLib.buildDfg(log);
      win.__diagram.render(dfg, log);
      return win.__diagram.getVariants().length;
    });
    expect(variantCount).toBe(4);
  });

  test("destroy() is idempotent and re-arms the export guard", async ({ page }) => {
    await goto(page);
    const r = await page.evaluate(async () => {
      const win = window as unknown as Win;
      const { log } = win.MiningLib.parseCsv(
        await (await fetch("/runs/n5-fixture/events.csv")).text(),
      );
      const dfg = win.MiningLib.buildDfg(log);
      const host = document.createElement("div");
      host.style.width = "600px";
      host.style.height = "400px";
      document.body.appendChild(host);
      const h = win.MiningLib.createDiagram(host, {});
      h.render(dfg, log);
      const exportedBefore = h.exportSvg().includes("<svg");
      h.destroy();
      h.destroy(); // idempotent — a second destroy must be a no-op, not a throw
      let exportThrew = false;
      try {
        h.exportSvg();
      } catch {
        exportThrew = true;
      }
      return { exportedBefore, exportThrew };
    });
    expect(r.exportedBefore).toBe(true);
    // destroy nulls the current DFG, so the "export before first render" guard
    // fires again.
    expect(r.exportThrew).toBe(true);
  });
});

test.describe("element attribute ⇄ property reflection", () => {
  test("count-mode: property → attribute and attribute → property + handle", async ({ page }) => {
    await goto(page);
    await page.evaluate(() => {
      (window as unknown as Win).__el.countMode = "case";
    });
    await expect(page.locator(HOST)).toHaveAttribute("count-mode", "case");

    await page.locator(HOST).evaluate((el) => el.setAttribute("count-mode", "maxRepetitions"));
    const r = await page.evaluate(() => ({
      prop: (window as unknown as Win).__el.countMode,
      mode: (window as unknown as Win).__diagram.getCountMode(),
    }));
    expect(r.prop).toBe("maxRepetitions");
    expect(r.mode).toBe("maxRepetitions");
  });

  test("preset property reflects to the attribute", async ({ page }) => {
    await goto(page);
    await page.evaluate(() => {
      (window as unknown as Win).__el.preset = "paper";
    });
    await expect(page.locator(HOST)).toHaveAttribute("preset", "paper");
  });

  test("rankdir attribute drives the live relayout and the property", async ({ page }) => {
    await goto(page);
    await page.locator(HOST).evaluate((el) => el.setAttribute("rankdir", "LR"));
    const r = await page.evaluate(() => ({
      prop: (window as unknown as Win).__el.rankdir,
      dir: (window as unknown as Win).__diagram.getRankdir(),
    }));
    expect(r.prop).toBe("LR");
    expect(r.dir).toBe("LR");
  });

  test("theme attribute (dark) applies through the handle", async ({ page }) => {
    await goto(page);
    await page.locator(HOST).evaluate((el) => el.setAttribute("theme", "dark"));
    const dark = await page.evaluate(() => (window as unknown as Win).__diagram.getTheme().dark);
    expect(dark).toBe(true);
  });

  test("trace-case attribute ↔ property ↔ pin, and clears on removal", async ({ page }) => {
    await goto(page);
    await page.locator(HOST).evaluate((el) => el.setAttribute("trace-case", "case_0001"));
    const r = await page.evaluate(() => ({
      prop: (window as unknown as Win).__el.traceCase,
      pin: (window as unknown as Win).__diagram.getTraceCase(),
    }));
    expect(r.prop).toBe("case_0001");
    expect(r.pin).toBe("case_0001");

    // property → undefined removes the attribute (reflection).
    await page.evaluate(() => {
      (window as unknown as Win).__el.traceCase = undefined;
    });
    const hasAttr = await page.locator(HOST).evaluate((el) => el.hasAttribute("trace-case"));
    expect(hasAttr).toBe(false);
  });

  test("variantTopK: property round-trips, reflects to the attribute, rejects invalid", async ({
    page,
  }) => {
    await goto(page);
    // property → attribute
    await page.evaluate(() => {
      (window as unknown as Win).__el.variantTopK = 2;
    });
    await expect(page.locator(HOST)).toHaveAttribute("variant-top-k", "2");
    // attribute → property
    await page.locator(HOST).evaluate((el) => el.setAttribute("variant-top-k", "3"));
    expect(await page.evaluate(() => (window as unknown as Win).__el.variantTopK)).toBe(3);
    // invalid (non-positive) throws
    const threw = await page.evaluate(() => {
      try {
        (window as unknown as Win).__el.variantTopK = 0;
        return false;
      } catch {
        return true;
      }
    });
    expect(threw).toBe(true);
  });

  test("variantTopK caps the visible variant rows (rest stay in the DOM behind 'show all')", async ({
    page,
  }) => {
    await goto(page);
    await page.evaluate(() => {
      (window as unknown as Win).__el.variantTopK = 2;
    });
    await page.locator(`${HOST} [part="variants-trigger-pill"]`).click();
    // n5 has 4 variants; the cap hides the rest (`row.hidden`) behind a
    // "Show all (4)" toggle rather than removing them — so all 4 pins exist
    // but only the top 2 are visible.
    await expect(page.locator(`${HOST} .mining-lib-variant-pin`)).toHaveCount(4);
    await expect(page.locator(`${HOST} .mining-lib-variant-pin:visible`)).toHaveCount(2);
  });

  test("happyPathVariant element property round-trips and returns a defensive copy", async ({
    page,
  }) => {
    // happyPathVariant is a property-only channel (no attribute).
    await goto(page);
    const r = await page.evaluate(() => {
      const win = window as unknown as Win;
      const seq = win.__diagram.getVariants()[0]?.sequence ?? [];
      win.__el.happyPathVariant = seq;
      const got = win.__el.happyPathVariant;
      if (got) got.push("__tamper__"); // mutating the copy must not leak
      const afterTamper = win.__el.happyPathVariant;
      win.__el.happyPathVariant = undefined;
      return {
        seq,
        afterTamper,
        cleared: win.__el.happyPathVariant,
        pin: win.__diagram.getHappyPathVariant(),
      };
    });
    expect(r.afterTamper).toEqual(r.seq);
    expect(r.cleared).toBeUndefined();
    expect(r.pin).toBeNull();
  });

  test("the handle property is the same handle returned by the factory", async ({ page }) => {
    await goto(page);
    const same = await page.evaluate(
      () => (window as unknown as Win).__el.handle === (window as unknown as Win).__diagram,
    );
    expect(same).toBe(true);
  });
});

test.describe("web-component contract edge cases", () => {
  test("multiple observed attributes set before connect all apply (upgrade-queue guard)", async ({
    page,
  }) => {
    // Phase 36 regression: a reflecting setter (preset/theme) corrupted the
    // upgrade reaction queue, silently dropping later observed-attribute
    // callbacks (controls / trace-case / rankdir). Setting several attributes
    // before connect must apply ALL of them on connect. (The exact
    // upgrade-reaction-queue internals are covered in MiningLibDiagram.test.ts.)
    await goto(page);
    const r = await page.evaluate(async () => {
      const win = window as unknown as Win;
      const { log } = win.MiningLib.parseCsv(
        await (await fetch("/runs/n5-fixture/events.csv")).text(),
      );
      const dfg = win.MiningLib.buildDfg(log);

      const el = document.createElement("mining-lib-diagram") as MiningEl;
      el.setAttribute("preset", "linear");
      el.setAttribute("count-mode", "case");
      el.setAttribute("rankdir", "LR");
      el.setAttribute("trace-case", "case_0001");
      el.style.width = "600px";
      el.style.height = "400px";
      document.body.appendChild(el);
      el.handle.render(dfg, log);

      return {
        preset: el.handle.getPreset(),
        mode: el.handle.getCountMode(),
        dir: el.handle.getRankdir(),
        trace: el.handle.getTraceCase(),
      };
    });
    expect(r.preset).toBe("linear");
    expect(r.mode).toBe("case");
    expect(r.dir).toBe("LR");
    expect(r.trace).toBe("case_0001");
  });

  test("zoom property warns and is ignored after connect", async ({ page }) => {
    await goto(page);
    const warnings: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "warning") warnings.push(msg.text());
    });
    const threw = await page.evaluate(() => {
      try {
        (window as unknown as Win).__el.zoom = { minScale: 0.1, maxScale: 9 };
        return false;
      } catch {
        return true;
      }
    });
    expect(threw).toBe(false);
    await expect
      .poll(() => warnings.some((w) => w.includes("zoom can only be set before")))
      .toBe(true);
  });

  test("factory and element produce equivalent diagrams (parity)", async ({ page }) => {
    await goto(page);
    const r = await page.evaluate(async () => {
      const win = window as unknown as Win;
      const { log } = win.MiningLib.parseCsv(
        await (await fetch("/runs/n5-fixture/events.csv")).text(),
      );
      const dfg = win.MiningLib.buildDfg(log);

      // factory path
      const fHost = document.createElement("div");
      fHost.style.width = "600px";
      fHost.style.height = "400px";
      document.body.appendChild(fHost);
      const fHandle = win.MiningLib.createDiagram(fHost, {});
      fHandle.render(dfg, log);

      // element path
      const eEl = document.createElement("mining-lib-diagram") as MiningEl;
      eEl.style.width = "600px";
      eEl.style.height = "400px";
      document.body.appendChild(eEl);
      eEl.log = log;
      eEl.dfg = dfg; // dfg setter renders with the already-set log

      const fNodes =
        fHost.querySelector("mining-lib-diagram")?.shadowRoot?.querySelectorAll("g.mining-lib-node")
          .length ?? -1;
      const eNodes = eEl.shadowRoot?.querySelectorAll("g.mining-lib-node").length ?? -2;
      return {
        fNodes,
        eNodes,
        fVariants: fHandle.getVariants().length,
        eVariants: eEl.handle.getVariants().length,
        fMode: fHandle.getCountMode(),
        eMode: eEl.handle.getCountMode(),
      };
    });
    expect(r.eNodes).toBeGreaterThan(0);
    expect(r.eNodes).toBe(r.fNodes);
    expect(r.eVariants).toBe(r.fVariants);
    expect(r.eMode).toBe(r.fMode);
  });
});

test.describe("::part() catalog lands on real shadow surfaces", () => {
  test("every resident part is present in the shadow DOM", async ({ page }) => {
    await goto(page);
    const present = await page.evaluate(() => {
      const root = (window as unknown as Win).__el.shadowRoot;
      if (!root) return [];
      return [
        ...new Set([...root.querySelectorAll("[part]")].map((e) => e.getAttribute("part") ?? "")),
      ];
    });
    const resident = [
      "chrome-top",
      "chrome-bottom",
      "svg-cell",
      "svg",
      "toolbar",
      "mode-pill",
      "variants-trigger-pill",
      "filters-trigger-pill",
      "utilities",
      "zoom",
    ];
    for (const part of resident) expect(present).toContain(part);
  });

  test("variants popover exposes popover + variants-panel parts", async ({ page }) => {
    await goto(page);
    await page.locator(`${HOST} [part="variants-trigger-pill"]`).click();
    await expect(page.locator(`${HOST} [part="popover"]`)).toBeVisible();
    await expect(page.locator(`${HOST} [part="variants-panel"]`)).toHaveCount(1);
  });

  test("filters popover exposes popover + filters-panel parts", async ({ page }) => {
    await goto(page);
    await page.locator(`${HOST} [part="filters-trigger-pill"]`).click();
    await expect(page.locator(`${HOST} [part="popover"]`)).toBeVisible();
    await expect(page.locator(`${HOST} [part="filters-panel"]`)).toHaveCount(1);
  });

  test("selecting a node exposes the selection-pill part", async ({ page }) => {
    await goto(page);
    await page.evaluate(() =>
      (window as unknown as Win).__diagram.select({ kind: "node", id: "submitted" }),
    );
    await expect(page.locator(`${HOST} [part="selection-pill"]`)).toBeVisible();
  });

  test("pinning a trace exposes the trace-panel part", async ({ page }) => {
    await goto(page);
    await page.evaluate(() => (window as unknown as Win).__diagram.setTraceCase("case_0001"));
    await expect(page.locator(`${HOST} [part="trace-panel"]`)).toBeVisible();
  });

  test("the custom element is registered (tree-shake survival is unit-tested)", async ({
    page,
  }) => {
    // The real "survives tree-shaking" guard is the unit test
    // src/sideEffects.test.ts; here we only confirm the element is defined on
    // the page so the part-catalog assertions above are meaningful.
    await goto(page);
    const defined = await page.evaluate(
      () => customElements.get("mining-lib-diagram") !== undefined,
    );
    expect(defined).toBe(true);
  });
});
