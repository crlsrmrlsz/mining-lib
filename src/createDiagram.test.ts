import { afterEach, describe, expect, it } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import { buildDfg } from "./buildDfg.js";
import { createDiagram } from "./index.js";
import { parseCsv } from "./parseCsv.js";
import type { CountMode, Dfg, EdgeStats, NodeStats } from "./types.js";

const n5Dfg: Dfg = buildDfg(parseCsv(n5Csv).log);

function mountTarget(id = "mount"): HTMLDivElement {
  const div = document.createElement("div");
  div.id = id;
  document.body.appendChild(div);
  return div;
}

function shadow(host: Element | string = "#mount"): ShadowRoot {
  const target = typeof host === "string" ? document.querySelector(host) : host;
  const el = target?.querySelector("mining-lib-diagram") as
    | (HTMLElement & { shadowRoot: ShadowRoot | null })
    | null;
  if (!el?.shadowRoot) throw new Error("mining-lib-diagram shadowRoot not found");
  return el.shadowRoot;
}

function shadowSvg(host: Element | string = "#mount"): SVGSVGElement | null {
  const target = typeof host === "string" ? document.querySelector(host) : host;
  const el = target?.querySelector("mining-lib-diagram") as
    | (HTMLElement & { shadowRoot: ShadowRoot | null })
    | null;
  // Phase 18 added Lucide icon SVGs inside chrome buttons; Phase 28
  // re-anchored the canvas SVG inside a `.mining-lib-svg-cell` row.
  // Both make `querySelector("svg")` ambiguous — match the canvas
  // SVG by its class to stay deterministic.
  return el?.shadowRoot?.querySelector("svg.mining-lib-svg") ?? null;
}

function shadowSvgs(host: Element | string = "#mount"): NodeListOf<SVGSVGElement> {
  // Phase 18 (revised) added Lucide-icon SVGs inside chrome
  // buttons. Tests that count "the canvas SVG" must scope to the
  // class — a bare `svg` selector now matches every icon too.
  const root = shadow(host);
  return root.querySelectorAll("svg.mining-lib-svg");
}

describe("createDiagram", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("mounts one <svg> with centered 'No data loaded' text into a selector target", () => {
    mountTarget();
    createDiagram("#mount", {});

    expect(shadowSvgs()).toHaveLength(1);

    const text = shadow().querySelector("svg text");
    expect(text).not.toBeNull();
    expect(text?.textContent?.trim()).toBe("No data loaded");
  });

  it("accepts an HTMLElement target directly", () => {
    const host = mountTarget();
    createDiagram(host, {});
    expect(shadowSvgs(host)).toHaveLength(1);
  });

  it("returns a handle whose destroy() removes the svg and is idempotent", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});

    expect(shadowSvgs()).toHaveLength(1);
    handle.destroy();
    expect(shadowSvgs()).toHaveLength(0);

    expect(() => handle.destroy()).not.toThrow();
  });

  it("throws a clear error when the selector matches nothing", () => {
    expect(() => createDiagram("#nope", {})).toThrow(/did not match/);
  });
});

describe("createDiagram — render method", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function mount(): HTMLDivElement {
    const div = document.createElement("div");
    div.id = "mount";
    document.body.appendChild(div);
    return div;
  }

  it("replaces the 'No data loaded' placeholder with rendered nodes", () => {
    mount();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg);

    const placeholder = shadow().querySelector("svg text");
    expect(placeholder?.textContent).not.toBe("No data loaded");
    expect(shadow().querySelectorAll("svg .mining-lib-nodes > g.mining-lib-node")).toHaveLength(9);
    expect(shadow().querySelectorAll("svg path.mining-lib-edge")).toHaveLength(10);
  });

  it("second render replaces the first (no accumulation)", () => {
    mount();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg);
    const smaller: Dfg = {
      nodes: new Map<string, NodeStats>([
        [
          "a",
          {
            activity: "a",
            absoluteFrequency: 2,
            caseFrequency: 1,
            maxRepetitions: 2,
            meanRepetitions: 2,
          },
        ],
        [
          "b",
          {
            activity: "b",
            absoluteFrequency: 1,
            caseFrequency: 1,
            maxRepetitions: 1,
            meanRepetitions: 1,
          },
        ],
      ]),
      edges: new Map<string, EdgeStats>([
        [
          "ab",
          {
            from: "a",
            to: "b",
            absoluteFrequency: 1,
            caseFrequency: 1,
            maxRepetitions: 1,
            meanRepetitions: 1,
            durationMs: { mean: 1000, median: 1000, min: 1000, max: 1000 },
          },
        ],
      ]),
    };
    handle.render(smaller);

    expect(shadow().querySelectorAll("svg g.mining-lib-node")).toHaveLength(2);
    expect(shadow().querySelectorAll("svg path.mining-lib-edge")).toHaveLength(1);
  });

  it("throws TypeError when render is called with something that is not a Dfg", () => {
    mount();
    const handle = createDiagram("#mount", {});
    expect(() => handle.render(undefined as unknown as Dfg)).toThrow(TypeError);
    expect(() => handle.render({} as Dfg)).toThrow(/Dfg/);
  });
});

