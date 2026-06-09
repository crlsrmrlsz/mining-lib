import type { DiagramHandle } from "./diagramTypes.js";
import { type IconName, setIcon } from "./icons.js";
import type { ControlsConfig } from "./parseControls.js";
import { type ChipSection, type CountMode, MODE_SECTION_LABELS } from "./types.js";

export type { ChipSection };

export type ToolbarInstance = {
  setZoomLabel(k: number): void;
  setCountMode(mode: CountMode): void;
  setThemeDark(dark: boolean): void;
  /**
   * Phase 37 — swap the utilities-pill orientation glyph to match the
   * current rankdir ("LR" → horizontal, "TB" → vertical).
   */
  setRankdir(dir: "LR" | "TB"): void;
  /**
   * Primary pill triggers exist only when `primary === "pill"` (narrow
   * form factor). When `primary === "rails"` the rails own the
   * Mode/Variants/Filters interactions and these getters return null.
   * Phase 22 restored `getVariantsTrigger` — Variants is its own
   * sibling pill now, split out from the Phase-20 unified Filters
   * popover so the trigger surfaces tick state via `· N/M`.
   */
  getVariantsTrigger(): HTMLButtonElement | null;
  getFiltersTrigger(): HTMLButtonElement | null;
  getModeTrigger(): HTMLButtonElement | null;
  /**
   * Phase 32 — the utilities-pill download button. Always present (the
   * utilities pill is built regardless of form factor); createDiagram
   * anchors the SVG / PNG export menu to it.
   */
  getExportTrigger(): HTMLButtonElement;
  /**
   * Patch the `▾ Variants` trigger's count suffix. Renders `· ${ticked}/${total}`
   * when partial, drops the suffix when `ticked === total` or `total === 0`.
   * No-op when the trigger doesn't exist (desktop).
   */
  setVariantsTriggerLabel(state: { ticked: number; total: number }): void;
  /**
   * Patch the `▾ Filters` trigger's count suffix. Renders `· ${n}` when
   * `n > 0`, drops the suffix when zero. No-op at desktop.
   */
  setFiltersTriggerLabel(n: number): void;
  measureInsets(opts: { utilsAtBottom: boolean }): { top: number; bottom: number };
  destroy(): void;
};

export type ToolbarOptions = {
  /**
   * The shadow root (or fallback container) — kept for back-compat
   * with existing tests that pass a single `root`. If the new
   * `chromeTopBar` / `chromeBottomBar` containers aren't supplied,
   * pills append directly to `root` (legacy positioning via CSS).
   */
  root: ShadowRoot | HTMLElement;
  /**
   * Phase 28 — chrome row containers from `createDiagram`. Primary
   * pill appends to `chromeTopBar`; zoom + utilities append to
   * `chromeBottomBar`. Each is a flex-wrap container in the host's
   * 3-row grid.
   */
  chromeTopBar?: HTMLElement;
  chromeBottomBar?: HTMLElement;
  handle: DiagramHandle;
  initialCountMode: CountMode;
  initialThemeDark: boolean;
  initialRankdir: "LR" | "TB";
  initialZoomScale: number;
  controls: ControlsConfig;
  /**
   * Discriminator for the primary surface (Phase 18). `"pill"`
   * builds the existing top-center primary pill with three category
   * triggers (▾ Mode / ▾ Variants / ▾ Filters); `"rails"` skips it
   * entirely since the desktop rails own that surface. Utilities
   * (`⤺ ⤓ ☾`) and zoom (`− % +`) pills are unchanged regardless.
   */
  primary: "rails" | "pill";
};

export const COUNT_CHIPS: ReadonlyArray<{
  mode: CountMode;
  label: string;
  section: ChipSection;
}> = [
  { mode: "absolute", label: "Abs", section: "count" },
  { mode: "case", label: "Case", section: "count" },
  { mode: "meanRepetitions", label: "Mean", section: "count" },
  { mode: "maxRepetitions", label: "Max", section: "count" },
  { mode: "meanDuration", label: "Mean", section: "time" },
  { mode: "medianDuration", label: "Median", section: "time" },
];

/**
 * Plain-language tooltip text for each Mode chip. Surfaced via the
 * standard `title` HTML attribute on every rendered chip so a hover
 * answers "what does this mode show?". Embedders see the same text.
 */
