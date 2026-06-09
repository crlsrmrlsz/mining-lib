import { describe, expect, test, vi } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import { buildDfg } from "./buildDfg.js";
import {
  buildExportSvgString,
  collectMiningTokenNames,
  svgStringToPngBlob,
  triggerDownload,
} from "./exportImage.js";
import { layoutDfg } from "./layoutDfg.js";
import { parseCsv } from "./parseCsv.js";
import { renderDfg } from "./renderDfg.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const { log } = parseCsv(n5Csv);
const dfg = buildDfg(log);
const layout = layoutDfg(dfg);

/** Build a live-shaped SVG (defs + .mining-lib-viewport) like mountDiagram → renderDfg. */
function renderedSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  renderDfg(svg, layout);
  return svg;
}

function parse(svgString: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
  return doc.documentElement as unknown as SVGSVGElement;
}

const SAMPLE_CSS = ".mining-lib-edge { stroke: var(--mining-edge-stroke); }";
const SAMPLE_TOKENS = {
  "--mining-node-fill": "#abcdef",
  "--mining-edge-stroke": "#123456",
};

describe("buildExportSvgString — structure", () => {
  test("returns a self-contained <svg> with xmlns and the full-layout viewBox", () => {
    const out = buildExportSvgString(renderedSvg(), {
      width: layout.width,
      height: layout.height,
      css: SAMPLE_CSS,
      tokens: SAMPLE_TOKENS,
      background: "#ffffff",
      fontFamily: "system-ui",
    });
    expect(out.startsWith("<svg")).toBe(true);
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    const root = parse(out);
    expect(root.getAttribute("viewBox")).toBe(`0 0 ${layout.width} ${layout.height}`);
  });

  test("inlines exactly one <style> element carrying the passed CSS", () => {
    const out = buildExportSvgString(renderedSvg(), {
      width: layout.width,
      height: layout.height,
      css: SAMPLE_CSS,
      tokens: SAMPLE_TOKENS,
      background: "#ffffff",
      fontFamily: "system-ui",
    });
    const root = parse(out);
    const styles = root.querySelectorAll("style");
    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent).toContain("--mining-edge-stroke");
  });

  test("preserves the full node + edge set from the live render group", () => {
    const out = buildExportSvgString(renderedSvg(), {
      width: layout.width,
      height: layout.height,
      css: SAMPLE_CSS,
      tokens: SAMPLE_TOKENS,
      background: "#ffffff",
      fontFamily: "system-ui",
    });
    const root = parse(out);
    expect(root.querySelectorAll("g.mining-lib-node")).toHaveLength(9);
    expect(root.querySelectorAll("path.mining-lib-edge")).toHaveLength(10);
    expect(root.querySelectorAll("marker#mining-lib-arrow")).toHaveLength(1);
  });

  test("writes the resolved tokens + font-family as inline style on the root", () => {
    const out = buildExportSvgString(renderedSvg(), {
      width: layout.width,
      height: layout.height,
      css: SAMPLE_CSS,
      tokens: SAMPLE_TOKENS,
      background: "#ffffff",
      fontFamily: "system-ui",
    });
    const root = parse(out);
    const style = root.getAttribute("style") ?? "";
    expect(style).toContain("--mining-node-fill: #abcdef");
    expect(style).toContain("--mining-edge-stroke: #123456");
    expect(style).toContain("font-family: system-ui");
  });

  test("honours a non-zero viewBox origin (minX/minY) on the root and the backdrop", () => {
    const out = buildExportSvgString(renderedSvg(), {
      minX: -40,
      minY: -12,
      width: layout.width,
      height: layout.height,
      css: SAMPLE_CSS,
      tokens: SAMPLE_TOKENS,
      background: "#ffffff",
      fontFamily: "system-ui",
    });
    const root = parse(out);
    expect(root.getAttribute("viewBox")).toBe(`-40 -12 ${layout.width} ${layout.height}`);
    const rect = root.querySelector("rect");
    expect(rect?.getAttribute("x")).toBe("-40");
    expect(rect?.getAttribute("y")).toBe("-12");
  });

  test("paints an opaque background rect spanning the viewBox behind the content", () => {
    const out = buildExportSvgString(renderedSvg(), {
      width: layout.width,
      height: layout.height,
      css: SAMPLE_CSS,
      tokens: SAMPLE_TOKENS,
      background: "#0d0e12",
      fontFamily: "system-ui",
    });
    const root = parse(out);
    const rect = root.querySelector("rect");
    expect(rect?.getAttribute("fill")).toBe("#0d0e12");
    expect(rect?.getAttribute("width")).toBe(String(layout.width));
    expect(rect?.getAttribute("height")).toBe(String(layout.height));
    // The backdrop must precede the content group in document order.
    const viewport = root.querySelector("g.mining-lib-viewport");
    expect(rect && viewport && rect.compareDocumentPosition(viewport)).toBeTruthy();
    expect(
      rect && viewport
        ? Boolean(rect.compareDocumentPosition(viewport) & Node.DOCUMENT_POSITION_FOLLOWING)
        : false,
    ).toBe(true);
  });
});

