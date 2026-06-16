import { select } from "d3-selection";
import { zoom as d3zoom, type ZoomBehavior, type ZoomTransform, zoomIdentity } from "d3-zoom";
import { buildDfg } from "./buildDfg.js";
import { getTerminalNodeDurations } from "./caseDuration.js";
import { computeFitToView } from "./computeFitToView.js";
import type { DateClauseState } from "./dateFilterSection.js";
import { createDiagramDrag } from "./diagramDrag.js";
import { createDiagramPopovers, type DiagramPopovers } from "./diagramPopovers.js";
import { createDiagramSelection, type DiagramSelection } from "./diagramSelection.js";
import type {
  CreateDiagramConfig,
  DiagramHandle,
  PngExportConfig,
  SelectionTarget,
  ZoomConfig,
} from "./diagramTypes.js";
import {
  buildExportSvgString,
  collectMiningTokenNames,
  type ExportSvgOptions,
  svgStringToPngBlob,
} from "./exportImage.js";
import {
  buildFilteredLogFromClauses,
  clauseEquals,
  clausesEqual,
  cloneClause,
  type FilterClause,
  getClause,
  replaceClause,
  validateFilterClauses,
} from "./filterClauses.js";
import { createFiltersPanel, type FiltersPanelInstance } from "./filtersPanel.js";
import { buildFiltersPanelHooks } from "./filtersPanelHooks.js";
import { getVariants, variantSignature } from "./getVariants.js";
import { computeHappyPathOverlay } from "./happyPath.js";
import { applyEdgeOverrides, applyPositionOverrides, layoutDfg } from "./layoutDfg.js";
import miningLibCss from "./mining-lib.css?inline";
import { type ControlsConfig, DEFAULT_CONTROLS, serializeControls } from "./parseControls.js";
import { isPresetName, type PresetName, presetBaseline } from "./presets.js";
import { renderDfg } from "./renderDfg.js";
import { mergeTheme, type ResolvedTheme, type Theme } from "./theme.js";
import { createToolbar, type ToolbarInstance } from "./toolbar.js";
import { createDiagramTrace } from "./traceCoordination.js";
import type { CountMode, Dfg, EventLog } from "./types.js";
import { createVariantPanel, type VariantPanelInstance } from "./variantPanel.js";
import { createVariantsPanel, type VariantsPanelInstance } from "./variantsPanel.js";

function validateSelectionTarget(target: unknown): asserts target is SelectionTarget {
  if (target === null || typeof target !== "object") {
    throw new TypeError("DiagramHandle.select: target must be { kind, id } or null");
  }
  const t = target as { kind?: unknown; id?: unknown };
  if (t.kind !== "node" && t.kind !== "edge") {
    throw new TypeError(
      `DiagramHandle.select: kind must be "node" | "edge", got ${String(t.kind)}`,
    );
  }
  if (typeof t.id !== "string" || t.id.length === 0) {
    throw new TypeError("DiagramHandle.select: id must be a non-empty string");
  }
}

export type MountResult = {
  handle: DiagramHandle;
  setVariantTopK(k: number): void;
};

const DEFAULT_VARIANT_TOP_K = 5;

function validateVariantTopK(k: number): void {
  if (!Number.isInteger(k) || k < 1) {
    throw new TypeError(`variantTopK must be a positive integer, got ${String(k)}`);
  }
}

const SVG_NS = "http://www.w3.org/2000/svg";

// Used by Filters-panel hooks when no log is loaded yet — the date
// section auto-hides on empty logs so this never reaches the matcher.
const EMPTY_LOG_FOR_HOOKS: EventLog = {
  cases: new Map(),
  events: [],
  schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
};

const VALID_MODES: readonly CountMode[] = [
  "absolute",
  "case",
  "meanRepetitions",
  "maxRepetitions",
  "meanDuration",
  "medianDuration",
];

// Phase 32 — the set of `--mining-*` token names the export resolves
// onto the standalone SVG root. Derived once from the bundled CSS text
// (the single source of truth) so new tokens are picked up automatically.
const EXPORT_TOKEN_NAMES = collectMiningTokenNames(miningLibCss);

// Breathing room added around the measured content bounds in an export,
// so 1 px strokes, arrowhead markers, and labels at the extreme edges
// aren't flush against (or clipped by) the image border.
const EXPORT_PADDING = 16;

/**
 * Resolve the opaque backdrop colour for an exported image. `--mining-bg`
 * is `transparent` by design (the diagram sits on the embedder's page),
 * so a standalone export falls back to the theme's canvas tone — white
 * for light, black for dark — when no concrete background is set.
 */
function exportBackground(theme: ResolvedTheme): string {
  const bg = theme.background?.trim();
  if (bg && bg !== "transparent" && bg !== "none") return bg;
  return theme.dark ? "#000000" : "#ffffff";
}

export function validateZoomConfig(zoom: ZoomConfig | undefined): void {
  const minScale = zoom?.minScale ?? 0.1;
  const maxScale = zoom?.maxScale ?? 10;
  if (!Number.isFinite(minScale) || minScale <= 0) {
    throw new TypeError(
      `createDiagram: zoom.minScale must be a finite number > 0, got ${String(minScale)}`,
    );
  }
  if (!Number.isFinite(maxScale) || maxScale < minScale) {
    throw new TypeError(
      `createDiagram: zoom.maxScale (${String(maxScale)}) must be a finite number >= zoom.minScale (${minScale})`,
    );
  }
}

