import { getCaseTraceEvents } from "./caseTrace.js";
import { createTracePanel } from "./tracePanel.js";
import type { EventLog } from "./types.js";

/**
 * What the trace seam needs from the diagram coordinator. The pinned trace
 * itself is derived from the `caseId` filter clause (read via
 * `getTraceCaseId`), so the coordinator stays the single owner of the clause
 * list and the render kernel; this module owns the floating Trace panel and
 * the bidirectional panel↔DFG hover bridge.
 */
export interface TraceContext {
  svg: SVGSVGElement;
  svgCell: HTMLElement;
  /** The pinned case id, derived from the single-id `caseId` clause (or null). */
  getTraceCaseId: () => string | null;
  /** Filtered-then-unfiltered log, or null when nothing is loaded. */
  getLog: () => EventLog | null;
  /** Same as `getLog` but with a non-null empty-log fallback for the panel hook. */
  getLogForPanel: () => EventLog;
  setTraceCase: (caseId: string | null) => void;
}

export interface DiagramTrace {
  /** Refresh the Trace panel against the current pin + log (per render). */
  update(): void;
}

export function createDiagramTrace(ctx: TraceContext): DiagramTrace {
  const { svg, svgCell } = ctx;

  const tracePanel = createTracePanel({
    // Phase 28: anchor the trace panel to `svgCell` (the middle grid row's
    // `position: relative` container), not the shadow root — so its
    // `top: 12px; right: 12px` measures from the SVG cell's corner and it
    // can't overlap either chrome bar.
    root: svgCell,
    hooks: {
      getCaseId: () => ctx.getTraceCaseId(),
      getLog: () => ctx.getLogForPanel(),
      onClose: () => ctx.setTraceCase(null),
      onRowHover: (eventIdx) => {
        const traceId = ctx.getTraceCaseId();
        if (eventIdx === null || traceId === null) {
          highlightTraceTargetActivity(null);
          return;
        }
        const log = ctx.getLog();
        if (log === null) return;
        const events = getCaseTraceEvents(log, traceId);
        const ev = events[eventIdx];
        if (!ev) return;
        const prev = eventIdx > 0 ? events[eventIdx - 1] : null;
        highlightTraceTargetActivity(ev.activity, prev?.activity ?? null);
      },
    },
  });

  // Phase 27 — DFG → panel hover bridge. When a trace is pinned and the user
  // hovers a node or edge on the SVG, the matching panel rows light up.
  // Delegated via mouseover/mouseout on the SVG so we don't re-bind per
  // element on every redraw.
  svg.addEventListener("mouseover", (event) => {
    if (ctx.getTraceCaseId() === null) return;
    const target = event.target as Element | null;
    if (!target) return;
    const nodeGroup = target.closest("g.mining-lib-node");
    if (nodeGroup !== null) {
      const activity = nodeGroup.getAttribute("data-activity");
      if (activity !== null) tracePanel.highlightActivity(activity);
      return;
    }
    const edgeEl = target.closest("path.mining-lib-edge, g.mining-lib-edge-label");
    if (edgeEl !== null) {
      const from = edgeEl.getAttribute("data-from");
      const to = edgeEl.getAttribute("data-to");
      if (from !== null && to !== null) tracePanel.highlightEdge(from, to);
    }
  });
  svg.addEventListener("mouseout", (event) => {
    if (ctx.getTraceCaseId() === null) return;
    const target = event.target as Element | null;
    if (!target) return;
    if (
      target.closest("g.mining-lib-node, path.mining-lib-edge, g.mining-lib-edge-label") !== null
    ) {
      tracePanel.highlightActivity(null);
    }
  });

  function highlightTraceTargetActivity(
    activity: string | null,
    fromActivity: string | null = null,
  ): void {
    // Clear any prior target highlight, then accent the matching DFG node +
    // the previous-edge if the hover came from a panel row beyond index 0.
    for (const el of svg.querySelectorAll(".mining-lib-trace-target-hover")) {
      el.classList.remove("mining-lib-trace-target-hover");
    }
    if (activity === null) return;
    for (const node of svg.querySelectorAll<SVGGElement>("g.mining-lib-node")) {
      if (node.getAttribute("data-activity") === activity) {
        node.classList.add("mining-lib-trace-target-hover");
      }
    }
    if (fromActivity === null) return;
    const edgeKey = `${fromActivity}\t${activity}`;
    for (const path of svg.querySelectorAll<SVGPathElement>("path.mining-lib-edge")) {
      const from = path.getAttribute("data-from");
      const to = path.getAttribute("data-to");
      if (from !== null && to !== null && `${from}\t${to}` === edgeKey) {
        path.classList.add("mining-lib-trace-target-hover");
      }
    }
  }

  return {
    update(): void {
      tracePanel.update();
    },
  };
}