describe("buildExportSvgString — full-graph capture", () => {
  test("resets the cloned viewport transform to identity (ignores live pan/zoom)", () => {
    const svg = renderedSvg();
    svg
      .querySelector(".mining-lib-viewport")
      ?.setAttribute("transform", "translate(123,456) scale(3)");
    const out = buildExportSvgString(svg, {
      width: layout.width,
      height: layout.height,
      css: SAMPLE_CSS,
      tokens: SAMPLE_TOKENS,
      background: "#ffffff",
      fontFamily: "system-ui",
    });
    const root = parse(out);
    const viewport = root.querySelector("g.mining-lib-viewport");
    expect(viewport?.getAttribute("transform")).toBeNull();
  });

  test("strips the bend-handle editing affordances from the export", () => {
    const svg = renderedSvg();
    expect(svg.querySelectorAll("circle.mining-lib-bend-handle").length).toBeGreaterThan(0);
    const out = buildExportSvgString(svg, {
      width: layout.width,
      height: layout.height,
      css: SAMPLE_CSS,
      tokens: SAMPLE_TOKENS,
      background: "#ffffff",
      fontFamily: "system-ui",
    });
    const root = parse(out);
    expect(root.querySelectorAll("circle.mining-lib-bend-handle")).toHaveLength(0);
    expect(root.querySelectorAll("circle.mining-lib-bend-handle-hit")).toHaveLength(0);
  });
});

describe("collectMiningTokenNames", () => {
  test("extracts every distinct --mining-* token name referenced in CSS", () => {
    const css = `
      .a { color: var(--mining-node-text); fill: var(--mining-node-fill); }
      .b { stroke: var(--mining-edge-stroke); }
      :host { --mining-fs-base: 12px; --mining-node-text: #000; }
    `;
    const names = collectMiningTokenNames(css);
    expect(names).toContain("--mining-node-text");
    expect(names).toContain("--mining-node-fill");
    expect(names).toContain("--mining-edge-stroke");
    expect(names).toContain("--mining-fs-base");
    // Deduped — node-text appears twice in the source.
    expect(names.filter((n) => n === "--mining-node-text")).toHaveLength(1);
  });

  test("returns an empty array when no tokens are present", () => {
    expect(collectMiningTokenNames(".a { color: red; }")).toEqual([]);
  });
});

describe("svgStringToPngBlob — scale validation", () => {
  // The pixel-dimension + image/png assertions need a real canvas
  // raster, which jsdom does not provide — those live in the Playwright
  // e2e (tests/e2e/imageExport.spec.ts). Here we only pin the input
  // contract, which rejects before any image load or canvas work.
  test("rejects a zero scale with a TypeError", async () => {
    await expect(
      svgStringToPngBlob("<svg/>", { scale: 0, width: 10, height: 10, background: "#fff" }),
    ).rejects.toThrow(TypeError);
  });

  test("rejects a negative scale with a TypeError", async () => {
    await expect(
      svgStringToPngBlob("<svg/>", { scale: -2, width: 10, height: 10, background: "#fff" }),
    ).rejects.toThrow(TypeError);
  });

  test("rejects a non-finite scale with a TypeError", async () => {
    await expect(
      svgStringToPngBlob("<svg/>", {
        scale: Number.NaN,
        width: 10,
        height: 10,
        background: "#fff",
      }),
    ).rejects.toThrow(TypeError);
  });
});

describe("triggerDownload", () => {
  test("clicks an <a download> carrying the filename and a data URL for a string", () => {
    const clicked: { download: string; href: string }[] = [];
    const spy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ download: this.download, href: this.href });
    });
    try {
      triggerDownload("<svg>x</svg>", "process-diagram.svg", "image/svg+xml");
    } finally {
      spy.mockRestore();
    }
    expect(clicked).toHaveLength(1);
    expect(clicked[0]?.download).toBe("process-diagram.svg");
    expect(clicked[0]?.href.startsWith("data:image/svg+xml")).toBe(true);
  });

  test("uses an object URL for a Blob and clicks the anchor", () => {
    const createSpy = vi.fn(() => "blob:fake-url");
    const revokeSpy = vi.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createSpy as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeSpy as unknown as typeof URL.revokeObjectURL;
    const clicked: { download: string; href: string }[] = [];
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ download: this.download, href: this.href });
    });
    try {
      triggerDownload(
        new Blob(["data"], { type: "image/png" }),
        "process-diagram.png",
        "image/png",
      );
    } finally {
      clickSpy.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(clicked).toHaveLength(1);
    expect(clicked[0]?.download).toBe("process-diagram.png");
    expect(clicked[0]?.href).toBe("blob:fake-url");
  });
});