export const MODE_DESCRIPTIONS: Record<CountMode, string> = {
  absolute: "Absolute count — total events of this activity across all cases.",
  case: "Per case — number of cases that contain this activity.",
  meanRepetitions:
    "Mean repetitions — average times this activity occurs per case (1.0 = once per case).",
  maxRepetitions: "Max repetitions — most times this activity occurred in any single case.",
  meanDuration: "Mean duration — average time between activities (edge labels in time units).",
  medianDuration: "Median duration — typical time between activities (less skewed by outliers).",
};

/**
 * Look up the chip family ("count" | "time") for a given mode.
 * Used by surfaces that mirror "which family is active" — the
 * desktop Mode pill highlights `Σ` or `clock` based on this.
 */
export function modeSection(mode: CountMode): ChipSection {
  return COUNT_CHIPS.find((c) => c.mode === mode)?.section ?? "count";
}

/**
 * Build a `DocumentFragment` containing the Mode chips, optionally
 * grouped into one or two `mining-lib-mode-section` blocks. Shared
 * by the desktop per-section popover (`#`/`clock` icons → single
 * section, no heading) and the narrow `▾ Mode` popover (both
 * sections, headed by their `MODE_SECTION_LABELS` text).
 */
export function buildModeSections(opts: {
  currentMode: CountMode;
  onChipClick: (mode: CountMode) => void;
  chipRowClass: string;
  sectionsToRender?: ReadonlyArray<ChipSection>;
}): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const sections = opts.sectionsToRender ?? (["count", "time"] as const);
  // Section titles (Count / Time) only carry information when more
  // than one section is rendered — otherwise the icon trigger
  // already names the family. Skip them in single-section mode.
  const showTitles = sections.length > 1;
  for (const sectionKey of sections) {
    const section = document.createElement("div");
    section.className = "mining-lib-mode-section";
    section.dataset.section = sectionKey;

    if (showTitles) {
      const title = document.createElement("div");
      title.className = "mining-lib-mode-section-title";
      title.textContent = MODE_SECTION_LABELS[sectionKey];
      section.appendChild(title);
    }

    const chipRow = document.createElement("div");
    chipRow.className = opts.chipRowClass;
    for (const { mode, label, section: chipSection } of COUNT_CHIPS) {
      if (chipSection !== sectionKey) continue;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "mining-lib-pill-chip";
      chip.dataset.mode = mode;
      chip.textContent = label;
      chip.title = MODE_DESCRIPTIONS[mode];
      chip.setAttribute("aria-pressed", String(mode === opts.currentMode));
      chip.addEventListener("click", () => opts.onChipClick(mode));
      chipRow.appendChild(chip);
    }
    section.appendChild(chipRow);
    fragment.appendChild(section);
  }
  return fragment;
}

function makePill(part: string, position: string): HTMLDivElement {
  const pill = document.createElement("div");
  pill.className = `mining-lib-pill mining-lib-pill-${position}`;
  pill.setAttribute("part", part);
  return pill;
}

function makeIconButton(icon: IconName, title: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mining-lib-pill-btn";
  btn.title = title;
  btn.setAttribute("aria-label", title);
  setIcon(btn, icon);
  return btn;
}