describe("createDiagram — count mode", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function mount(): HTMLDivElement {
    const div = document.createElement("div");
    div.id = "mount";
    document.body.appendChild(div);
    return div;
  }

  it("honours countMode passed in config and reports it via getCountMode", () => {
    mount();
    const handle = createDiagram("#mount", { countMode: "case" });
    expect(handle.getCountMode()).toBe("case");
    handle.render(n5Dfg);
    expect(shadowSvg()?.getAttribute("data-count-mode")).toBe("case");
  });

  it("setCountMode after render re-renders with the new mode and updates data-count-mode", () => {
    mount();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg);
    handle.setCountMode("maxRepetitions");
    expect(handle.getCountMode()).toBe("maxRepetitions");
    const svg = shadowSvg();
    expect(svg?.getAttribute("data-count-mode")).toBe("maxRepetitions");
    const reviewCount = svg?.querySelector(
      'g.mining-lib-node[data-activity="review_in_progress"] .mining-lib-node-count',
    );
    expect(reviewCount?.textContent?.trim()).toBe("4");
  });

  it("setCountMode before the first render is applied silently on the next render", () => {
    mount();
    const handle = createDiagram("#mount", {});
    handle.setCountMode("case");
    handle.render(n5Dfg);
    expect(shadowSvg()?.getAttribute("data-count-mode")).toBe("case");
  });

  it("setCountMode rejects unknown strings with a TypeError mentioning CountMode", () => {
    mount();
    const handle = createDiagram("#mount", {});
    expect(() => handle.setCountMode("bogus" as CountMode)).toThrow(TypeError);
    expect(() => handle.setCountMode("bogus" as CountMode)).toThrow(/CountMode/);
  });
});

describe("createDiagram — rankdir (Phase 37)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function mount(): HTMLDivElement {
    const div = document.createElement("div");
    div.id = "mount";
    document.body.appendChild(div);
    return div;
  }

  // Parse the X translate of a laid-out node <g>, mirroring the
  // LR-vs-TB geometry assertion in MiningLibDiagram.test.ts.
  function nodeX(activity: string): number {
    const g = shadow().querySelector(`g.mining-lib-node[data-activity="${activity}"]`);
    const match = g?.getAttribute("transform")?.match(/translate\(([-\d.]+)/);
    return match ? Number(match[1]) : Number.NaN;
  }

  it("defaults to TB and reports it via getRankdir", () => {
    mount();
    const handle = createDiagram("#mount", {});
    expect(handle.getRankdir()).toBe("TB");
  });

  it("honours rankdir passed in config and reports it via getRankdir", () => {
    mount();
    const handle = createDiagram("#mount", { rankdir: "LR" });
    expect(handle.getRankdir()).toBe("LR");
  });

  it("setRankdir after render re-lays-out from TB to LR on the same dfg", () => {
    mount();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg);
    // TB stacks ranks vertically — start and end nodes share a column.
    expect(Math.abs(nodeX("approved") - nodeX("submitted"))).toBeLessThan(80);

    handle.setRankdir("LR");
    expect(handle.getRankdir()).toBe("LR");
    // LR spreads ranks horizontally — start.x < end.x by a wide margin.
    expect(nodeX("approved") - nodeX("submitted")).toBeGreaterThan(200);
  });

  it("setRankdir before the first render is applied on the next render", () => {
    mount();
    const handle = createDiagram("#mount", {});
    handle.setRankdir("LR");
    handle.render(n5Dfg);
    expect(handle.getRankdir()).toBe("LR");
    expect(nodeX("approved") - nodeX("submitted")).toBeGreaterThan(200);
  });

  it("setRankdir rejects values other than LR/TB with a TypeError", () => {
    mount();
    const handle = createDiagram("#mount", {});
    expect(() => handle.setRankdir("diagonal" as "LR" | "TB")).toThrow(TypeError);
    expect(() => handle.setRankdir("diagonal" as "LR" | "TB")).toThrow(/rankdir/);
  });

  it("utilities-pill toggle button flips the layout direction on click", () => {
    mount();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg);
    const btn = shadow().querySelector<HTMLButtonElement>(
      'button[aria-label="Toggle layout direction"]',
    );
    expect(btn).not.toBeNull();
    expect(handle.getRankdir()).toBe("TB");

    btn?.click();

    expect(handle.getRankdir()).toBe("LR");
    expect(nodeX("approved") - nodeX("submitted")).toBeGreaterThan(200);
  });

  it("the toggle button respects a programmatic rankdir change", () => {
    mount();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg);
    handle.setRankdir("LR");
    const btn = shadow().querySelector<HTMLButtonElement>(
      'button[aria-label="Toggle layout direction"]',
    );
    btn?.click();
    expect(handle.getRankdir()).toBe("TB");
  });
});

