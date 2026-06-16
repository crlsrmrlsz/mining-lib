import { afterEach, describe, expect, it } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import { buildDfg } from "./buildDfg.js";
import "./index.js";
import { MiningLibDiagram } from "./MiningLibDiagram.js";
import { parseCsv } from "./parseCsv.js";

const { log: n5Log } = parseCsv(n5Csv);
const n5Dfg = buildDfg(n5Log);

function appendFresh(): MiningLibDiagram {
  const el = document.createElement("mining-lib-diagram") as MiningLibDiagram;
  document.body.appendChild(el);
  return el;
}

describe("MiningLibDiagram — registration", () => {
  it("registers the custom element via index.js side effect", () => {
    expect(customElements.get("mining-lib-diagram")).toBe(MiningLibDiagram);
  });

  it("repeated import does not re-register", async () => {
    const before = customElements.get("mining-lib-diagram");
    await import("./index.js");
    expect(customElements.get("mining-lib-diagram")).toBe(before);
  });
});

describe("MiningLibDiagram — connectedCallback", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("attaches an open shadow root with the bundled stylesheet and an svg child", () => {
    const el = appendFresh();
    expect(el.shadowRoot).not.toBeNull();
    expect(el.shadowRoot?.mode).toBe("open");
    expect(el.shadowRoot?.adoptedStyleSheets.length).toBe(1);
    expect(el.shadowRoot?.querySelectorAll("svg.mining-lib-svg")).toHaveLength(1);
  });

  it('svg carries part="svg" so embedders can style it via ::part(svg)', () => {
    const el = appendFresh();
    expect(el.shadowRoot?.querySelector("svg.mining-lib-svg")?.getAttribute("part")).toBe("svg");
  });

  it("exposes a read-only handle once connected", () => {
    const el = appendFresh();
    expect(typeof el.handle.render).toBe("function");
    expect(typeof el.handle.setCountMode).toBe("function");
    expect(typeof el.handle.destroy).toBe("function");
  });

  it("throws a clear error when handle is read before connect", () => {
    const el = document.createElement("mining-lib-diagram") as MiningLibDiagram;
    expect(() => el.handle).toThrow(/not connected/);
  });
});

describe("MiningLibDiagram — properties", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("setting dfg renders the diagram", () => {
    const el = appendFresh();
    el.dfg = n5Dfg;
    const nodes = el.shadowRoot?.querySelectorAll("svg g.mining-lib-node") ?? [];
    expect(nodes.length).toBe(9);
  });

  it("setting dfg then log re-renders with the source log so getVariants works", () => {
    const el = appendFresh();
    el.dfg = n5Dfg;
    el.log = n5Log;
    expect(el.handle.getVariants()).toHaveLength(4);
  });

  it("setting log without dfg does not render anything", () => {
    const el = appendFresh();
    el.log = n5Log;
    const nodes = el.shadowRoot?.querySelectorAll("svg g.mining-lib-node") ?? [];
    expect(nodes.length).toBe(0);
  });

  it("theme = 'dark' applies the dark palette and reflects to the attribute", () => {
    const el = appendFresh();
    el.dfg = n5Dfg;
    el.theme = "dark";
    expect(el.getAttribute("theme")).toBe("dark");
    expect(el.shadowRoot?.querySelector("svg.mining-lib-svg")?.getAttribute("data-theme")).toBe(
      "dark",
    );
  });

  it("theme = { dark: true, nodeFill: '#abcdef' } accepts an object", () => {
    const el = appendFresh();
    el.dfg = n5Dfg;
    el.theme = { dark: true, nodeFill: "#abcdef" };
    expect(el.style.getPropertyValue("--mining-node-fill").trim()).toBe("#abcdef");
  });

  it("countMode property reflects to count-mode attribute and updates the SVG", () => {
    const el = appendFresh();
    el.dfg = n5Dfg;
    el.countMode = "case";
    expect(el.getAttribute("count-mode")).toBe("case");
    expect(
      el.shadowRoot?.querySelector("svg.mining-lib-svg")?.getAttribute("data-count-mode"),
    ).toBe("case");
  });

  it("zoom setter validates synchronously before connect", () => {
    const el = document.createElement("mining-lib-diagram") as MiningLibDiagram;
    expect(() => {
      el.zoom = { minScale: 0, maxScale: 2 };
    }).toThrow(/zoom\.minScale/);
    expect(() => {
      el.zoom = { minScale: 2, maxScale: 1 };
    }).toThrow(/zoom\.maxScale/);
  });
});