export function createToolbar(opts: ToolbarOptions): ToolbarInstance {
  const {
    root,
    chromeTopBar,
    chromeBottomBar,
    handle,
    initialCountMode,
    initialThemeDark,
    initialRankdir,
    initialZoomScale,
    controls,
    primary: primaryMode,
  } = opts;
  const primaryMount = chromeTopBar ?? root;
  const bottomMount = chromeBottomBar ?? root;

  // Primary surface at narrow form factor (Phase 18 → Phase 22b):
  // a layout-only wrapper that holds three independent floating
  // pills — Mode, Variants, Filters — each with its own chrome
  // (background, border, blur, shadow) so they read as discrete
  // tools, not parts of one toolbar. At desktop the rails own this
  // surface and the wrapper never enters the shadow root.
  //
  // Each inner pill has a fixed width (CSS) so the count-suffix
  // labels (`· 3/8` / `· 2`) don't shift the layout when state
  // changes.
  const primaryEnabled = primaryMode === "pill";
  const primary = primaryEnabled
    ? (() => {
        const wrapper = document.createElement("div");
        wrapper.className = "mining-lib-pill-primary";
        wrapper.setAttribute("part", "toolbar");
        return wrapper;
      })()
    : null;
  const utilities = makePill("utilities", "utilities");
  const zoom = makePill("zoom", "zoom");

  // Phase 29: per-pill granularity. The primary row is hidden as a
  // whole only when every primary-cluster token is off (otherwise
  // individual pills hide themselves via display:none, below).
  if (primary !== null && !controls.mode && !controls.variants && !controls.filters) {
    primary.style.display = "none";
  }
  if (!controls.tr) utilities.style.display = "none";
  if (!controls.bl) zoom.style.display = "none";

  let modeBtn: HTMLButtonElement | null = null;
  let variantsBtn: HTMLButtonElement | null = null;
  let variantsCountSpan: HTMLSpanElement | null = null;
  let filtersBtn: HTMLButtonElement | null = null;
  let filtersCountSpan: HTMLSpanElement | null = null;
  if (primary !== null) {
    // Each trigger lives inside its own pill envelope.
    const modePill = document.createElement("div");
    modePill.className = "mining-lib-pill mining-lib-pill-mode-narrow";
    modePill.setAttribute("part", "mode-pill");
    if (!controls.mode) modePill.style.display = "none";
    modeBtn = document.createElement("button");
    modeBtn.type = "button";
    modeBtn.className = "mining-lib-pill-btn mining-lib-mode-icon";
    modeBtn.dataset.popover = "mode";
    // Narrow Mode trigger uses the same Lucide icon as the desktop
    // Mode pill (sigma for count family, clock for time).
    setIcon(modeBtn, modeSection(initialCountMode) === "time" ? "clock" : "sigma");
    modeBtn.title = "Display mode";
    modeBtn.setAttribute("aria-label", "Display mode");
    modePill.appendChild(modeBtn);
    primary.appendChild(modePill);

    const variantsPill = document.createElement("div");
    variantsPill.className = "mining-lib-pill mining-lib-pill-variants";
    variantsPill.setAttribute("part", "variants-trigger-pill");
    if (!controls.variants) variantsPill.style.display = "none";
    variantsBtn = document.createElement("button");
    variantsBtn.type = "button";
    variantsBtn.className = "mining-lib-pill-btn";
    variantsBtn.dataset.popover = "variants";
    const variantsLabel = document.createElement("span");
    variantsLabel.textContent = "▾ Variants";
    variantsBtn.appendChild(variantsLabel);
    variantsCountSpan = document.createElement("span");
    variantsCountSpan.className = "mining-lib-trigger-count";
    variantsCountSpan.hidden = true;
    variantsBtn.appendChild(variantsCountSpan);
    variantsBtn.title = "Filter by variant";
    variantsPill.appendChild(variantsBtn);
    primary.appendChild(variantsPill);

    const filtersPill = document.createElement("div");
    filtersPill.className = "mining-lib-pill mining-lib-pill-filters";
    filtersPill.setAttribute("part", "filters-trigger-pill");
    if (!controls.filters) filtersPill.style.display = "none";
    filtersBtn = document.createElement("button");
    filtersBtn.type = "button";
    filtersBtn.className = "mining-lib-pill-btn";
    filtersBtn.dataset.popover = "filters";
    const filtersLabel = document.createElement("span");
    filtersLabel.textContent = "▾ Filters";
    filtersBtn.appendChild(filtersLabel);
    filtersCountSpan = document.createElement("span");
    filtersCountSpan.className = "mining-lib-trigger-count";
    filtersCountSpan.hidden = true;
    filtersBtn.appendChild(filtersCountSpan);
    filtersBtn.title = "Active filters";
    filtersPill.appendChild(filtersBtn);
    primary.appendChild(filtersPill);
  }

  // --- Utilities pill ---
  const resetBtn = makeIconButton("rotateCcw", "Reset view");
  resetBtn.addEventListener("click", () => {
    handle.resetView();
  });
  utilities.appendChild(resetBtn);

  // Phase 37 — flip the dagre layout direction (TB ⇄ LR). The glyph shows
  // the current orientation; the handler reads the live direction off the
  // handle (same direct-call pattern as reset / theme).
  const rankdirBtn = makeIconButton(
    initialRankdir === "LR" ? "layoutHorizontal" : "layoutVertical",
    "Toggle layout direction",
  );
  rankdirBtn.addEventListener("click", () => {
    handle.setRankdir(handle.getRankdir() === "TB" ? "LR" : "TB");
  });
  utilities.appendChild(rankdirBtn);

  // Phase 32 — the download stub is now live. The SVG / PNG choice
  // popover is wired by createDiagram (which owns themeHost + the
  // export handle methods), anchored to this trigger.
  const exportBtn = makeIconButton("download", "Export image");
  exportBtn.dataset.popover = "export";
  utilities.appendChild(exportBtn);

  const themeBtn = makeIconButton(initialThemeDark ? "sun" : "moon", "Toggle theme");
  themeBtn.addEventListener("click", () => {
    const next = !handle.getTheme().dark;
    handle.setTheme({ dark: next });
  });
  utilities.appendChild(themeBtn);

  // --- Zoom pill ---
  const zoomOutBtn = makeIconButton("minus", "Zoom out");
  zoomOutBtn.addEventListener("click", () => {
    const k = handle.getTransform().k;
    handle.zoomTo(k / 1.2);
  });
  zoom.appendChild(zoomOutBtn);

  const zoomLabel = document.createElement("button");
  zoomLabel.type = "button";
  zoomLabel.className = "mining-lib-pill-btn mining-lib-pill-zoom-label";
  zoomLabel.title = "Reset to fit";
  zoomLabel.textContent = `${Math.round(initialZoomScale * 100)}%`;
  zoomLabel.addEventListener("click", () => {
    handle.resetView();
  });
  zoom.appendChild(zoomLabel);

  const zoomInBtn = makeIconButton("plus", "Zoom in");
  zoomInBtn.addEventListener("click", () => {
    const k = handle.getTransform().k;
    handle.zoomTo(k * 1.2);
  });
  zoom.appendChild(zoomInBtn);

  if (primary !== null) primaryMount.appendChild(primary);
  // Bottom bar uses `justify-content: space-between`: first child
  // anchors left, last child anchors right. Phase-18 anchor: zoom
  // bottom-left, utilities bottom-right.
  bottomMount.appendChild(zoom);
  bottomMount.appendChild(utilities);

  return {
    setZoomLabel(k: number) {
      zoomLabel.textContent = `${Math.round(k * 100)}%`;
    },
    setCountMode(mode: CountMode) {
      // Flip the narrow ▾ Mode trigger's icon between sigma (count
      // family) and clock (time family) so the user sees which family
      // the canvas is currently encoding. At desktop the trigger
      // doesn't exist (rails own the surface) and this is a no-op.
      if (modeBtn !== null) {
        setIcon(modeBtn, modeSection(mode) === "time" ? "clock" : "sigma");
      }
    },
    setThemeDark(dark: boolean) {
      setIcon(themeBtn, dark ? "sun" : "moon");
    },
    setRankdir(dir: "LR" | "TB") {
      setIcon(rankdirBtn, dir === "LR" ? "layoutHorizontal" : "layoutVertical");
    },
    getVariantsTrigger() {
      return variantsBtn;
    },
    getFiltersTrigger() {
      return filtersBtn;
    },
    getModeTrigger() {
      return modeBtn;
    },
    getExportTrigger() {
      return exportBtn;
    },
    setVariantsTriggerLabel({ ticked, total }: { ticked: number; total: number }) {
      if (variantsCountSpan === null) return;
      if (total === 0 || ticked === total) {
        variantsCountSpan.textContent = "";
        variantsCountSpan.hidden = true;
      } else {
        variantsCountSpan.textContent = ` · ${ticked}/${total}`;
        variantsCountSpan.hidden = false;
      }
    },
    setFiltersTriggerLabel(n: number) {
      if (filtersCountSpan === null) return;
      if (n === 0) {
        filtersCountSpan.textContent = "";
        filtersCountSpan.hidden = true;
      } else {
        filtersCountSpan.textContent = ` · ${n}`;
        filtersCountSpan.hidden = false;
      }
    },
    measureInsets({ utilsAtBottom }) {
      // 12px CSS anchor + 12px breathing room between pill and content.
      const GAP = 24;
      let top = 0;
      let bottom = 0;
      if (primary !== null && (controls.mode || controls.variants || controls.filters)) {
        top = Math.max(top, primary.offsetHeight + GAP);
      }
      if (controls.tr) {
        const h = utilities.offsetHeight + GAP;
        if (utilsAtBottom) bottom = Math.max(bottom, h);
        else top = Math.max(top, h);
      }
      if (controls.bl) {
        bottom = Math.max(bottom, zoom.offsetHeight + GAP);
      }
      return { top, bottom };
    },
    destroy() {
      primary?.remove();
      utilities.remove();
      zoom.remove();
    },
  };
}