describe("createDiagram — pan/zoom wiring", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function mount(): HTMLDivElement {
    const div = document.createElement("div");
    div.id = "mount";
    document.body.appendChild(div);
    return div;
  }

  it("getTransform on a fresh diagram returns identity with a new object each call", () => {
    mount();
    const handle = createDiagram("#mount", {});
    const t1 = handle.getTransform();
    const t2 = handle.getTransform();
    expect(t1).toEqual({ x: 0, y: 0, k: 1 });
    expect(t2).toEqual({ x: 0, y: 0, k: 1 });
    expect(t1).not.toBe(t2);
  });

  it("rejects zoom.minScale <= 0 with a TypeError naming the field", () => {
    mount();
    expect(() => createDiagram("#mount", { zoom: { minScale: 0, maxScale: 2 } })).toThrow(
      TypeError,
    );
    expect(() => createDiagram("#mount", { zoom: { minScale: 0, maxScale: 2 } })).toThrow(
      /zoom\.minScale/,
    );
  });

  it("rejects zoom.maxScale < minScale with a TypeError naming the field", () => {
    mount();
    expect(() => createDiagram("#mount", { zoom: { minScale: 2, maxScale: 1 } })).toThrow(
      TypeError,
    );
    expect(() => createDiagram("#mount", { zoom: { minScale: 2, maxScale: 1 } })).toThrow(
      /zoom\.maxScale/,
    );
  });
});

describe("createDiagram — programmatic zoom API", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function mount(): HTMLDivElement {
    const div = document.createElement("div");
    div.id = "mount";
    document.body.appendChild(div);
    return div;
  }

  it("zoomTo(2) writes a scale(2) transform on the viewport and reports k===2", () => {
    mount();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg);
    handle.zoomTo(2);
    expect(handle.getTransform().k).toBe(2);
    const viewport = shadow().querySelector("svg .mining-lib-viewport");
    expect(viewport?.getAttribute("transform") ?? "").toMatch(/scale\(2\)/);
  });

  it("preserves the transform across a setCountMode re-render", () => {
    mount();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg);
    handle.zoomTo(3);
    handle.setCountMode("case");
    const viewport = shadow().querySelector("svg .mining-lib-viewport");
    expect(viewport?.getAttribute("transform") ?? "").toMatch(/scale\(3\)/);
    expect(handle.getTransform().k).toBe(3);
  });

  it("zoomTo(999) with default bounds clamps to maxScale = 10", () => {
    mount();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg);
    handle.zoomTo(999);
    expect(handle.getTransform().k).toBe(10);
    const viewport = shadow().querySelector("svg .mining-lib-viewport");
    expect(viewport?.getAttribute("transform") ?? "").toMatch(/scale\(10\)/);
  });

  it("zoomTo(0.0001) with default bounds clamps to minScale = 0.1", () => {
    mount();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg);
    handle.zoomTo(0.0001);
    expect(handle.getTransform().k).toBe(0.1);
  });

  it("zoomTo(-1) throws TypeError whose message names zoomTo", () => {
    mount();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg);
    expect(() => handle.zoomTo(-1)).toThrow(TypeError);
    expect(() => handle.zoomTo(-1)).toThrow(/zoomTo/);
  });

  it("zoomTo(NaN) throws TypeError", () => {
    mount();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg);
    expect(() => handle.zoomTo(Number.NaN)).toThrow(TypeError);
  });

  it("resetView after a zoom restores identity", () => {
    mount();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg);
    handle.zoomTo(3);
    handle.resetView();
    expect(handle.getTransform()).toEqual({ x: 0, y: 0, k: 1 });
  });

  it("resetView before any render is a no-op (transform stays at identity, no error)", () => {
    mount();
    const handle = createDiagram("#mount", {});
    expect(() => handle.resetView()).not.toThrow();
    expect(handle.getTransform()).toEqual({ x: 0, y: 0, k: 1 });
  });
});