describe("MiningLibDiagram — attribute reflection", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("theme attribute set via setAttribute drives the property", () => {
    const el = appendFresh();
    el.dfg = n5Dfg;
    el.setAttribute("theme", "dark");
    expect(el.shadowRoot?.querySelector("svg.mining-lib-svg")?.getAttribute("data-theme")).toBe(
      "dark",
    );
  });

  it("count-mode attribute drives the property", () => {
    const el = appendFresh();
    el.dfg = n5Dfg;
    el.setAttribute("count-mode", "maxRepetitions");
    expect(el.handle.getCountMode()).toBe("maxRepetitions");
    expect(
      el.shadowRoot?.querySelector("svg.mining-lib-svg")?.getAttribute("data-count-mode"),
    ).toBe("maxRepetitions");
  });

  it("invalid count-mode attribute is ignored (no throw)", () => {
    const el = appendFresh();
    el.dfg = n5Dfg;
    expect(() => el.setAttribute("count-mode", "bogus")).not.toThrow();
    expect(el.handle.getCountMode()).toBe("absolute");
  });
});

describe("MiningLibDiagram — variantTopK", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  // Phase 22: the variant panel moved out of the unified Filters
  // popover and into its own `▾ Variants` popover. Tests that probe
  // the variant list at narrow widths open it via this helper.
  function openVariantsPopover(el: MiningLibDiagram): void {
    const trigger = el.shadowRoot?.querySelector<HTMLButtonElement>(
      'button[data-popover="variants"]',
    );
    trigger?.click();
  }

  it("default is 5; filters popover variant panel shows all 4 variants of n5 without an expander", () => {
    const el = appendFresh();
    el.dfg = n5Dfg;
    el.log = n5Log;
    expect(el.variantTopK).toBe(5);
    openVariantsPopover(el);
    const panel = el.shadowRoot?.querySelector(".mining-lib-panel");
    expect(panel).not.toBeNull();
    expect(panel?.querySelectorAll("input[type='checkbox']")).toHaveLength(4);
    expect(panel?.querySelector("button.mining-lib-panel-show-all")).toBeNull();
  });

  it("setting variantTopK = 2 collapses to 2 visible rows + expander", () => {
    const el = appendFresh();
    el.dfg = n5Dfg;
    el.log = n5Log;
    el.variantTopK = 2;
    openVariantsPopover(el);
    const panel = el.shadowRoot?.querySelector(".mining-lib-panel");
    const rows = panel?.querySelectorAll<HTMLLabelElement>("label.mining-lib-panel-row") ?? [];
    expect(rows[0]?.hidden).toBe(false);
    expect(rows[1]?.hidden).toBe(false);
    expect(rows[2]?.hidden).toBe(true);
    expect(rows[3]?.hidden).toBe(true);
    expect(panel?.querySelector("button.mining-lib-panel-show-all")).not.toBeNull();
  });

  it("variantTopK reflects to the variant-top-k attribute", () => {
    const el = appendFresh();
    el.variantTopK = 7;
    expect(el.getAttribute("variant-top-k")).toBe("7");
  });

  it("variant-top-k attribute drives the property on connect", () => {
    const el = document.createElement("mining-lib-diagram") as MiningLibDiagram;
    el.setAttribute("variant-top-k", "3");
    document.body.appendChild(el);
    el.dfg = n5Dfg;
    el.log = n5Log;
    expect(el.variantTopK).toBe(3);
    openVariantsPopover(el);
    const panel = el.shadowRoot?.querySelector(".mining-lib-panel");
    const rows = panel?.querySelectorAll<HTMLLabelElement>("label.mining-lib-panel-row") ?? [];
    expect(rows[0]?.hidden).toBe(false);
    expect(rows[1]?.hidden).toBe(false);
    expect(rows[2]?.hidden).toBe(false);
    expect(rows[3]?.hidden).toBe(true);
  });

  it("invalid (non-integer or non-positive) variantTopK throws TypeError", () => {
    const el = appendFresh();
    expect(() => {
      el.variantTopK = 0;
    }).toThrow(TypeError);
    expect(() => {
      el.variantTopK = -1;
    }).toThrow(TypeError);
    expect(() => {
      el.variantTopK = 1.5;
    }).toThrow(TypeError);
  });

  it("setting variantTopK does not re-render the SVG (panel-only update)", () => {
    const el = appendFresh();
    el.dfg = n5Dfg;
    el.log = n5Log;
    const svg = el.shadowRoot?.querySelector("svg.mining-lib-svg");
    const node0 = el.shadowRoot?.querySelector("svg g.mining-lib-node");
    el.variantTopK = 2;
    expect(el.shadowRoot?.querySelector("svg.mining-lib-svg")).toBe(svg);
    expect(el.shadowRoot?.querySelector("svg g.mining-lib-node")).toBe(node0);
  });
});

