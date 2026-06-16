/**
 * Floating trace panel (Phase 27).
 *
 * Anchored to the top-right of the host (12 px margin), the panel
 * tells the story of one pinned case: header (case ID · total
 * duration · # events · variant signature · Filter button) over a
 * scrollable list of chronological event rows (activity · timestamp
 * · Δ since previous · resource when present).
 *
 * The renderer wires linked-highlight via `highlightActivity` and
 * `highlightEdge` (DFG → panel direction). Panel-row hover fires
 * `onRowHover(eventIdx | null)` so the createDiagram bridge can
 * apply the accent class to the matching DFG node + previous edge.
 */
import { getCaseSummary, getCaseTraceEvents } from "./caseTrace.js";
import { formatDuration } from "./formatDuration.js";
import type { EventLog } from "./types.js";

export type TracePanelHooks = {
  getCaseId(): string | null;
  getLog(): EventLog;
  onClose(): void;
  onRowHover(eventIdx: number | null): void;
};

export type TracePanelOptions = {
  root: ShadowRoot | HTMLElement;
  hooks: TracePanelHooks;
};

export type TracePanelInstance = {
  element: HTMLElement;
  update(): void;
  highlightActivity(activity: string | null): void;
  highlightEdge(from: string | null, to: string | null): void;
  destroy(): void;
};

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function createTracePanel(opts: TracePanelOptions): TracePanelInstance {
  const { root, hooks } = opts;

  const element = document.createElement("div");
  element.className = "mining-lib-trace-panel";
  element.setAttribute("part", "trace-panel");

  let mounted = false;

  function mount(): void {
    if (!mounted) {
      root.appendChild(element);
      mounted = true;
    }
  }

  function unmount(): void {
    if (mounted) {
      element.remove();
      mounted = false;
    }
  }

  function buildContent(caseId: string): void {
    const log = hooks.getLog();
    const summary = getCaseSummary(log, caseId);
    if (summary === null) {
      // Defensive — caller is expected to clearStaleTraceCase first.
      unmount();
      return;
    }
    const traceEvents = getCaseTraceEvents(log, caseId);

    element.replaceChildren();

    const header = document.createElement("div");
    header.className = "mining-lib-trace-header";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "mining-lib-pill-btn mining-lib-trace-close";
    closeBtn.textContent = "×";
    closeBtn.setAttribute("aria-label", "Unpin trace case");
    closeBtn.addEventListener("click", () => hooks.onClose());
    header.appendChild(closeBtn);

    const caseIdSpan = document.createElement("span");
    caseIdSpan.className = "mining-lib-trace-case-id";
    caseIdSpan.textContent = summary.id;
    header.appendChild(caseIdSpan);

    const meta = document.createElement("div");
    meta.className = "mining-lib-trace-meta";
    meta.textContent = `${formatDuration(summary.durationMs)} · ${summary.eventCount} events`;
    header.appendChild(meta);

    const variant = document.createElement("div");
    variant.className = "mining-lib-trace-variant";
    variant.textContent = `Variant: ${summary.variantSequence.join(" → ")}`;
    header.appendChild(variant);

    element.appendChild(header);

    const rowsBox = document.createElement("div");
    rowsBox.className = "mining-lib-trace-rows";
    // The timeline scrolls when a case has many events; a scrollable region must
    // be reachable by keyboard (WCAG scrollable-region-focusable). tabindex=0 puts
    // it in the tab order; group + label name it for assistive tech.
    rowsBox.setAttribute("tabindex", "0");
    rowsBox.setAttribute("role", "group");
    rowsBox.setAttribute("aria-label", "Case event timeline");

    for (const ev of traceEvents) {
      const row = document.createElement("div");
      row.className = "mining-lib-trace-row";
      row.dataset.eventIdx = String(ev.idx);
      row.dataset.activity = ev.activity;
      row.addEventListener("mouseenter", () => hooks.onRowHover(ev.idx));
      row.addEventListener("mouseleave", () => hooks.onRowHover(null));

      const bullet = document.createElement("span");
      bullet.className = "mining-lib-trace-bullet";
      bullet.textContent = "●";
      row.appendChild(bullet);

      const activity = document.createElement("span");
      activity.className = "mining-lib-trace-activity";
      activity.textContent = ev.resource !== null ? `${ev.activity} · ${ev.resource}` : ev.activity;
      row.appendChild(activity);

      const ts = document.createElement("span");
      ts.className = "mining-lib-trace-timestamp";
      ts.textContent = TIMESTAMP_FORMAT.format(ev.timestamp);
      row.appendChild(ts);

      const delta = document.createElement("span");
      delta.className = "mining-lib-trace-delta";
      delta.textContent = ev.idx === 0 ? "" : `+${formatDuration(ev.deltaMs)}`;
      row.appendChild(delta);

      rowsBox.appendChild(row);
    }

    element.appendChild(rowsBox);
  }

  function update(): void {
    const caseId = hooks.getCaseId();
    if (caseId === null) {
      unmount();
      return;
    }
    const log = hooks.getLog();
    if (!log.cases.has(caseId)) {
      unmount();
      return;
    }
    buildContent(caseId);
    mount();
  }

  function clearHoverClasses(): void {
    for (const row of element.querySelectorAll(".mining-lib-trace-row")) {
      row.classList.remove("mining-lib-trace-row-hover");
    }
  }

  function highlightActivity(activity: string | null): void {
    clearHoverClasses();
    if (activity === null) return;
    for (const row of element.querySelectorAll<HTMLElement>(".mining-lib-trace-row")) {
      if (row.dataset.activity === activity) {
        row.classList.add("mining-lib-trace-row-hover");
      }
    }
  }

  function highlightEdge(from: string | null, to: string | null): void {
    clearHoverClasses();
    if (from === null || to === null) return;
    const caseId = hooks.getCaseId();
    if (caseId === null) return;
    const traceEvents = getCaseTraceEvents(hooks.getLog(), caseId);
    const targetIdxs = new Set<number>();
    for (let i = 1; i < traceEvents.length; i += 1) {
      const prev = traceEvents[i - 1];
      const curr = traceEvents[i];
      if (!prev || !curr) continue;
      if (prev.activity === from && curr.activity === to) targetIdxs.add(curr.idx);
    }
    for (const row of element.querySelectorAll<HTMLElement>(".mining-lib-trace-row")) {
      const idx = Number(row.dataset.eventIdx);
      if (targetIdxs.has(idx)) row.classList.add("mining-lib-trace-row-hover");
    }
  }

  function destroy(): void {
    unmount();
    element.replaceChildren();
  }

  return { element, update, highlightActivity, highlightEdge, destroy };
}