export function createDiagram(
  target: string | HTMLElement,
  config: CreateDiagramConfig,
): DiagramHandle {
  validateZoomConfig(config?.zoom);
  if (config?.variantTopK !== undefined) validateVariantTopK(config.variantTopK);
  if (config?.preset !== undefined && !isPresetName(config.preset)) {
    throw new TypeError(
      `createDiagram: preset must be one of "default" | "linear" | "paper", got ${String(config.preset)}`,
    );
  }
  if (config?.rankdir !== undefined && config.rankdir !== "LR" && config.rankdir !== "TB") {
    throw new TypeError(
      `createDiagram: rankdir must be "LR" or "TB", got ${String(config.rankdir)}`,
    );
  }
  const host = resolveTarget(target);
  const el = document.createElement("mining-lib-diagram") as HTMLElement & {
    theme: Theme | "light" | "dark" | undefined;
    countMode: CountMode | undefined;
    zoom: ZoomConfig | undefined;
    variantTopK: number;
    preset: PresetName | undefined;
    rankdir: "LR" | "TB" | undefined;
    happyPathVariant: string[] | undefined;
    traceCase: string | undefined;
    handle: DiagramHandle;
  };
  if (config?.preset !== undefined) el.preset = config.preset;
  if (config?.rankdir !== undefined) el.rankdir = config.rankdir;
  if (config?.theme !== undefined) el.theme = config.theme;
  if (config?.countMode !== undefined) el.countMode = config.countMode;
  if (config?.zoom !== undefined) el.zoom = config.zoom;
  if (config?.variantTopK !== undefined) el.variantTopK = config.variantTopK;
  if (config?.happyPathVariant !== undefined) el.happyPathVariant = config.happyPathVariant;
  if (config?.traceCase !== undefined) el.traceCase = config.traceCase;
  if (config?.controls !== undefined) {
    el.setAttribute("controls", serializeControls(config.controls));
  }
  host.appendChild(el);
  return el.handle;
}

