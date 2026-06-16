import { afterEach, describe, expect, it } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import { buildDfg } from "./buildDfg.js";
import { variantSignature } from "./getVariants.js";
import { createDiagram } from "./index.js";
import { parseCsv } from "./parseCsv.js";

const { log: n5Log } = parseCsv(n5Csv);
const n5Dfg = buildDfg(n5Log);

const DIRECT_APPROVAL = [
  "submitted",
  "intake_validation",
  "assigned_to_reviewer",
  "review_in_progress",
  "health_inspection",
  "approved",
];
const EARLY_REJECTION = ["submitted", "intake_validation", "rejected"];

function mountTarget(): HTMLDivElement {
  const div = document.createElement("div");
  div.id = "mount";
  document.body.appendChild(div);
  return div;
}

function shadowSvg(): SVGSVGElement {
  const el = document.querySelector("#mount mining-lib-diagram") as
    | (HTMLElement & { shadowRoot: ShadowRoot | null })
    | null;
  const svg = el?.shadowRoot?.querySelector("svg.mining-lib-svg");
  if (!svg) throw new Error("svg not found in shadow root");
  return svg as SVGSVGElement;
}

function nodeCount(): number {
  return shadowSvg().querySelectorAll("g.mining-lib-node").length;
}

function edgeCount(): number {
  return shadowSvg().querySelectorAll("path.mining-lib-edge").length;
}

describe("DiagramHandle.setVariantFilter / getVariantFilter", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns null initially after render(dfg, log) when total <= variantTopK", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg, n5Log);
    expect(handle.getVariantFilter()).toBeNull();
  });

  it("auto-applies top-K signatures as the default filter when total > variantTopK", () => {
    mountTarget();
    const handle = createDiagram("#mount", { variantTopK: 2 });
    handle.render(n5Dfg, n5Log);
    const filter = handle.getVariantFilter();
    expect(Array.isArray(filter)).toBe(true);
    expect(filter).toHaveLength(2);
    // The diagram is filtered: only the top-2 variants render.
    expect(nodeCount()).toBeLessThan(9);
  });

  it("does NOT auto-apply a default filter when no sourceLog is provided", () => {
    mountTarget();
    const handle = createDiagram("#mount", { variantTopK: 2 });
    handle.render(n5Dfg);
    expect(handle.getVariantFilter()).toBeNull();
  });

  it("filtering to one signature renders that variant only (3 nodes, 2 edges on early-rejection)", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg, n5Log);

    handle.setVariantFilter([variantSignature(EARLY_REJECTION)]);

    expect(nodeCount()).toBe(3);
    expect(edgeCount()).toBe(2);
    expect(
      shadowSvg().querySelector('g.mining-lib-node[data-activity="submitted"]'),
    ).not.toBeNull();
    expect(
      shadowSvg().querySelector('g.mining-lib-node[data-activity="intake_validation"]'),
    ).not.toBeNull();
    expect(shadowSvg().querySelector('g.mining-lib-node[data-activity="rejected"]')).not.toBeNull();
    expect(shadowSvg().querySelector('g.mining-lib-node[data-activity="approved"]')).toBeNull();
  });

  it("setVariantFilter([]) renders an empty diagram (0 nodes, 0 edges) and no placeholder", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg, n5Log);

    handle.setVariantFilter([]);

    expect(nodeCount()).toBe(0);
    expect(edgeCount()).toBe(0);
    const text = shadowSvg().querySelector("text");
    expect(text?.textContent).not.toBe("No data loaded");
  });

  it("setVariantFilter(null) after a non-null filter restores the full DFG", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg, n5Log);

    const fullNodes = nodeCount();
    const fullEdges = edgeCount();

    handle.setVariantFilter([variantSignature(EARLY_REJECTION)]);
    expect(nodeCount()).toBe(3);

    handle.setVariantFilter(null);
    expect(handle.getVariantFilter()).toBeNull();
    expect(nodeCount()).toBe(fullNodes);
    expect(edgeCount()).toBe(fullEdges);
  });

  it("getVariantFilter returns a defensive copy (mutation does not affect handle state)", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg, n5Log);
    const sig = variantSignature(DIRECT_APPROVAL);
    handle.setVariantFilter([sig]);

    const a = handle.getVariantFilter();
    expect(a).toEqual([sig]);
    a?.push("tampered");

    const b = handle.getVariantFilter();
    expect(b).toEqual([sig]);
    expect(b).not.toBe(a);
  });

  it("handle.getVariants() still returns the full variant list while a filter is active", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg, n5Log);

    handle.setVariantFilter([variantSignature(EARLY_REJECTION)]);
    expect(handle.getVariants()).toHaveLength(4);
  });

  it("throws TypeError on non-array, non-null input", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg, n5Log);

    expect(() => handle.setVariantFilter("nope" as unknown as string[])).toThrow(TypeError);
    expect(() => handle.setVariantFilter(123 as unknown as string[])).toThrow(TypeError);
  });

  it("throws TypeError when array contains non-string elements", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg, n5Log);

    expect(() => handle.setVariantFilter([1, 2] as unknown as string[])).toThrow(TypeError);
    expect(() => handle.setVariantFilter(["ok", null] as unknown as string[])).toThrow(TypeError);
  });

  it("setVariantFilter is a no-op when render was called without a sourceLog", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg);

    const before = nodeCount();
    expect(() => handle.setVariantFilter([variantSignature(DIRECT_APPROVAL)])).not.toThrow();
    expect(nodeCount()).toBe(before);
  });

  it("filter resets to null on render(otherDfg, otherLog) (DFG-ref change)", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg, n5Log);
    handle.setVariantFilter([variantSignature(EARLY_REJECTION)]);
    expect(handle.getVariantFilter()).not.toBeNull();

    const newDfg = buildDfg(n5Log);
    handle.render(newDfg, n5Log);

    expect(handle.getVariantFilter()).toBeNull();
  });

  it("unknown signature filters everything out (0 nodes, 0 edges)", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg, n5Log);

    handle.setVariantFilter([variantSignature(["does", "not", "exist"])]);

    expect(nodeCount()).toBe(0);
    expect(edgeCount()).toBe(0);
  });
});
