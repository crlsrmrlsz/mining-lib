import {
  activeCaseAttributeValues,
  formatAttributeValue,
  getCaseAttributeDistributionAtNode,
  getFilterableCaseAttributes,
  humanizeAttributeName,
  toggleCaseAttribute,
} from "./caseAttributeFilter.js";
import type { CaseAttributesBlockSection } from "./caseAttributesBlock.js";
import type { SelectionTarget } from "./diagramTypes.js";
import {
  activeResourcesAt,
  cloneClause,
  type FilterClause,
  toggleResourceAt,
  UNSET_VALUE,
} from "./filterClauses.js";
import { getResourceBreakdown, logHasResources } from "./getResourceBreakdown.js";
import type { ControlsConfig } from "./parseControls.js";
import { createSelectionPill, type SelectionPillInstance } from "./selectionPill.js";
import type { EventLog } from "./types.js";

function selectionEqual(a: SelectionTarget | null, b: SelectionTarget | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.id === b.id;
}

/**
 * Everything the selection seam needs from the diagram coordinator: DOM
 * handles, the controls config (to honour `controls.selection`), live state
 * readers, and the `setFilters` delegate the pill's click-to-filter actions
 * push through. The coordinator owns the render kernel; this module owns the
 * current selection + the floating selection pill.
 */
export interface SelectionContext {
  svg: SVGSVGElement;
  svgCell: HTMLElement;
  themeHost: HTMLElement;
  controls: ControlsConfig;
  getCurrentLog: () => EventLog | null;
  getActiveClauses: () => FilterClause[];
  setFilters: (clauses: FilterClause[]) => void;
}

export interface DiagramSelection {
  /** Set (or clear with `null`) the current selection; dispatches the `select` event. */
  set(target: SelectionTarget | null): void;
  /** Read the current selection as a fresh plain object (or `null`). */
  get(): SelectionTarget | null;
  /** Re-apply the `.mining-lib-selected` class + data attrs after a redraw. */
  applyToDom(): void;
  /** Recompute the pill's screen position (pan/zoom tick + after redraw). */
  update(): void;
  /** Mount the floating selection pill (honours `controls.selection`). */
  mount(): void;
  /** Unmount the pill (form-factor flip remounts to re-measure). */
  unmount(): void;
  /** Teardown. */
  destroy(): void;
}

