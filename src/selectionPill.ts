/**
 * Floating selection pill (Phase 20).
 *
 * An Excalidraw-style action pill that mounts above (or below,
 * when the selection is near the top of the viewport) the
 * currently-selected node or edge. It hosts the click-to-filter
 * action that turns "I clicked this slow amber edge" into a
 * `branch` clause in the Filters panel.
 *
 * The pill is positioned in screen space (constant pixel size as
 * the user zooms / pans) — the SVG bbox of the selection is
 * projected through the current `d3-zoom` transform to host
 * coordinates, then anchored 8 px above (default) or below the
 * projected box. Width clamps to `host − 24 px` so the pill never
 * overflows the embed at narrow widths.
 */

import {
  type CaseAttributesBlockInstance,
  type CaseAttributesBlockSection,
  createCaseAttributesBlock,
} from "./caseAttributesBlock.js";
import type { SelectionTarget } from "./diagramTypes.js";
import type { ResourceBreakdownRow } from "./getResourceBreakdown.js";
import {
  createResourceBreakdownBlock,
  type ResourceBreakdownBlockInstance,
} from "./resourceBreakdownBlock.js";
import type { AttributeValue } from "./types.js";

const GAP = 8;
const HEADROOM = 56;
const HOST_MARGIN = 12;
/** Fallback pill width when offsetWidth reads 0 (jsdom / detached). */
const PILL_WIDTH_FALLBACK = 200;
const PILL_HEIGHT_FALLBACK = 32;

export type SelectionPillTransform = {
  x: number;
  y: number;
  k: number;
};

export type SelectionPillHostSize = {
  width: number;
  height: number;
};

export type SelectionPillBBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SelectionPillHooks = {
  /** Resolve the selection's bbox in SVG coordinates (pre-transform). */
  getBBox(target: SelectionTarget): SelectionPillBBox | null;
  /** Current SVG → host transform (`d3-zoom`). */
  getTransform(): SelectionPillTransform;
  /** Host element's measurable rectangle (for clamping + visibility). */
  getHostSize(): SelectionPillHostSize;
  /** Click on the Filter action — caller pushes a branch / node clause. */
  onFilter(target: SelectionTarget): void;
  /** Click on `×` — caller clears the selection. */
  onClear(): void;
  /**
   * Resource breakdown for the activity associated with a node target.
   * The pill calls this when `logHasResources()` returns true.
   */
  getResourceBreakdown(activity: string): ResourceBreakdownRow[];
  /** Does the currently-loaded log have at least one non-null resource? */
  logHasResources(): boolean;
  /**
   * Resources currently filtered on `activity` (using the
   * `(unassigned)` sentinel for null). The breakdown block highlights
   * rows whose resource is in this list.
   */
  getActiveResourcesAt(activity: string): string[];
  /**
   * The user toggled a resource row in the breakdown block. Caller
   * pushes / extends / strips the matching `resourceAt` clause.
   */
  onToggleResource(activity: string, resource: string): void;
  /**
   * Case-attribute distributions for the cases incident on this
   * node. Empty array → no attributes block mounts. Phase 25.
   */
  getCaseAttributeBreakdown(activity: string): CaseAttributesBlockSection[];
  /**
   * Values currently filtered on `attribute` (sentinel-translated).
   * Drives the per-row active highlight in the attributes block.
   */
  getActiveCaseAttributeValuesAt(attribute: string): AttributeValue[];
  /**
   * The user toggled an attribute row in the attributes block.
   * Caller pushes / extends / strips the matching `attribute` clause.
   */
  onToggleCaseAttribute(attribute: string, value: AttributeValue): void;
};

export type SelectionPillOptions = {
  /**
   * Mount target — the shadow root (or a regular element) where the
   * pill DOM lives. The pill is `position: absolute` against the
   * shadow's host (which has `position: relative` from `:host {}`).
   */
  root: ShadowRoot | HTMLElement;
  hooks: SelectionPillHooks;
};

export type SelectionPillInstance = {
  /** Mount + position the pill for the given selection target. */
  show(target: SelectionTarget): void;
  /** Detach the pill from the DOM. */
  hide(): void;
  /** Recompute position for the current target (pan / zoom / resize). */
  update(): void;
  destroy(): void;
};

