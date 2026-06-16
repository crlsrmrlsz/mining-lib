import { afterEach, describe, expect, it, vi } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import { buildDfg } from "./buildDfg.js";
import { getVariants, variantSignature } from "./getVariants.js";
import { createDiagram } from "./index.js";
import { parseCsv } from "./parseCsv.js";

const { log: n5Log } = parseCsv(n5Csv);
const n5Dfg = buildDfg(n5Log);
// Shortest variant → its linear DFG has strictly fewer edges than the
// full graph (which carries a rework loop).
const shortestVariant = [...getVariants(n5Log)].sort(
  (a, b) => a.sequence.length - b.sequence.length,
)[0];
if (!shortestVariant) throw new Error("n5 fixture is expected to have variants");

function makeHost(): HTMLDivElement {
  const host = document.createElement("div");
  host.style.width = "1200px";
  host.style.height = "720px";
  document.body.appendChild(host);
  return host;
}

function parse(svgString: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
  return doc.documentElement as unknown as SVGSVGElement;
}

afterEach(() => {
  for (const el of document.querySelectorAll("mining-lib-diagram")) el.remove();
  for (const el of document.querySelectorAll("div")) el.remove();
});

describe("DiagramHandle.exportSvg", () => {
  it("throws a TypeError when called before the first render", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    expect(() => handle.exportSvg()).toThrow(TypeError);
    handle.destroy();
  });

  it("throws a clear error when the rendered diagram is empty (all filtered out)", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render({ nodes: new Map(), edges: new Map() });
    expect(() => handle.exportSvg()).toThrow(/empty/i);
    handle.destroy();
  });

  it("returns a self-contained SVG string after render with the full node/edge set", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    const out = handle.exportSvg();
    expect(out.startsWith("<svg")).toBe(true);
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    const root = parse(out);
    expect(root.querySelectorAll("g.mining-lib-node")).toHaveLength(9);
    expect(root.querySelectorAll("path.mining-lib-edge")).toHaveLength(10);
    expect(root.querySelectorAll("style")).toHaveLength(1);
  });

  it("uses the full-layout bounds as the viewBox (not the host pixel box)", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    const root = parse(handle.exportSvg());
    const viewBox = root.getAttribute("viewBox") ?? "";
    const parts = viewBox.split(" ").map(Number);
    expect(parts).toHaveLength(4);
    expect(parts.every(Number.isFinite)).toBe(true);
    // Origin is the content bounds minus export padding (≤ 0), not the
    // host pixel box; width/height frame the layout (positive, finite).
    expect(parts[0]).toBeLessThanOrEqual(0);
    expect(parts[1]).toBeLessThanOrEqual(0);
    expect(parts[2]).toBeGreaterThan(0);
    expect(parts[3]).toBeGreaterThan(0);
    handle.destroy();
  });

  it("reflects an active variant filter (exports only the filtered edges)", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    const full = parse(handle.exportSvg()).querySelectorAll("path.mining-lib-edge").length;
    // Pin the shortest single variant so the filtered DFG has strictly
    // fewer edges than the unfiltered one (which carries a rework loop).
    handle.setVariantFilter([variantSignature(shortestVariant.sequence)]);
    const filtered = parse(handle.exportSvg()).querySelectorAll("path.mining-lib-edge").length;
    expect(filtered).toBeLessThan(full);
    handle.destroy();
  });
});

describe("DiagramHandle.exportPng", () => {
  it("rejects with a TypeError when called before the first render", async () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    await expect(handle.exportPng()).rejects.toThrow(TypeError);
    handle.destroy();
  });

  it("rejects with a TypeError on a non-positive scale", async () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    await expect(handle.exportPng({ scale: 0 })).rejects.toThrow(TypeError);
    await expect(handle.exportPng({ scale: -1 })).rejects.toThrow(TypeError);
    handle.destroy();
  });
});

describe("export download menu (utilities-pill download icon)", () => {
  function exportTrigger(host: HTMLElement): HTMLButtonElement {
    const el = host.querySelector("mining-lib-diagram");
    const btn = el?.shadowRoot?.querySelector<HTMLButtonElement>('button[data-popover="export"]');
    if (!btn) throw new Error("export trigger not found");
    return btn;
  }

  function popover(host: HTMLElement): HTMLElement | null {
    const el = host.querySelector("mining-lib-diagram");
    return el?.shadowRoot?.querySelector<HTMLElement>(".mining-lib-popover") ?? null;
  }

  it("opens a popover with SVG and PNG options on click, and toggles closed", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    exportTrigger(host).click();
    const pop = popover(host);
    expect(pop).not.toBeNull();
    const options = pop?.querySelectorAll<HTMLButtonElement>("button[data-format]") ?? [];
    expect([...options].map((b) => b.dataset.format)).toEqual(["svg", "png"]);
    // Second click toggles it shut.
    exportTrigger(host).click();
    expect(popover(host)).toBeNull();
    handle.destroy();
  });

  it("the SVG option calls exportSvg and triggers a .svg download", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    const svgSpy = vi.spyOn(handle, "exportSvg");
    const clicks: string[] = [];
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this.download);
    });
    try {
      exportTrigger(host).click();
      popover(host)?.querySelector<HTMLButtonElement>('button[data-format="svg"]')?.click();
    } finally {
      clickSpy.mockRestore();
    }
    expect(svgSpy).toHaveBeenCalledTimes(1);
    expect(clicks).toEqual(["process-diagram.svg"]);
    handle.destroy();
  });

  it("the PNG option calls exportPng", async () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    const pngSpy = vi
      .spyOn(handle, "exportPng")
      .mockResolvedValue(new Blob(["x"], { type: "image/png" }));
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:fake") as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    try {
      exportTrigger(host).click();
      popover(host)?.querySelector<HTMLButtonElement>('button[data-format="png"]')?.click();
      // Let the exportPng promise + download microtasks settle.
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      clickSpy.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
    expect(pngSpy).toHaveBeenCalledTimes(1);
    handle.destroy();
  });
});