export function mountDiagram(
  root: ShadowRoot | HTMLElement,
  themeHost: HTMLElement,
  config: CreateDiagramConfig,
): MountResult {
  const {
    countMode = "absolute",
    zoom: zoomConfig,
    variantTopK: initialTopK = DEFAULT_VARIANT_TOP_K,
    rankdir = "TB",
  } = config ?? {};
  validateVariantTopK(initialTopK);
  let currentTopK = initialTopK;
  const minScale = zoomConfig?.minScale ?? 0.1;
  const maxScale = zoomConfig?.maxScale ?? 10;
  if (!Number.isFinite(minScale) || minScale <= 0) {
    throw new TypeError(
      `createDiagram: zoom.minScale must be a finite number > 0, got ${String(minScale)}`,
    );
  }
  if (!Number.isFinite(maxScale) || maxScale < minScale) {
    throw new TypeError(
      `createDiagram: zoom.maxScale (${String(maxScale)}) must be a finite number >= zoom.minScale (${minScale})`,
    );
  }

  // Rails wrap around the canvas at desktop (Phase 18); even at
  // narrow widths the container persists so the form-factor flip
  // doesn't have to rewrite the DOM tree. The container is the
  // single flex row inside the shadow; the SVG and either rail are
  // its flex children, with the absolute-positioned pills (utilities
  // / zoom / narrow primary) staying as siblings of the container
  // on the host.
  // Phase 28 (2026-05-22) — `:host` is a 3-row CSS grid: top chrome
  // bar, SVG cell, bottom chrome bar. The grid is enforced via
  // `display: grid !important` so light-DOM overrides
  // (`mining-lib-diagram { display: block }` from showcase pages)
  // can't break the layout.
  const chromeTopBar = document.createElement("div");
  chromeTopBar.className = "mining-lib-chrome-top-bar";
  chromeTopBar.setAttribute("part", "chrome-top");
  root.appendChild(chromeTopBar);

  const svgCell = document.createElement("div");
  svgCell.className = "mining-lib-svg-cell";
  svgCell.setAttribute("part", "svg-cell");
  root.appendChild(svgCell);

  const chromeBottomBar = document.createElement("div");
  chromeBottomBar.className = "mining-lib-chrome-bottom-bar";
  chromeBottomBar.setAttribute("part", "chrome-bottom");
  root.appendChild(chromeBottomBar);

  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  // Initial placeholder viewBox; replaced by syncViewBox once the host
  // is in the DOM and has measurable pixel dimensions.
  svg.setAttribute("viewBox", "0 0 400 200");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");

  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("x", "50%");
  text.setAttribute("y", "50%");
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "central");
  text.textContent = "No data loaded";

  svg.appendChild(text);
  svg.setAttribute("class", "mining-lib-svg");
  svg.setAttribute("part", "svg");
  svgCell.appendChild(svg);

  // The diagram is an interactive graph, not document content. Suppress
  // the browser's right-click menu so it doesn't intercept future
  // context-aware affordances reserved for right-click.
  svg.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  function syncViewBox(): void {
    const r = svg.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      svg.setAttribute("viewBox", `0 0 ${r.width} ${r.height}`);
    }
  }
  syncViewBox();

  let destroyed = false;
  let currentDfg: Dfg | null = null;
  let currentLog: EventLog | null = null;
  // Phase 24 — pinned happy-path sequence (null = overlay off). Seeded
  // from `config.happyPathVariant`; mutated by `setHappyPathVariant`
  // and by the defensive auto-clear in `clearStaleHappyPath` when
  // filtering removes the pinned variant from the case set.
  let currentHappyPathSequence: string[] | null = Array.isArray(config?.happyPathVariant)
    ? [...config.happyPathVariant]
    : null;
  // Phase 27 (2026-05-22 refold) — the trace pin is now derived from
  // the `caseId` filter clause list. `setTraceCase` is a thin wrapper
  // that pushes / strips a single-id `caseId` clause through the same
  // `setFilters` pipeline as any other clause; `getTraceCase` reads it
  // back. Construction-time `config.traceCase` is staged here and
  // applied through `setTraceCase` once the handle is built (so the
  // clause flows through the standard validation + dedup path).
  const initialTraceCase: string | null =
    typeof config?.traceCase === "string" && config.traceCase.length > 0 ? config.traceCase : null;

  function readTraceCaseFromClauses(): string | null {
    const c = getClause(activeClauses, "caseId");
    if (!c || c.caseIds.length !== 1) return null;
    return c.caseIds[0] ?? null;
  }
  // The log corresponding to currentDfg — equals currentLog when no
  // clauses are active, otherwise the buildFilteredLogFromClauses
  // result. Used by draw() to compute terminal-node durations against
  // the filtered case set (Phase 23).
  let currentFilteredLog: EventLog | null = null;
  let originalDfg: Dfg | null = null;
  let activeClauses: FilterClause[] = [];
  let currentMode: CountMode = countMode;
  // Phase 37 — mutable copy of the destructured `rankdir` const so
  // setRankdir can flip the dagre layout direction at runtime.
  let currentRankdir: "LR" | "TB" = rankdir;
  let currentTransform: ZoomTransform = zoomIdentity;
  let fitTransform: ZoomTransform = zoomIdentity;
  let lastLayoutDims = { width: 0, height: 0 };
  let currentPresetName: PresetName = config.preset ?? "default";
  let currentTheme: ResolvedTheme = (() => {
    const wantDark = config.theme?.dark ?? false;
    const baseline = presetBaseline(currentPresetName, wantDark);
    return mergeTheme(baseline, baseline, baseline, config.theme ?? {});
  })();
  // The selection seam (current selection + floating pill) lives in
  // `selection`, created once `controls` + `handle` exist (below).
  let selection: DiagramSelection | null = null;
  const nodeOverrides = new Map<string, { x: number; y: number }>();
  const edgeOverrides = new Map<string, { x: number; y: number }[]>();

  function readPadding(): number {
    const raw = getComputedStyle(themeHost).getPropertyValue("--mining-fit-padding").trim();
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 16;
  }

  function rebuildAndDraw(): void {
    if (originalDfg === null) return;
    nodeOverrides.clear();
    edgeOverrides.clear();
    if (currentLog === null || activeClauses.length === 0) {
      currentDfg = originalDfg;
      currentFilteredLog = currentLog;
      clearStaleHappyPath(currentFilteredLog);
      draw(originalDfg, true);
    } else {
      const filteredLog = buildFilteredLogFromClauses(currentLog, activeClauses);
      const filteredDfg = filteredLog === currentLog ? originalDfg : buildDfg(filteredLog);
      currentDfg = filteredDfg;
      currentFilteredLog = filteredLog;
      clearStaleHappyPath(currentFilteredLog);
      draw(filteredDfg, true);
    }
    updateAllPanels();
  }

  // Phase 24 — defensive clear of the happy-path pin when the
  // filtered log no longer contains the pinned sequence. Cheap O(1)
  // exit when no pin is set; O(events) when one is. See D6 in
  // requirements.md.
  function clearStaleHappyPath(filteredLog: EventLog | null): void {
    if (currentHappyPathSequence === null || filteredLog === null) return;
    const pinnedSig = variantSignature(currentHappyPathSequence);
    const variants = getVariants(filteredLog);
    if (!variants.some((v) => variantSignature(v.sequence) === pinnedSig)) {
      currentHappyPathSequence = null;
    }
  }

  const controls: ControlsConfig = config.controls ?? DEFAULT_CONTROLS;

  selection = createDiagramSelection({
    svg,
    svgCell,
    themeHost,
    controls,
    getCurrentLog: () => currentLog,
    getActiveClauses: () => activeClauses,
    setFilters: (clauses) => handle.setFilters(clauses),
  });

  // Form-factor flip: below this host width we swap the utilities pill
  // from the top-right to the bottom-right, mirroring zoom on the
  // bottom-left. Excalidraw uses 599px for phone; ours embeds inside
  // narrower hosts (320px column demos), so we're more aggressive.
  const NARROW_BREAKPOINT = 480;

  function formFactorFor(width: number): "narrow" | "wide" {
    return width <= NARROW_BREAKPOINT ? "narrow" : "wide";
  }

  function viewportSize(): { width: number; height: number } {
    const r = svg.getBoundingClientRect();
    return { width: r.width, height: r.height };
  }

  function chromeInsets(): { top: number; bottom: number; left: number; right: number } {
    // Phase 22c: the chrome is the toolbar's pill trio (top) +
    // utilities (top-right) + zoom (bottom-left). Subtract the
    // toolbar-measured insets so no node sits behind a pill.
    const utilsAtBottom = themeHost.dataset.formFactor === "narrow";
    const tb = toolbar?.measureInsets({ utilsAtBottom }) ?? { top: 0, bottom: 0 };
    return { top: tb.top, bottom: tb.bottom, left: 0, right: 0 };
  }

  function recomputeFit(layout: {
    width: number;
    height: number;
    minX?: number;
    minY?: number;
  }): ZoomTransform {
    const r = svg.getBoundingClientRect();
    // Zero-size viewport (jsdom, detached host) falls through to the
    // identity transform — skip the inset math entirely so callers see
    // a clean { x: 0, y: 0, k: 1 } rather than a ghost shift.
    if (r.width <= 0 || r.height <= 0) {
      const fit = computeFitToView(layout, { width: r.width, height: r.height }, readPadding());
      return zoomIdentity.translate(fit.x, fit.y).scale(fit.k);
    }
    const { top, bottom, left, right } = chromeInsets();
    const visible = {
      width: Math.max(0, r.width - left - right),
      height: Math.max(0, r.height - top - bottom),
    };
    const fit = computeFitToView(layout, visible, readPadding());
    // The SVG is full-size; shift the centred band down by `top` and
    // right by `left` so the graph lands inside the chrome-free
    // rectangle (between Mode pill / primary pill on top, right rail
    // on the right, utilities + zoom on the bottom).
    return zoomIdentity.translate(fit.x + left, fit.y + top).scale(fit.k);
  }

  // Named "refire fit" path shared by the host ResizeObserver and the
  // rail collapse/expand callback. Resets the camera to the fit
  // transform exactly like a window resize would — pan/zoom state is
  // intentionally discarded since the visible area shape just
  // changed and any prior position would no longer make sense.
  function refireFit(): void {
    if (currentDfg === null) return;
    syncViewBox();
    const bounds = navigableBounds();
    fitTransform = recomputeFit(bounds);
    currentTransform = fitTransform;
    zoomBehavior.transform(svgSelection, currentTransform);
  }

  const THEME_VAR_KEYS = [
    ["--mining-node-fill", "nodeFill"],
    ["--mining-node-stroke", "nodeStroke"],
    ["--mining-node-text", "nodeText"],
    ["--mining-node-muted-text", "nodeMutedText"],
    ["--mining-edge-stroke", "edgeStroke"],
    ["--mining-edge-label-text", "edgeLabelText"],
    ["--mining-edge-label-fill", "edgeLabelFill"],
    ["--mining-edge-label-stroke", "edgeLabelStroke"],
    ["--mining-bg", "background"],
    ["--mining-font-family", "fontFamily"],
    ["--mining-accent", "accent"],
    ["--mining-accent-fg", "accentForeground"],
    ["--mining-pill-shadow", "pillShadow"],
    ["--mining-grid-dot", "gridDot"],
    ["--mining-mono", "monoFontFamily"],
    ["--mining-time-ramp-low", "timeRampLow"],
    ["--mining-time-ramp-high", "timeRampHigh"],
    ["--mining-overlay-fade-opacity", "overlayFadeOpacity"],
    ["--mining-happy-stroke", "happyStroke"],
    ["--mining-happy-node-fill", "happyNodeFill"],
  ] as const;

  function applyThemeToSvg(theme: ResolvedTheme): void {
    for (const [varName, key] of THEME_VAR_KEYS) {
      themeHost.style.setProperty(varName, String(theme[key]));
    }
    // Write the token the labels + chrome actually read (`--mining-fs-base`),
    // NOT the `--mining-font-size` alias (which nothing reads) — otherwise
    // `theme.fontSize` is inert for text yet still sizes node boxes via
    // layoutDfg, producing oversized boxes. The CSS alias still derives from
    // this. (Phase 38-II B1.)
    themeHost.style.setProperty("--mining-fs-base", `${theme.fontSize}px`);
    themeHost.style.setProperty("--mining-radius", `${theme.borderRadius}px`);
    themeHost.setAttribute("data-theme", theme.dark ? "dark" : "light");
    themeHost.setAttribute("data-preset", currentPresetName);
    svg.setAttribute("data-theme", theme.dark ? "dark" : "light");
    svg.setAttribute("data-preset", currentPresetName);
  }

  applyThemeToSvg(currentTheme);

  // Phase 32 — resolve the active `--mining-*` tokens for export. The
  // `:host` block that defines them matches nothing once the SVG leaves
  // its shadow root, so each token referenced by the stylesheet is read
  // off the live host's computed style and written inline onto the
  // exported root. getComputedStyle can't enumerate custom properties,
  // hence the name list precomputed from the CSS text.
  function resolveExportTokens(): Record<string, string> {
    const computed = getComputedStyle(themeHost);
    const tokens: Record<string, string> = {};
    for (const name of EXPORT_TOKEN_NAMES) {
      const value = computed.getPropertyValue(name).trim();
      if (value) tokens[name] = value;
    }
    return tokens;
  }

  function resolveFontFamily(): string {
    const fromHost = getComputedStyle(themeHost).getPropertyValue("--mining-font-family").trim();
    return fromHost || currentTheme.fontFamily;
  }

  // Phase 32 — the region an export should frame. The dagre
  // `lastLayoutDims` box does NOT grow when nodes/edges are dragged
  // outside it (applyEdgeOverrides / applyPositionOverrides keep the
  // original width/height), so framing to it clips dragged-out content.
  // Measure the actual rendered geometry instead via getBBox on the live
  // (attached, laid-out) render group — it captures node/bend drag
  // overrides, edge curves, and every label. Falls back to the dagre box
  // when getBBox is unavailable or returns zero (jsdom / not laid out).
  function contentBounds(): { minX: number; minY: number; width: number; height: number } {
    const viewport = svg.querySelector<SVGGElement>(".mining-lib-viewport");
    if (viewport && typeof viewport.getBBox === "function") {
      try {
        const b = viewport.getBBox();
        if (b.width > 0 && b.height > 0) {
          return { minX: b.x, minY: b.y, width: b.width, height: b.height };
        }
      } catch {
        // jsdom raises on getBBox — fall through to the dagre-box fallback.
      }
    }
    return { minX: 0, minY: 0, width: lastLayoutDims.width, height: lastLayoutDims.height };
  }

  function exportContentBox(): { minX: number; minY: number; width: number; height: number } {
    const b = contentBounds();
    return {
      minX: b.minX - EXPORT_PADDING,
      minY: b.minY - EXPORT_PADDING,
      width: b.width + EXPORT_PADDING * 2,
      height: b.height + EXPORT_PADDING * 2,
    };
  }

  // Phase 32 — the navigable area: the union of the dagre layout box and
  // the actual rendered content. Unioning with the dagre box means the
  // pannable area never shrinks below the original layout (so at-rest
  // pan/fit behaviour is unchanged), but it grows in any direction a node
  // or edge bend is dragged — so dragged-out content is always reachable
  // by panning instead of being stranded off-canvas.
  function navigableBounds(): { minX: number; minY: number; width: number; height: number } {
    const b = contentBounds();
    const minX = Math.min(0, b.minX);
    const minY = Math.min(0, b.minY);
    const maxX = Math.max(lastLayoutDims.width, b.minX + b.width);
    const maxY = Math.max(lastLayoutDims.height, b.minY + b.height);
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  }

  function buildExportOptions(box: {
    minX: number;
    minY: number;
    width: number;
    height: number;
  }): ExportSvgOptions {
    return {
      minX: box.minX,
      minY: box.minY,
      width: box.width,
      height: box.height,
      css: miningLibCss,
      tokens: resolveExportTokens(),
      background: exportBackground(currentTheme),
      fontFamily: resolveFontFamily(),
    };
  }

  const svgSelection = select(svg);
  const zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> = d3zoom<SVGSVGElement, unknown>()
    .scaleExtent([minScale, maxScale])
    .filter((event: Event) => {
      if (currentDfg === null) return false;
      const target = event.target as Element | null;
      if (
        target?.closest(
          "g.mining-lib-node, circle.mining-lib-bend-handle, circle.mining-lib-bend-handle-hit",
        )
      ) {
        return false;
      }
      return true;
    })
    // Camera pan is unbounded (free pan): the diagram can be moved fully
    // off-screen in any direction at any zoom — `scaleExtent` still bounds
    // zoom, but `translateExtent` is left at d3's default (±∞) and no custom
    // `constrain` is applied, so there is no pan clamp. `resetView()` (also
    // `0` / double-click) re-frames the graph to fit.
    .on("zoom", (event) => {
      currentTransform = event.transform;
      svgSelection
        .select<SVGGElement>(".mining-lib-viewport")
        .attr("transform", currentTransform.toString());
      toolbar?.setZoomLabel(currentTransform.k);
      // Selection pill tracks the bbox of the selected element — pan
      // and zoom change where that bbox lands on screen, so the pill
      // recomputes on every zoom tick.
      selection?.update();
    });

  svgSelection.call(zoomBehavior);
  svgSelection.on("dblclick.zoom", (event: Event) => {
    event.preventDefault();
    if (!currentDfg) return;
    nodeOverrides.clear();
    edgeOverrides.clear();
    draw(currentDfg, true);
  });

  const KEY_STEP = 1.2;
  svg.addEventListener("keydown", (event) => {
    if (!currentDfg) return;
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      const next = Math.min(maxScale, Math.max(minScale, currentTransform.k * KEY_STEP));
      zoomBehavior.scaleTo(svgSelection, next);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      const next = Math.min(maxScale, Math.max(minScale, currentTransform.k / KEY_STEP));
      zoomBehavior.scaleTo(svgSelection, next);
    } else if (event.key === "0") {
      event.preventDefault();
      nodeOverrides.clear();
      edgeOverrides.clear();
      draw(currentDfg, true);
    } else if (event.key === "Escape") {
      if (selection !== null && selection.get() !== null) {
        event.preventDefault();
        selection.set(null);
      }
    }
  });

  // Esc must also work when focus is anywhere inside the host (toolbar
  // pill, popover, contextual panel) — the SVG's keydown only fires when
  // the SVG itself has focus. Listen on the themeHost so any descendant
  // element either dismisses an open popover (if any) or clears the
  // current selection.
  themeHost.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (popovers?.closeOnEscape()) {
      event.preventDefault();
      return;
    }
    if (selection === null || selection.get() === null) return;
    event.preventDefault();
    selection.set(null);
  });

  svg.addEventListener("click", (event) => {
    if (!currentDfg) return;
    const target = event.target;
    if (!(target instanceof Element)) {
      selection?.set(null);
      return;
    }
    const node = target.closest("g.mining-lib-node");
    if (node) {
      const id = node.getAttribute("data-activity");
      if (id) selection?.set({ kind: "node", id });
      return;
    }
    const edge = target.closest("path.mining-lib-edge");
    if (edge) {
      const from = edge.getAttribute("data-from");
      const to = edge.getAttribute("data-to");
      if (from && to) selection?.set({ kind: "edge", id: `${from}→${to}` });
      return;
    }
    selection?.set(null);
  });

  const drag = createDiagramDrag({
    svg,
    getCurrentTransform: () => currentTransform,
    nodeOverrides,
    edgeOverrides,
  });

  function draw(dfg: Dfg, resetCamera = false): void {
    syncViewBox();
    const isDurationMode = currentMode === "meanDuration" || currentMode === "medianDuration";
    const terminalDurations =
      isDurationMode && currentFilteredLog !== null
        ? getTerminalNodeDurations(dfg, currentFilteredLog)
        : undefined;
    // Phase 27 follow-up (2026-05-22): the case picker became a
    // regular filter clause, so when one case is in scope the filtered
    // DFG already *is* that case's path — there's nothing to fade.
    // The overlay slot only carries the happy-path overlay now, and
    // we suppress it during a single-case view (D1 visual rule —
    // looking at one case, the happy-path comparison is irrelevant).
    const inSingleCaseView = readTraceCaseFromClauses() !== null;
    const overlay =
      !inSingleCaseView && currentHappyPathSequence !== null
        ? computeHappyPathOverlay(dfg, currentHappyPathSequence)
        : undefined;
    const rawLayout = layoutDfg(dfg, {
      countMode: currentMode,
      theme: currentTheme,
      terminalDurations,
      overlay: overlay ?? undefined,
      rankdir: currentRankdir,
    });
    const withEdges = applyEdgeOverrides(rawLayout, edgeOverrides);
    const layout = applyPositionOverrides(withEdges, nodeOverrides);
    lastLayoutDims = { width: layout.width, height: layout.height };
    renderDfg(svg, layout);
    applyThemeToSvg(currentTheme);
    drag.attachNodeDrag(layout);
    drag.attachBendDrag(layout);
    selection?.applyToDom();
    // Measure the rendered content (drag overrides + edge curves + every
    // label) now that it's in the DOM, then re-fit to that box — not the
    // static dagre layout box — so a `resetView()` after dragging content
    // out still frames everything. Pan itself is unbounded (free pan).
    const bounds = navigableBounds();
    fitTransform = recomputeFit(bounds);
    if (resetCamera) {
      currentTransform = fitTransform;
    }
    zoomBehavior.transform(svgSelection, currentTransform);
    // Selection pill follows the rendered bbox of the selected
    // element (re-rendered on every draw — node positions may have
    // moved via dagre layout / drag overrides).
    selection?.update();
  }

  // Phase 20: the filters panel is created once, lives across
  // form-factor flips, and is moved between (a) the desktop right
  // rail's body, (b) the narrow `▾ Filters` popover envelope, and
  // (c) `filtersStash` (a hidden div) when neither host is active.
  // The variant panel hosted inside it is also a one-time
  // construction — its checkbox state survives the moves.
  const filtersStash = document.createElement("div");
  filtersStash.className = "mining-lib-filters-stash";
  filtersStash.hidden = true;
  themeHost.appendChild(filtersStash);

  // Phase 22: the unified Phase-20 filters panel splits into two
  // siblings — Variants (case-set selector) on top, Filters (active
  // chip row for refinement clauses) below. Both mount initially into
  // the same `filtersStash` so the chrome can re-parent them in pairs
  // when the form factor flips.
  const variantsPanel: VariantsPanelInstance = createVariantsPanel(filtersStash);
  const filtersPanel: FiltersPanelInstance = createFiltersPanel(filtersStash);
  const variantPanel: VariantPanelInstance = createVariantPanel(
    variantsPanel.variantHost,
    {
      getVariants: () => (currentLog === null ? [] : getVariants(currentLog)),
      getActiveFilter: () => readVariantFilter(),
      setActiveFilter: (sigs) => handle.setVariantFilter(sigs),
      getHappyPath: () => handle.getHappyPathVariant(),
      setHappyPath: (seq) => handle.setHappyPathVariant(seq),
    },
    { topK: currentTopK },
  );
  filtersPanel.setHooks(
    buildFiltersPanelHooks({
      getCurrentLog: () => currentLog,
      getFilteredLog: () => currentFilteredLog,
      getLogForHooks: () => currentLog ?? EMPTY_LOG_FOR_HOOKS,
      getActiveClauses: () => activeClauses,
      getDateClause: () => readDateClause(),
      getTraceCaseId: () => readTraceCaseFromClauses(),
      setFilters: (clauses) => handle.setFilters(clauses),
      setTraceCase: (caseId) => handle.setTraceCase(caseId),
    }),
  );

  function readDateClause(): DateClauseState | null {
    for (const c of activeClauses) {
      if (c.kind === "date") return { from: c.from, to: c.to, anchor: c.anchor };
    }
    return null;
  }

  let toolbar: ToolbarInstance | null = null;
  // Owns the four primary-/utilities-pill popovers (Filters / Variants /
  // Mode / Export); created once the panels + handle exist (below).
  let popovers: DiagramPopovers | null = null;

  // Phase 27 follow-up (2026-05-22) — Trace panel still mounts on the
  // shadow root (same surface as the selection pill) when a single-id
  // `caseId` clause is active. The case picker itself lives inside the
  // Filters panel now (`caseFilterSection`), so this constructor no
  // longer wires a standalone Case popover. The trace panel's `×`
  // close button strips the caseId clause via `setTraceCase(null)`
  // (which is itself a thin wrapper over `setFilters`).
  const trace = createDiagramTrace({
    svg,
    svgCell,
    getTraceCaseId: () => readTraceCaseFromClauses(),
    getLog: () => currentFilteredLog ?? currentLog,
    getLogForPanel: () => currentFilteredLog ?? currentLog ?? EMPTY_LOG_FOR_HOOKS,
    setTraceCase: (caseId) => handle.setTraceCase(caseId),
  });

  function updateAllPanels(): void {
    variantPanel.update();
    filtersPanel.update(activeClauses);
    trace.update();
    // Phase 22: refresh the narrow trigger count suffixes so
    // `▾ Variants · 3/8` and `▾ Filters · 2` reflect the current
    // clause state. At desktop these setters are no-ops (no narrow
    // triggers); cheap to call regardless.
    if (toolbar !== null) {
      const total = currentLog === null ? 0 : getVariants(currentLog).length;
      const variantClause = getClause(activeClauses, "variant");
      const ticked = variantClause === undefined ? total : variantClause.sequences.length;
      toolbar.setVariantsTriggerLabel({ ticked, total });
      toolbar.setFiltersTriggerLabel(filtersPanel.getActiveClauseCount());
    }
  }

  const handle: DiagramHandle = {
    render(dfg: Dfg, sourceLog?: EventLog) {
      if (!dfg || !(dfg.nodes instanceof Map) || !(dfg.edges instanceof Map)) {
        throw new TypeError("createDiagram: render expects a Dfg with nodes and edges Maps");
      }
      const placeholder = svg.querySelector("text");
      if (placeholder && placeholder.textContent === "No data loaded") {
        placeholder.remove();
      }
      if (dfg !== currentDfg) {
        nodeOverrides.clear();
        edgeOverrides.clear();
        activeClauses = [];
        selection?.set(null);
      }
      originalDfg = dfg;
      currentLog = sourceLog ?? null;
      // Phase 27 (2026-05-22 refold) — if a construction-time
      // `traceCase` was staged before the log was loaded, apply it
      // now as a single-id `caseId` filter clause. If the case
      // doesn't exist in the loaded log, the setter is a no-op (the
      // setter throws only for invalid input shape, not for unknown
      // case ids — that's a soft failure).
      if (
        initialTraceCase !== null &&
        currentLog !== null &&
        activeClauses.length === 0 &&
        currentLog.cases.has(initialTraceCase)
      ) {
        activeClauses = [{ kind: "caseId", caseIds: [initialTraceCase] }];
      }

      // Default top-K filter: when there are more variants than topK,
      // pre-filter so the diagram opens showing only the most-frequent
      // variants. The panel reflects this — top-K ticked, rest unticked.
      if (currentLog !== null && activeClauses.length === 0) {
        const variants = getVariants(currentLog);
        if (variants.length > currentTopK) {
          activeClauses = [
            {
              kind: "variant",
              sequences: variants.slice(0, currentTopK).map((v) => variantSignature(v.sequence)),
            },
          ];
        }
      }

      if (currentLog === null || activeClauses.length === 0) {
        currentDfg = dfg;
        currentFilteredLog = currentLog;
        clearStaleHappyPath(currentFilteredLog);
        draw(dfg, true);
      } else {
        const filteredLog = buildFilteredLogFromClauses(currentLog, activeClauses);
        const filteredDfg = filteredLog === currentLog ? dfg : buildDfg(filteredLog);
        currentDfg = filteredDfg;
        currentFilteredLog = filteredLog;
        clearStaleHappyPath(currentFilteredLog);
        draw(filteredDfg, true);
      }
      updateAllPanels();
    },
    setCountMode(mode: CountMode) {
      if (!VALID_MODES.includes(mode)) {
        throw new TypeError(
          `createDiagram: setCountMode expects a CountMode (${VALID_MODES.join(", ")}), got ${String(mode)}`,
        );
      }
      currentMode = mode;
      toolbar?.setCountMode(mode);
      if (currentDfg) draw(currentDfg);
    },
    getCountMode() {
      return currentMode;
    },
    setTheme(partial: Theme) {
      const wantDark = partial.dark ?? currentTheme.dark;
      const prevBaseline = presetBaseline(currentPresetName, currentTheme.dark);
      const newBaseline = presetBaseline(currentPresetName, wantDark);
      currentTheme = mergeTheme(prevBaseline, newBaseline, currentTheme, partial);
      toolbar?.setThemeDark(currentTheme.dark);
      if (currentDfg) {
        draw(currentDfg);
      } else {
        applyThemeToSvg(currentTheme);
      }
    },
    getTheme() {
      return { ...currentTheme };
    },
    setPreset(name: PresetName) {
      if (!isPresetName(name)) {
        throw new TypeError(
          `setPreset: name must be one of "default" | "linear" | "paper", got ${String(name)}`,
        );
      }
      if (name === currentPresetName) return;
      const prevBaseline = presetBaseline(currentPresetName, currentTheme.dark);
      const newBaseline = presetBaseline(name, currentTheme.dark);
      currentPresetName = name;
      currentTheme = mergeTheme(prevBaseline, newBaseline, currentTheme, {});
      toolbar?.setThemeDark(currentTheme.dark);
      if (currentDfg) {
        draw(currentDfg);
      } else {
        applyThemeToSvg(currentTheme);
      }
    },
    getPreset() {
      return currentPresetName;
    },
    setRankdir(dir: "LR" | "TB") {
      if (dir !== "LR" && dir !== "TB") {
        throw new TypeError(`setRankdir: rankdir must be "LR" or "TB", got ${String(dir)}`);
      }
      if (dir === currentRankdir) return;
      currentRankdir = dir;
      toolbar?.setRankdir(dir);
      // A 90° relayout invalidates manual node-drag + edge-bend overrides
      // (their coordinates are keyed to the old orientation), so clear them
      // and re-fit — the same invariant render() applies on a fresh dfg.
      nodeOverrides.clear();
      edgeOverrides.clear();
      if (currentDfg) draw(currentDfg, true);
    },
    getRankdir() {
      return currentRankdir;
    },
    getVariants() {
      if (currentLog === null) {
        throw new TypeError(
          "DiagramHandle.getVariants: no sourceLog set; call render(dfg, sourceLog) first.",
        );
      }
      return getVariants(currentLog);
    },
    setFilters(clauses: FilterClause[]) {
      validateFilterClauses(clauses);
      // Structural dedup on insert — `Filter to cases through this`
      // double-clicks won't grow the list. Defensive-clone every kept
      // clause so the embedder mutating their input array can't
      // reach our internal state.
      const deduped: FilterClause[] = [];
      for (const c of clauses) {
        let isDupe = false;
        for (const existing of deduped) {
          if (clauseEquals(existing, c)) {
            isDupe = true;
            break;
          }
        }
        if (!isDupe) deduped.push(cloneClause(c));
      }
      // No-op shortcut: same clause list, same diagram state. Avoids
      // wiping `nodeOverrides` / `edgeOverrides` on a redundant call
      // (the user may be re-applying the panel's current state).
      if (clausesEqual(activeClauses, deduped)) return;
      activeClauses = deduped;
      if (currentLog === null || originalDfg === null) return;
      rebuildAndDraw();
    },
    getFilters() {
      return activeClauses.map(cloneClause);
    },
    setVariantFilter(signatures: string[] | null) {
      if (signatures !== null) {
        if (!Array.isArray(signatures)) {
          throw new TypeError(
            "DiagramHandle.setVariantFilter: signatures must be an array of strings or null",
          );
        }
        for (const s of signatures) {
          if (typeof s !== "string") {
            throw new TypeError(
              "DiagramHandle.setVariantFilter: every element of signatures must be a string",
            );
          }
        }
      }
      handle.setFilters(replaceClause(activeClauses, "variant", signatures));
    },
    getVariantFilter() {
      return readVariantFilter();
    },
    setHappyPathVariant(sequence: string[] | null) {
      if (sequence !== null) {
        if (!Array.isArray(sequence)) {
          throw new TypeError(
            "DiagramHandle.setHappyPathVariant: sequence must be a string[] or null",
          );
        }
        for (const s of sequence) {
          if (typeof s !== "string") {
            throw new TypeError(
              "DiagramHandle.setHappyPathVariant: every element of sequence must be a string",
            );
          }
        }
      }
      const next = sequence === null ? null : [...sequence];
      // No-op when the pin doesn't change — avoids redraws when the
      // variants panel calls setHappyPath on every checkbox sync.
      if (currentHappyPathSequence === null && next === null) return;
      if (
        currentHappyPathSequence !== null &&
        next !== null &&
        variantSignature(currentHappyPathSequence) === variantSignature(next)
      ) {
        return;
      }
      currentHappyPathSequence = next;
      variantPanel.update();
      if (currentDfg) draw(currentDfg);
    },
    getHappyPathVariant() {
      return currentHappyPathSequence === null ? null : [...currentHappyPathSequence];
    },
    setTraceCase(caseId: string | null) {
      if (caseId !== null) {
        if (typeof caseId !== "string" || caseId.length === 0) {
          throw new TypeError(
            "DiagramHandle.setTraceCase: caseId must be a non-empty string or null",
          );
        }
      }
      // Phase 27 follow-up (2026-05-22 refold) — trace = single-id
      // `caseId` filter clause. Pushing it through `setFilters` runs
      // the standard validation + dedup + redraw pipeline, so trace
      // panel mount/unmount + chip-row state stay in sync without
      // extra signalling.
      const current = readTraceCaseFromClauses();
      if (current === caseId) return;
      if (caseId !== null) {
        // D1 (visual): clear happy-path when activating a single-case
        // view so the canvas reads as the case's path, not as a
        // comparison-against-canonical.
        currentHappyPathSequence = null;
      }
      const next =
        caseId === null
          ? replaceClause(activeClauses, "caseId", null)
          : replaceClause(activeClauses, "caseId", { caseIds: [caseId] });
      handle.setFilters(next);
    },
    getTraceCase() {
      return readTraceCaseFromClauses();
    },
    getTransform() {
      return { x: currentTransform.x, y: currentTransform.y, k: currentTransform.k };
    },
    resetView() {
      if (!currentDfg) return;
      nodeOverrides.clear();
      edgeOverrides.clear();
      draw(currentDfg, true);
    },
    zoomTo(scale: number) {
      if (!Number.isFinite(scale) || scale <= 0) {
        throw new TypeError(
          `createDiagram: zoomTo expects a finite number > 0, got ${String(scale)}`,
        );
      }
      if (!currentDfg) return;
      const clamped = Math.min(maxScale, Math.max(minScale, scale));
      zoomBehavior.scaleTo(svgSelection, clamped);
    },
    select(target: SelectionTarget | null) {
      if (target !== null) validateSelectionTarget(target);
      selection?.set(target);
    },
    getSelected() {
      return selection?.get() ?? null;
    },
    exportSvg() {
      if (currentDfg === null) {
        throw new TypeError(
          "DiagramHandle.exportSvg: no diagram rendered yet — call render(dfg) first",
        );
      }
      if (currentDfg.nodes.size === 0) {
        throw new TypeError(
          "DiagramHandle.exportSvg: cannot export an empty diagram (no nodes — e.g. all cases filtered out)",
        );
      }
      return buildExportSvgString(svg, buildExportOptions(exportContentBox()));
    },
    async exportPng(options?: PngExportConfig) {
      if (currentDfg === null) {
        throw new TypeError(
          "DiagramHandle.exportPng: no diagram rendered yet — call render(dfg) first",
        );
      }
      if (currentDfg.nodes.size === 0) {
        throw new TypeError(
          "DiagramHandle.exportPng: cannot export an empty diagram (no nodes — e.g. all cases filtered out)",
        );
      }
      // Measure once so the raster canvas matches the SVG's framed region
      // exactly (same width/height → no distortion or re-clipping).
      const box = exportContentBox();
      const exportOptions = buildExportOptions(box);
      const svgString = buildExportSvgString(svg, exportOptions);
      return svgStringToPngBlob(svgString, {
        scale: options?.scale,
        width: box.width,
        height: box.height,
        // Paint the same opaque theme backdrop on the canvas so the PNG is
        // fully opaque on every engine (not just where the in-SVG rect's AA
        // lands — Firefox left the corner at alpha ~236).
        background: exportOptions.background,
      });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      resizeObserver?.disconnect();
      svgSelection.on(".zoom", null);
      currentDfg = null;
      for (const [varName] of THEME_VAR_KEYS) {
        themeHost.style.removeProperty(varName);
      }
      themeHost.style.removeProperty("--mining-fs-base");
      themeHost.style.removeProperty("--mining-radius");
      themeHost.removeAttribute("data-theme");
      themeHost.removeAttribute("data-preset");
      popovers?.destroy();
      popovers = null;
      selection?.destroy();
      selection = null;
      // Move both panels out of any host that's about to be destroyed
      // so their DOM doesn't get swept along — then destroy them
      // explicitly. Same dance as form-factor flips, plus the final
      // destroy.
      variantsPanel.setHost(filtersStash);
      filtersPanel.setHost(filtersStash);
      filtersPanel.destroy();
      variantPanel.destroy();
      variantsPanel.destroy();
      filtersStash.remove();
      toolbar?.destroy();
      toolbar = null;
      themeHost.removeAttribute("data-form-factor");
      svg.remove();
      svgCell.remove();
      chromeTopBar.remove();
      chromeBottomBar.remove();
    },
  };

  // Resolve initial form factor BEFORE building the toolbar, since
  // the toolbar's `primary` discriminator depends on it. Falls back
  // to "wide" for zero-size hosts (jsdom, detached) so unit tests
  // that don't mock a rect get the desktop shell by default.
  {
    const r0 = themeHost.getBoundingClientRect();
    if (r0.width > 0) {
      themeHost.dataset.formFactor = formFactorFor(r0.width);
    }
  }

  popovers = createDiagramPopovers({
    root,
    themeHost,
    filtersStash,
    filtersPanel,
    variantsPanel,
    getToolbar: () => toolbar,
    getActiveClauses: () => activeClauses,
    getCurrentMode: () => currentMode,
    setCountMode: (mode) => handle.setCountMode(mode),
    exportSvg: () => handle.exportSvg(),
    exportPng: () => handle.exportPng(),
  });

  function readVariantFilter(): string[] | null {
    const v = getClause(activeClauses, "variant");
    return v ? [...v.sequences] : null;
  }

  function mountToolbar(primaryMode: "rails" | "pill"): ToolbarInstance {
    const next = createToolbar({
      root,
      chromeTopBar,
      chromeBottomBar,
      handle,
      initialCountMode: currentMode,
      initialThemeDark: currentTheme.dark,
      initialRankdir: currentRankdir,
      initialZoomScale: currentTransform.k,
      controls,
      primary: primaryMode,
    });
    toolbar = next;
    popovers?.wireTriggers();
    return next;
  }

  function applyFormFactor(_factor: "wide" | "narrow"): void {
    // Phase 22c: the toolbar emits the same 3-pill primary surface
    // at every width, so the form-factor flip only needs to close
    // any open popovers + re-fire fit-to-view. No rail / desktop
    // shell to mount or unmount — the rails layout was retired
    // (Phase-18 surface decommissioned). The toolbar itself doesn't
    // need a rebuild since its mode is the same at both widths.
    popovers?.closeForFormFactorChange();
    selection?.unmount();
    // Selection pill remounts so its measurements update against
    // any new host rect.
    selection?.mount();
  }

  // Initial mount: unified pill chrome at every width. The 3-pill
  // primary trio + utilities + zoom; no rails, no desktop Mode pill.
  // The form-factor flag still lives on `themeHost.dataset` for any
  // responsive CSS that wants it, but the toolbar branch collapses
  // to a single mode here.
  mountToolbar("pill");
  selection?.mount();

  let lastObservedW = 0;
  let lastObservedH = 0;
  const resizeObserver =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          if (destroyed) return;
          const v = viewportSize();
          // Form factor is keyed off the host element's width (not the
          // viewport's): an embed in a 320px column gets narrow layout
          // even on a 4K monitor. Always reconcile, even when w/h
          // haven't changed — the host's data-attribute may have been
          // cleared externally.
          const hostRect = themeHost.getBoundingClientRect();
          const nextFactor = hostRect.width > 0 ? formFactorFor(hostRect.width) : null;
          if (nextFactor !== null && themeHost.dataset.formFactor !== nextFactor) {
            themeHost.dataset.formFactor = nextFactor;
            applyFormFactor(nextFactor);
          }
          if (v.width === lastObservedW && v.height === lastObservedH) return;
          lastObservedW = v.width;
          lastObservedH = v.height;
          if (currentDfg === null) {
            syncViewBox();
            return;
          }
          refireFit();
        })
      : null;
  resizeObserver?.observe(themeHost);

  return {
    handle,
    setVariantTopK(k: number) {
      validateVariantTopK(k);
      currentTopK = k;
      variantPanel.setTopK(k);
    },
  };
}

function resolveTarget(target: string | HTMLElement): HTMLElement {
  if (typeof target !== "string") return target;
  const el = document.querySelector(target);
  if (!el) {
    throw new Error(`createDiagram: target "${target}" did not match any element`);
  }
  if (!(el instanceof HTMLElement)) {
    throw new Error(`createDiagram: target "${target}" resolved to a non-HTMLElement`);
  }
  return el;
}
