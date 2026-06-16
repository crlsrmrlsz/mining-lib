/**
 * Phase 32 — self-contained image export.
 *
 * The diagram lives inside a shadow root styled by an *adopted*
 * stylesheet full of `--mining-*` custom properties (theme / preset
 * driven). A naive `outerHTML` of the live `<svg>` produces an unstyled
 * skeleton: the cascade that paints it lives in CSS the SVG node does
 * not carry with it, and the `:host` block that defines every token
 * matches nothing once the SVG is detached from its shadow root.
 *
 * `buildExportSvgString` makes the SVG stand on its own:
 *   1. clones the live render group (`.mining-lib-viewport`) at its
 *      natural layout coordinates, resetting the transient pan/zoom
 *      transform to identity so the *whole* filtered graph is captured,
 *      not the current viewport crop (requirements §Scope / Decision 1);
 *   2. inlines the bundled stylesheet as a `<style>` element;
 *   3. resolves the active `--mining-*` tokens onto the root `<svg>` as
 *      concrete values (since `:host` no longer applies) so the chosen
 *      theme / preset / time-ramp survives the round-trip;
 *   4. paints an opaque backdrop behind the content.
 *
 * The editing-only bend handles and the chrome grid background are left
 * out — the export is the diagram (nodes + edges + labels), not the UI.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

export type ExportSvgOptions = {
  /**
   * Top-left origin of the export `viewBox`, in the render group's
   * coordinate space. Defaults to 0. Non-zero when the rendered content
   * (after node / edge-bend drags) extends left of or above the origin —
   * the export frames the actual content bounds, not the dagre box.
   */
  minX?: number;
  minY?: number;
  /** Content bounds → the export `viewBox` size (and intrinsic size). */
  width: number;
  height: number;
  /** Bundled stylesheet text to inline verbatim as a `<style>` element. */
  css: string;
  /** Resolved `--mining-*` custom properties written onto the root `<svg>`. */
  tokens: Record<string, string>;
  /** Opaque backdrop fill (resolved theme background, never `transparent`). */
  background: string;
  /** Font family written on the root so all `<text>` inherits it. */
  fontFamily: string;
};

/**
 * Build a self-contained SVG string of the full filtered diagram from
 * the live render `<svg>`. Reads `defs` (the shared arrow marker) and
 * the `.mining-lib-viewport` content group, clones them into a fresh
 * root, and assembles the standalone document.
 */
export function buildExportSvgString(source: SVGSVGElement, opts: ExportSvgOptions): string {
  const doc = source.ownerDocument;
  const minX = opts.minX ?? 0;
  const minY = opts.minY ?? 0;
  const root = doc.createElementNS(SVG_NS, "svg");
  root.setAttribute("viewBox", `${minX} ${minY} ${opts.width} ${opts.height}`);
  root.setAttribute("width", String(opts.width));
  root.setAttribute("height", String(opts.height));

  const decls = Object.entries(opts.tokens).map(([name, value]) => `${name}: ${value}`);
  decls.push(`font-family: ${opts.fontFamily}`);
  root.setAttribute("style", decls.join("; "));

  const style = doc.createElementNS(SVG_NS, "style");
  style.textContent = opts.css;
  root.appendChild(style);

  const backdrop = doc.createElementNS(SVG_NS, "rect");
  backdrop.setAttribute("x", String(minX));
  backdrop.setAttribute("y", String(minY));
  backdrop.setAttribute("width", String(opts.width));
  backdrop.setAttribute("height", String(opts.height));
  backdrop.setAttribute("fill", opts.background);
  root.appendChild(backdrop);

  const defs = source.querySelector("defs");
  if (defs) root.appendChild(defs.cloneNode(true));

  const viewport = source.querySelector(".mining-lib-viewport");
  if (viewport) {
    const clone = viewport.cloneNode(true) as SVGGElement;
    // Full-graph capture: discard the live pan/zoom transform so the
    // content draws at its natural 0..width × 0..height coordinates.
    clone.removeAttribute("transform");
    // Bend handles are an editing affordance, not diagram content.
    for (const handles of clone.querySelectorAll(".mining-lib-bend-handles")) {
      handles.remove();
    }
    root.appendChild(clone);
  }

  return new XMLSerializer().serializeToString(root);
}

export type PngExportOptions = {
  /** Device-pixel density multiplier (default 2). Must be finite and > 0. */
  scale?: number;
  /** Intrinsic SVG dimensions (the full-layout bounds). */
  width: number;
  height: number;
  /**
   * Opaque backdrop painted on the canvas before the SVG is drawn — required so
   * the PNG is fully opaque on every engine. Without it the in-SVG backdrop rect
   * is subject to each engine's SVG-rasterization anti-aliasing, so the edge
   * row/column comes back partially transparent (Firefox: corner alpha ~236,
   * Chromium: 255). Pass the resolved theme background (never `transparent`).
   */
  background: string;
};

const DEFAULT_PNG_SCALE = 2;

/**
 * Rasterize a self-contained SVG string to a PNG `Blob` at `scale`
 * device-pixel density via an offscreen `<canvas>`. The SVG is loaded
 * through a data URL into an `<img>`, so resolution waits on the image
 * decode — hence the `Promise`. `scale` is validated up front so a bad
 * value rejects before any image work.
 */
export async function svgStringToPngBlob(svgString: string, opts: PngExportOptions): Promise<Blob> {
  const scale = opts.scale ?? DEFAULT_PNG_SCALE;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new TypeError(`exportPng: scale must be a finite number > 0, got ${String(opts.scale)}`);
  }

  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("exportPng: failed to load the SVG for rasterization"));
    img.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(opts.width * scale));
  canvas.height = Math.max(1, Math.round(opts.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("exportPng: 2D canvas context is unavailable");
  }
  // Paint the opaque backdrop first so every pixel is fully opaque — including
  // the AA-blended edge row/column some engines produce when rasterizing the
  // SVG (relying on the in-SVG backdrop rect alone leaves Firefox corners at
  // alpha ~236). Drawn under the SVG, so it never alters the visible content.
  ctx.fillStyle = opts.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("exportPng: canvas.toBlob produced no blob"));
    }, "image/png");
  });
}

/**
 * Trigger a browser file download for a `Blob` or a string payload via
 * a synthetic `<a download>` click. Strings become a data URL; blobs use
 * an object URL revoked shortly after the click (immediate revoke can
 * cancel the download in some browsers, so it is deferred a tick).
 */
export function triggerDownload(data: Blob | string, filename: string, mime: string): void {
  let href: string;
  let objectUrl: string | null = null;
  if (typeof data === "string") {
    href = `data:${mime};charset=utf-8,${encodeURIComponent(data)}`;
  } else {
    objectUrl = URL.createObjectURL(data);
    href = objectUrl;
  }

  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  if (objectUrl !== null) {
    const toRevoke = objectUrl;
    setTimeout(() => URL.revokeObjectURL(toRevoke), 0);
  }
}

/**
 * Extract every distinct `--mining-*` custom-property name referenced
 * in a stylesheet, in first-seen order. The caller resolves each name
 * against the live host's computed style and writes the concrete values
 * onto the exported root — getComputedStyle can't enumerate custom
 * properties, so the name list has to come from the CSS text itself.
 */
export function collectMiningTokenNames(css: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const match of css.matchAll(/--mining-[\w-]+/g)) {
    const name = match[0];
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}