describe("createDiagram — keyboard shortcuts", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function mount(): HTMLDivElement {
    const div = document.createElement("div");
    div.id = "mount";
    document.body.appendChild(div);
    return div;
  }

  function pressKey(svg: Element, key: string): void {
    svg.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  }

  it("pressing '+' zooms in by a factor of 1.2", () => {
    mount();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg);
    const svg = shadowSvg();
    expect(svg).not.toBeNull();
    pressKey(svg as Element, "+");
    expect(handle.getTransform().k).toBeCloseTo(1.2, 3);
    pressKey(svg as Element, "+");
    expect(handle.getTransform().k).toBeCloseTo(1.44, 3);
  });

  it("three '-' presses then '0' returns to identity", () => {
    mount();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg);
    const svg = shadowSvg() as Element;
    pressKey(svg, "-");
    pressKey(svg, "-");
    pressKey(svg, "-");
    expect(handle.getTransform().k).toBeLessThan(1);
    pressKey(svg, "0");
    expect(handle.getTransform()).toEqual({ x: 0, y: 0, k: 1 });
  });

  it("pressing '+' before any render is a no-op", () => {
    mount();
    const handle = createDiagram("#mount", {});
    const svg = shadowSvg() as Element;
    pressKey(svg, "+");
    expect(handle.getTransform().k).toBe(1);
  });
});

describe("createDiagram — happy-path variant API (Phase 24)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const DIRECT_APPROVAL = [
    "submitted",
    "intake_validation",
    "assigned_to_reviewer",
    "review_in_progress",
    "health_inspection",
    "approved",
  ];

  it("getHappyPathVariant() returns null by default", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});
    expect(handle.getHappyPathVariant()).toBeNull();
  });

  it("setHappyPathVariant + getHappyPathVariant round-trip preserves the sequence", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});
    handle.setHappyPathVariant(["a", "b", "c"]);
    expect(handle.getHappyPathVariant()).toEqual(["a", "b", "c"]);
  });

  it("getHappyPathVariant returns a defensive copy (mutation does not leak)", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});
    handle.setHappyPathVariant(["a", "b"]);
    const snapshot = handle.getHappyPathVariant();
    snapshot?.push("mutated");
    expect(handle.getHappyPathVariant()).toEqual(["a", "b"]);
  });

  it("setHappyPathVariant copies its input array (mutation by caller does not leak)", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});
    const input = ["a", "b"];
    handle.setHappyPathVariant(input);
    input.push("mutated");
    expect(handle.getHappyPathVariant()).toEqual(["a", "b"]);
  });

  it("setHappyPathVariant(null) clears the pin", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});
    handle.setHappyPathVariant(["a", "b"]);
    handle.setHappyPathVariant(null);
    expect(handle.getHappyPathVariant()).toBeNull();
  });

  it("rejects non-string entries with a TypeError", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});
    expect(() => handle.setHappyPathVariant(["a", 1 as unknown as string])).toThrow(TypeError);
  });

  it("createDiagram({ happyPathVariant }) seeds the state", () => {
    mountTarget();
    const handle = createDiagram("#mount", { happyPathVariant: ["a", "b"] });
    expect(handle.getHappyPathVariant()).toEqual(["a", "b"]);
  });

  it("defensive clear: setVariantFilter that removes pinned variant clears the pin", () => {
    mountTarget();
    const log = parseCsv(n5Csv).log;
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg, log);
    handle.setHappyPathVariant(DIRECT_APPROVAL);
    // Sanity check — pin survives the render.
    expect(handle.getHappyPathVariant()).toEqual(DIRECT_APPROVAL);
    // Filter to a variant signature that is NOT Direct Approval.
    // The early-rejection variant exists in n5 (per getVariants tests).
    const earlyRejectionSig = JSON.stringify(["submitted", "intake_validation", "rejected"]);
    handle.setVariantFilter([earlyRejectionSig]);
    // After the filter, Direct Approval is no longer in the filtered
    // variants — the pin auto-clears.
    expect(handle.getHappyPathVariant()).toBeNull();
  });
});