describe("MiningLibDiagram — disconnect / re-connect", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("disconnectedCallback destroys the handle (svg removed from shadow)", () => {
    const el = appendFresh();
    el.dfg = n5Dfg;
    expect(el.shadowRoot?.querySelectorAll("svg.mining-lib-svg")).toHaveLength(1);
    el.remove();
    expect(el.shadowRoot?.querySelectorAll("svg.mining-lib-svg")).toHaveLength(0);
  });

  it("reading handle after disconnect throws", () => {
    const el = appendFresh();
    el.remove();
    expect(() => el.handle).toThrow(/not connected/);
  });

  it("re-connect re-renders with the previously set dfg + log", () => {
    const el = appendFresh();
    el.dfg = n5Dfg;
    el.log = n5Log;
    expect(el.shadowRoot?.querySelectorAll("svg g.mining-lib-node")).toHaveLength(9);
    el.remove();
    expect(el.shadowRoot?.querySelectorAll("svg g.mining-lib-node")).toHaveLength(0);
    document.body.appendChild(el);
    expect(el.shadowRoot?.querySelectorAll("svg g.mining-lib-node")).toHaveLength(9);
    expect(el.handle.getVariants()).toHaveLength(4);
  });
});

describe("MiningLibDiagram — rankdir (Phase 36)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("defaults to undefined (layout falls back to TB)", () => {
    const el = appendFresh();
    expect(el.rankdir).toBeUndefined();
  });

  it('honors `<mining-lib-diagram rankdir="LR">` at first connect', () => {
    const el = document.createElement("mining-lib-diagram") as MiningLibDiagram;
    el.setAttribute("rankdir", "LR");
    document.body.appendChild(el);
    expect(el.rankdir).toBe("LR");
  });

  it("ignores invalid attribute values silently (rankdir stays undefined)", () => {
    const el = document.createElement("mining-lib-diagram") as MiningLibDiagram;
    el.setAttribute("rankdir", "diagonal");
    document.body.appendChild(el);
    expect(el.rankdir).toBeUndefined();
  });

  it("property setter rejects invalid values with a TypeError", () => {
    const el = appendFresh();
    expect(() => {
      (el as unknown as { rankdir: string }).rankdir = "diagonal";
    }).toThrow(TypeError);
  });

  it("property setter reflects to attribute; undefined clears it", () => {
    const el = appendFresh();
    el.rankdir = "LR";
    expect(el.getAttribute("rankdir")).toBe("LR");
    el.rankdir = undefined;
    expect(el.hasAttribute("rankdir")).toBe(false);
  });

  it("renders LR vs TB with distinct node positions on the same dfg", () => {
    function nodeX(el: MiningLibDiagram, activity: string): number {
      const g = el.shadowRoot?.querySelector(`g.mining-lib-node[data-activity="${activity}"]`);
      const match = g?.getAttribute("transform")?.match(/translate\(([-\d.]+)/);
      return match ? Number(match[1]) : Number.NaN;
    }

    const tb = document.createElement("mining-lib-diagram") as MiningLibDiagram;
    document.body.appendChild(tb);
    tb.dfg = n5Dfg;
    const tbStart = nodeX(tb, "submitted");
    const tbEnd = nodeX(tb, "approved");

    const lr = document.createElement("mining-lib-diagram") as MiningLibDiagram;
    lr.setAttribute("rankdir", "LR");
    document.body.appendChild(lr);
    lr.dfg = n5Dfg;
    const lrStart = nodeX(lr, "submitted");
    const lrEnd = nodeX(lr, "approved");

    // TB stacks ranks vertically — sequential nodes share the X axis
    // (start and end nodes are at the same column). LR spreads them
    // horizontally — start.x < end.x by a non-trivial margin.
    expect(Math.abs(tbEnd - tbStart)).toBeLessThan(80);
    expect(lrEnd - lrStart).toBeGreaterThan(200);
  });
});

describe("MiningLibDiagram — rankdir runtime relayout (Phase 37)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function nodeX(el: MiningLibDiagram, activity: string): number {
    const g = el.shadowRoot?.querySelector(`g.mining-lib-node[data-activity="${activity}"]`);
    const match = g?.getAttribute("transform")?.match(/translate\(([-\d.]+)/);
    return match ? Number(match[1]) : Number.NaN;
  }

  it("property setter re-lays-out a rendered diagram from TB to LR", () => {
    const el = appendFresh();
    el.dfg = n5Dfg;
    expect(Math.abs(nodeX(el, "approved") - nodeX(el, "submitted"))).toBeLessThan(80);

    el.rankdir = "LR";

    expect(nodeX(el, "approved") - nodeX(el, "submitted")).toBeGreaterThan(200);
    expect(el.getAttribute("rankdir")).toBe("LR");
  });

  it("attribute set at runtime re-lays-out a rendered diagram from TB to LR", () => {
    const el = appendFresh();
    el.dfg = n5Dfg;
    expect(Math.abs(nodeX(el, "approved") - nodeX(el, "submitted"))).toBeLessThan(80);

    el.setAttribute("rankdir", "LR");

    expect(nodeX(el, "approved") - nodeX(el, "submitted")).toBeGreaterThan(200);
    expect(el.rankdir).toBe("LR");
  });
});
