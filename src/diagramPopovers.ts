import { triggerDownload } from "./exportImage.js";
import type { FilterClause } from "./filterClauses.js";
import type { FiltersPanelInstance } from "./filtersPanel.js";
import { createPopover, type PopoverInstance } from "./popover.js";
import { buildModeSections, type ToolbarInstance } from "./toolbar.js";
import type { CountMode } from "./types.js";
import type { VariantsPanelInstance } from "./variantsPanel.js";

/** Phase 32 — the SVG / PNG choice rows for the download popover. */
function buildExportMenu(opts: { onChoose: (format: "svg" | "png") => void }): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const format of ["svg", "png"] as const) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mining-lib-popover-row mining-lib-export-option";
    btn.dataset.format = format;
    btn.textContent = format.toUpperCase();
    btn.addEventListener("click", () => opts.onChoose(format));
    frag.appendChild(btn);
  }
  return frag;
}

/**
 * Everything the four primary-/utilities-pill popovers (Filters / Variants /
 * Mode / Export) need from the diagram coordinator: DOM handles, live state
 * readers, and thin delegates back to the handle. The coordinator stays the
 * single owner of the mutable diagram state + render kernel; this module owns
 * only the four popover envelopes.
 */
export interface PopoverWiringContext {
  root: ShadowRoot | HTMLElement;
  themeHost: HTMLElement;
  /** Hidden stash the panels return to between popover sessions. */
  filtersStash: HTMLElement;
  filtersPanel: FiltersPanelInstance;
  variantsPanel: VariantsPanelInstance;
  /** The toolbar is built after this instance, so it is read live. */
  getToolbar: () => ToolbarInstance | null;
  getActiveClauses: () => FilterClause[];
  getCurrentMode: () => CountMode;
  setCountMode: (mode: CountMode) => void;
  exportSvg: () => string;
  exportPng: () => Promise<Blob>;
}

export interface DiagramPopovers {
  /** Wire the Mode/Variants/Filters primary triggers + the utilities Export trigger. */
  wireTriggers(): void;
  /** Esc handler: close Variants (then Filters) if open; returns true if one closed. */
  closeOnEscape(): boolean;
  /** Form-factor flip: close Variants + Filters + Mode (Export stays open). */
  closeForFormFactorChange(): void;
  /** Teardown: destroy + null all four popover envelopes. */
  destroy(): void;
}

/**
 * Owns the four primary-pill popovers and their open/close lifecycle. The
 * Variants and Filters panels live in a stash between sessions and re-parent
 * into the popover envelope on open (their tick/chip state survives the DOM
 * move), so closing always returns the panel to the stash first — otherwise
 * the popover's `element.remove()` would sweep the panel's DOM along with it.
 */