export function createSelectionPill(opts: SelectionPillOptions): SelectionPillInstance {
  const { root, hooks } = opts;

  const element = document.createElement("div");
  element.className = "mining-lib-pill mining-lib-pill-selection";
  element.setAttribute("part", "selection-pill");

  let currentTarget: SelectionTarget | null = null;
  let mounted = false;
  let breakdownBlock: ResourceBreakdownBlockInstance | null = null;
  let attributesBlock: CaseAttributesBlockInstance | null = null;

  function clearBreakdownBlock(): void {
    if (breakdownBlock !== null) {
      breakdownBlock.destroy();
      breakdownBlock = null;
    }
  }

  function clearAttributesBlock(): void {
    if (attributesBlock !== null) {
      attributesBlock.destroy();
      attributesBlock = null;
    }
  }

  function buildContent(target: SelectionTarget): void {
    clearBreakdownBlock();
    clearAttributesBlock();
    element.replaceChildren();

    const actionRow = document.createElement("div");
    actionRow.className = "mining-lib-pill-action-row";

    const filterBtn = document.createElement("button");
    filterBtn.type = "button";
    filterBtn.className = "mining-lib-pill-btn mining-lib-pill-filter";
    filterBtn.textContent =
      target.kind === "edge"
        ? "Filter to cases through this branch"
        : "Filter to cases through this";
    filterBtn.addEventListener("click", () => {
      if (currentTarget !== null) hooks.onFilter(currentTarget);
    });
    actionRow.appendChild(filterBtn);

    element.appendChild(actionRow);

    if (target.kind === "node" && hooks.logHasResources()) {
      const separator = document.createElement("div");
      separator.className = "mining-lib-pill-separator";
      separator.setAttribute("role", "presentation");
      element.appendChild(separator);

      const activity = target.id;
      const rows = hooks.getResourceBreakdown(activity);
      breakdownBlock = createResourceBreakdownBlock(rows, {
        activeResources: hooks.getActiveResourcesAt(activity),
        onToggle: (resource) => hooks.onToggleResource(activity, resource),
      });
      element.appendChild(breakdownBlock.element);
    }

    if (target.kind === "node") {
      const sections = hooks.getCaseAttributeBreakdown(target.id);
      if (sections.length > 0) {
        attributesBlock = createCaseAttributesBlock(sections, {
          getActiveValues: (attribute) => hooks.getActiveCaseAttributeValuesAt(attribute),
          onToggle: (attribute, value) => hooks.onToggleCaseAttribute(attribute, value),
        });
        element.appendChild(attributesBlock.element);
      }
    }

    // Anchored to the pill's top-right corner via CSS so the close
    // affordance stays cornered as the pill grows vertically (Resources
    // block, future blocks). Kept as a direct sibling of the action row
    // — not nested inside it.
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "mining-lib-pill-btn mining-lib-pill-close";
    closeBtn.textContent = "×";
    closeBtn.setAttribute("aria-label", "Clear selection");
    closeBtn.addEventListener("click", () => hooks.onClear());
    element.appendChild(closeBtn);
  }

  function position(target: SelectionTarget): void {
    const bbox = hooks.getBBox(target);
    if (bbox === null) {
      element.style.visibility = "hidden";
      return;
    }
    const t = hooks.getTransform();
    const host = hooks.getHostSize();

    // Width clamp: pill never wider than `host - 24 px`. Applied as
    // a max-width so the browser shrinks the content row when the
    // host is narrow (e.g. 320 px embeds).
    if (host.width > 0) {
      element.style.maxWidth = `${Math.max(0, host.width - 2 * HOST_MARGIN)}px`;
    }

    const pillWidth = element.offsetWidth || PILL_WIDTH_FALLBACK;
    const pillHeight = element.offsetHeight || PILL_HEIGHT_FALLBACK;

    // Project bbox to host coords via the d3-zoom transform.
    const projLeft = bbox.x * t.k + t.x;
    const projTop = bbox.y * t.k + t.y;
    const projRight = (bbox.x + bbox.width) * t.k + t.x;
    const projBottom = (bbox.y + bbox.height) * t.k + t.y;

    // Above by default, below when there's < 56 px headroom.
    const flipBelow = projTop < HEADROOM;
    const top = flipBelow ? projBottom + GAP : projTop - pillHeight - GAP;

    // Centred horizontally on the bbox, clamped to host bounds.
    const centerX = (projLeft + projRight) / 2;
    const desiredLeft = centerX - pillWidth / 2;
    const maxLeft = Math.max(HOST_MARGIN, host.width - pillWidth - HOST_MARGIN);
    const left = Math.max(HOST_MARGIN, Math.min(desiredLeft, maxLeft));

    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.dataset.anchor = flipBelow ? "below" : "above";

    // Visibility: hide when the entire bbox is outside the host's
    // visible rectangle. We don't unmount — just hide so that
    // re-panning back into view restores it without re-render.
    const fullyOutside =
      projRight < 0 || projLeft > host.width || projBottom < 0 || projTop > host.height;
    element.style.visibility = fullyOutside ? "hidden" : "visible";
  }

  return {
    show(target: SelectionTarget): void {
      currentTarget = target;
      buildContent(target);
      if (!mounted) {
        root.appendChild(element);
        mounted = true;
      }
      position(target);
    },
    hide(): void {
      currentTarget = null;
      clearBreakdownBlock();
      clearAttributesBlock();
      if (mounted) {
        element.remove();
        mounted = false;
      }
    },
    update(): void {
      if (currentTarget === null || !mounted) return;
      // Rebuild content so the breakdown block reflects the current
      // active-clauses state (e.g. after a setFilters call elsewhere
      // toggled a resource). Then reposition.
      buildContent(currentTarget);
      position(currentTarget);
    },
    destroy(): void {
      currentTarget = null;
      clearBreakdownBlock();
      clearAttributesBlock();
      if (mounted) {
        element.remove();
        mounted = false;
      }
    },
  };
}
