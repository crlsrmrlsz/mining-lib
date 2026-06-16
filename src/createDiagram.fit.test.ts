import { afterEach, beforeEach, describe, expect, it } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import { buildDfg } from "./buildDfg.js";
import { createDiagram } from "./index.js";
import { MiningLibDiagram } from "./MiningLibDiagram.js";
import { parseCsv } from "./parseCsv.js";
import type { Dfg } from "./types.js";

const { log: n5Log } = parseCsv(n5Csv);
const n5Dfg = buildDfg(n5Log);

let mockedHostWidth = 2400;
let mockedHostHeight = 1200;

beforeEach(() => {
  // Stub Element.getBoundingClientRect for the host element AND the
  // inner SVG so mountDiagram's viewportSize() (which reads the SVG)
  // returns the configured viewport. jsdom returns 0×0 by default for
  // unstyled elements.
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    const isHost = this instanceof MiningLibDiagram;
    const isMiningSvg =
      this instanceof SVGSVGElement && (this.classList?.contains?.("mining-lib-svg") ?? false);
    if (isHost || isMiningSvg) {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: mockedHostWidth,
        bottom: mockedHostHeight,
        width: mockedHostWidth,
        height: mockedHostHeight,
        toJSON() {
          return {};
        },
      } as DOMRect;
    }
    return original.call(this);
  };
});

afterEach(() => {
  document.body.innerHTML = "";
  mockedHostWidth = 2400;
  mockedHostHeight = 1200;
});

function mountTarget(): HTMLDivElement {
  const div = document.createElement("div");
  div.id = "mount";
  document.body.appendChild(div);
  return div;
}

describe("DiagramHandle — fit-to-view", () => {
  it("initial render lands at fit transform (k=1 for n5 in a roomy host)", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg, n5Log);
    const t = handle.getTransform();
    expect(t.k).toBe(1);
    expect(Number.isFinite(t.x)).toBe(true);
    expect(Number.isFinite(t.y)).toBe(true);
  });

  it("downscales when layout exceeds host (tight host on n5)", () => {
    mockedHostWidth = 200;
    mockedHostHeight = 200;
    mountTarget();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg, n5Log);
    const t = handle.getTransform();
    expect(t.k).toBeLessThan(1);
    expect(t.k).toBeGreaterThan(0);
  });

  it("resetView returns to the fit transform, not zoomIdentity", () => {
    mockedHostWidth = 200;
    mockedHostHeight = 200;
    mountTarget();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg, n5Log);
    const fit = handle.getTransform();
    expect(fit.k).toBeLessThan(1);

    handle.zoomTo(3);
    expect(handle.getTransform().k).toBe(3);

    handle.resetView();
    const after = handle.getTransform();
    expect(after.k).toBeCloseTo(fit.k, 5);
    expect(after.x).toBeCloseTo(fit.x, 5);
    expect(after.y).toBeCloseTo(fit.y, 5);
  });

  it("--mining-fit-padding shrinks available area (smaller k)", () => {
    mockedHostWidth = 200;
    mockedHostHeight = 200;
    mountTarget();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg, n5Log);
    const kDefault = handle.getTransform().k;

    const el = document.querySelector("mining-lib-diagram") as HTMLElement;
    el.style.setProperty("--mining-fit-padding", "0px");
    handle.resetView();
    const kZeroPadding = handle.getTransform().k;
    expect(kZeroPadding).toBeGreaterThan(kDefault);
  });

  it("empty DFG renders without NaN viewBox or non-finite transform", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});
    const emptyDfg: Dfg = { nodes: new Map(), edges: new Map() };
    handle.render(emptyDfg, n5Log);
    const t = handle.getTransform();
    expect(Number.isFinite(t.k)).toBe(true);
    expect(Number.isFinite(t.x)).toBe(true);
    expect(Number.isFinite(t.y)).toBe(true);

    const el = document.querySelector("mining-lib-diagram") as HTMLElement & {
      shadowRoot: ShadowRoot;
    };
    const svg = el.shadowRoot.querySelector("svg.mining-lib-svg");
    const viewBox = svg?.getAttribute("viewBox") ?? "";
    expect(viewBox).toMatch(/^0 0 \d+(?:\.\d+)? \d+(?:\.\d+)?$/);
  });
});