export function createDiagramPopovers(ctx: PopoverWiringContext): DiagramPopovers {
  const { root, themeHost, filtersStash, filtersPanel, variantsPanel } = ctx;
  let filtersPopover: PopoverInstance | null = null;
  let variantsPopover: PopoverInstance | null = null;
  let modePopover: PopoverInstance | null = null;
  let exportPopover: PopoverInstance | null = null;

  function closeFiltersPopover(): void {
    if (filtersPopover === null) return;
    filtersPanel.setHost(filtersStash);
    filtersPopover.destroy();
    filtersPopover = null;
  }

  function closeVariantsPopover(): void {
    if (variantsPopover === null) return;
    variantsPanel.setHost(filtersStash);
    variantsPopover.destroy();
    variantsPopover = null;
  }

  function openFiltersPopover(): void {
    const toolbar = ctx.getToolbar();
    if (filtersPopover !== null || toolbar === null) return;
    const trigger = toolbar.getFiltersTrigger();
    if (trigger === null) return;
    filtersPopover = createPopover({
      root,
      themeHost,
      anchor: trigger,
      onDismiss: () => {
        closeFiltersPopover();
      },
      part: "popover",
      ariaLabel: "Filters",
    });
    // ▾ Filters popover hosts only the slim Filters panel (Active chips row +
    // Clear all). Variants gets its own ▾ Variants popover. State (ticks,
    // chips) persists across opens because the panels sit in the stash
    // between sessions.
    filtersPanel.setHost(filtersPopover.element);
    filtersPanel.update(ctx.getActiveClauses());
  }

  function openVariantsPopover(): void {
    const toolbar = ctx.getToolbar();
    if (variantsPopover !== null || toolbar === null) return;
    const trigger = toolbar.getVariantsTrigger();
    if (trigger === null) return;
    variantsPopover = createPopover({
      root,
      themeHost,
      anchor: trigger,
      onDismiss: () => {
        closeVariantsPopover();
      },
      part: "popover",
      ariaLabel: "Filter by variant",
    });
    // The variant panel's tick state survives because the DOM moves natively.
    variantsPanel.setHost(variantsPopover.element);
  }

  function closeExportPopover(): void {
    if (exportPopover === null) return;
    exportPopover.destroy();
    exportPopover = null;
  }

  function openExportPopover(): void {
    const toolbar = ctx.getToolbar();
    if (exportPopover !== null || toolbar === null) return;
    const trigger = toolbar.getExportTrigger();
    exportPopover = createPopover({
      root,
      themeHost,
      anchor: trigger,
      onDismiss: () => closeExportPopover(),
      part: "popover",
      ariaLabel: "Export image",
    });
    exportPopover.element.appendChild(
      buildExportMenu({
        onChoose: (format) => {
          closeExportPopover();
          if (format === "svg") {
            triggerDownload(ctx.exportSvg(), "process-diagram.svg", "image/svg+xml");
          } else {
            void ctx
              .exportPng()
              .then((blob) => triggerDownload(blob, "process-diagram.png", "image/png"));
          }
        },
      }),
    );
  }

  function closeModePopover(): void {
    if (modePopover === null) return;
    modePopover.destroy();
    modePopover = null;
  }

  function openModePopover(): void {
    const toolbar = ctx.getToolbar();
    if (modePopover !== null || toolbar === null) return;
    const trigger = toolbar.getModeTrigger();
    if (trigger === null) return;
    modePopover = createPopover({
      root,
      themeHost,
      anchor: trigger,
      onDismiss: () => closeModePopover(),
      part: "popover",
      ariaLabel: "Display mode",
    });
    modePopover.element.appendChild(
      buildModeSections({
        currentMode: ctx.getCurrentMode(),
        onChipClick: (mode) => {
          ctx.setCountMode(mode);
          closeModePopover();
        },
        chipRowClass: "mining-lib-popover-chips",
      }),
    );
  }

  function wireTriggers(): void {
    const toolbar = ctx.getToolbar();
    if (toolbar === null) return;
    // Accessibility (Phase 38-II B3): mark every popover trigger as a
    // disclosure that opens a dialog, so screen readers announce the
    // relationship. (Full focus-in/trap/return is a later a11y phase.)
    for (const t of [
      toolbar.getVariantsTrigger(),
      toolbar.getFiltersTrigger(),
      toolbar.getModeTrigger(),
      toolbar.getExportTrigger(),
    ]) {
      t?.setAttribute("aria-haspopup", "dialog");
    }
    toolbar.getVariantsTrigger()?.addEventListener("click", () => {
      if (variantsPopover !== null) {
        closeVariantsPopover();
      } else {
        openVariantsPopover();
      }
    });
    toolbar.getFiltersTrigger()?.addEventListener("click", () => {
      if (filtersPopover !== null) {
        closeFiltersPopover();
      } else {
        openFiltersPopover();
      }
    });
    toolbar.getModeTrigger()?.addEventListener("click", () => {
      if (modePopover !== null) {
        closeModePopover();
      } else {
        openModePopover();
      }
    });
    // The export trigger lives in the always-present utilities pill, so it
    // wires at every form factor (unlike the Mode/Variants/Filters triggers,
    // which only exist on the primary pill).
    toolbar.getExportTrigger().addEventListener("click", () => {
      if (exportPopover !== null) {
        closeExportPopover();
      } else {
        openExportPopover();
      }
    });
  }

  return {
    wireTriggers,
    closeOnEscape(): boolean {
      if (variantsPopover !== null) {
        closeVariantsPopover();
        return true;
      }
      if (filtersPopover !== null) {
        closeFiltersPopover();
        return true;
      }
      return false;
    },
    closeForFormFactorChange(): void {
      closeVariantsPopover();
      closeFiltersPopover();
      closeModePopover();
    },
    destroy(): void {
      variantsPopover?.destroy();
      variantsPopover = null;
      filtersPopover?.destroy();
      filtersPopover = null;
      modePopover?.destroy();
      modePopover = null;
      exportPopover?.destroy();
      exportPopover = null;
    },
  };
}