export function createDiagramSelection(ctx: SelectionContext): DiagramSelection {
  const { svg, svgCell, themeHost, controls } = ctx;
  let currentSelection: SelectionTarget | null = null;
  let selectionPill: SelectionPillInstance | null = null;

  function attrEscape(value: string): string {
    return value.replace(/[\\"]/g, "\\$&");
  }

  function findSelectedElement(target: SelectionTarget): Element | null {
    if (target.kind === "node") {
      return svg.querySelector(`g.mining-lib-node[data-activity="${attrEscape(target.id)}"]`);
    }
    const arrow = target.id.indexOf("→");
    if (arrow < 0) return null;
    const from = target.id.slice(0, arrow);
    const to = target.id.slice(arrow + 1);
    return svg.querySelector(
      `path.mining-lib-edge[data-from="${attrEscape(from)}"][data-to="${attrEscape(to)}"]`,
    );
  }

  function applyToDom(): void {
    for (const el of svg.querySelectorAll(".mining-lib-selected")) {
      el.classList.remove("mining-lib-selected");
    }
    if (currentSelection === null) {
      svg.removeAttribute("data-selected-kind");
      svg.removeAttribute("data-selected-id");
      return;
    }
    const matched = findSelectedElement(currentSelection);
    if (matched) {
      matched.classList.add("mining-lib-selected");
      svg.setAttribute("data-selected-kind", currentSelection.kind);
      svg.setAttribute("data-selected-id", currentSelection.id);
    }
  }

  function set(target: SelectionTarget | null): void {
    if (selectionEqual(currentSelection, target)) return;
    currentSelection = target;
    applyToDom();
    if (target === null) {
      selectionPill?.hide();
    } else {
      selectionPill?.show(target);
    }
    themeHost.dispatchEvent(
      new CustomEvent<SelectionTarget | null>("select", {
        detail: target,
        bubbles: true,
        composed: true,
      }),
    );
  }

  function mount(): void {
    if (!controls.selection || selectionPill !== null) return;
    // Phase 20 (rewired Phase 28): the floating selection pill mounts inside
    // `.mining-lib-svg-cell` (the middle grid row) — that's the surface whose
    // top/bottom edges define "above the node" vs "below the node." Bbox +
    // host-size are reported in svg-cell coordinates so the HEADROOM "flip
    // below" trigger fires against the SVG cell edge, not the host edge.
    selectionPill = createSelectionPill({
      root: svgCell,
      hooks: {
        getBBox: (target) => {
          const el = findSelectedElement(target);
          if (!el || typeof (el as Element).getBoundingClientRect !== "function") return null;
          const rect = (el as Element).getBoundingClientRect();
          const cellRect = svgCell.getBoundingClientRect();
          return {
            x: rect.left - cellRect.left,
            y: rect.top - cellRect.top,
            width: rect.width,
            height: rect.height,
          };
        },
        // Bbox already lives in svg-cell coords, so the pill applies an
        // identity transform — pan / zoom are baked into the bbox via
        // getBoundingClientRect.
        getTransform: () => ({ x: 0, y: 0, k: 1 }),
        getHostSize: () => {
          const r = svgCell.getBoundingClientRect();
          return { width: r.width, height: r.height };
        },
        onFilter: (target) => {
          const active = ctx.getActiveClauses();
          if (target.kind === "edge") {
            const arrow = target.id.indexOf("→");
            if (arrow < 0) return;
            const from = target.id.slice(0, arrow);
            const to = target.id.slice(arrow + 1);
            ctx.setFilters([...active.map(cloneClause), { kind: "branch", edge: [from, to] }]);
          } else {
            ctx.setFilters([...active.map(cloneClause), { kind: "node", activity: target.id }]);
          }
          // The chip is added; the selection clears so the pill un-mounts —
          // keeps the click-to-filter ergonomic in one motion.
          set(null);
        },
        onClear: () => {
          set(null);
        },
        getResourceBreakdown: (activity) => {
          const log = ctx.getCurrentLog();
          return log === null ? [] : getResourceBreakdown(activity, log);
        },
        logHasResources: () => {
          const log = ctx.getCurrentLog();
          return log !== null && logHasResources(log);
        },
        getActiveResourcesAt: (activity) => activeResourcesAt(ctx.getActiveClauses(), activity),
        onToggleResource: (activity, resource) => {
          ctx.setFilters(toggleResourceAt(ctx.getActiveClauses(), activity, resource));
        },
        // Phase 25: case-attributes block. Scopes the distribution to cases
        // incident on the clicked node (Decision D3 — mirrors the resourceAt
        // UX). Skip attributes with only one distinct value among incident
        // cases — the user can't meaningfully filter by a constant.
        getCaseAttributeBreakdown: (activity) => {
          const log = ctx.getCurrentLog();
          if (log === null) return [];
          const out: CaseAttributesBlockSection[] = [];
          for (const attr of getFilterableCaseAttributes(log)) {
            const dist = getCaseAttributeDistributionAtNode(activity, attr, log);
            if (dist.length < 2) continue;
            out.push({
              attribute: attr,
              humanLabel: humanizeAttributeName(attr),
              distribution: dist.map((row) => ({
                value: row.value === null ? UNSET_VALUE : row.value,
                displayLabel: formatAttributeValue(row.value),
                count: row.count,
              })),
            });
          }
          return out;
        },
        getActiveCaseAttributeValuesAt: (attribute) =>
          activeCaseAttributeValues(ctx.getActiveClauses(), attribute),
        onToggleCaseAttribute: (attribute, value) => {
          ctx.setFilters(toggleCaseAttribute(ctx.getActiveClauses(), attribute, value));
        },
      },
    });
    // Restore the previously-selected target so the user doesn't lose their
    // selection on a form-factor flip.
    if (currentSelection !== null) {
      selectionPill.show(currentSelection);
    }
  }

  function unmount(): void {
    selectionPill?.destroy();
    selectionPill = null;
  }

  return {
    set,
    get(): SelectionTarget | null {
      if (currentSelection === null) return null;
      return { kind: currentSelection.kind, id: currentSelection.id };
    },
    applyToDom,
    update(): void {
      selectionPill?.update();
    },
    mount,
    unmount,
    destroy(): void {
      unmount();
    },
  };
}
