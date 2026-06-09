/**
 * Resource breakdown block (Phase 21, extended 2026-05-12).
 *
 * Pure DOM factory that turns a `ResourceBreakdownRow[]` into a small
 * vertical block: a `Resources` header, an inline stacked bar, and a
 * top-5 list with a trailing `+N others` aggregate when the input
 * exceeds five rows. Used inside the floating selection pill on node
 * selection when the loaded log has at least one non-null resource.
 *
 * Each row is a toggle button when `onToggle` is provided. Rows whose
 * resource is in `activeResources` render with the `-active` class so
 * CSS can flag them as "filtered." `+N others` stays non-interactive.
 *
 * The factory is intentionally decoupled from the pill (and from
 * `EventLog`) so it's unit-testable in isolation, and so future
 * consumers (e.g. an exporter, a docs example) can mount the same
 * visualisation without the pill scaffolding.
 */
import type { ResourceBreakdownRow } from "./getResourceBreakdown.js";

const UNASSIGNED_LABEL = "(unassigned)";
const TOP_CAP = 5;

export type ResourceBreakdownBlockOptions = {
  /**
   * Resources currently filtered on this activity, using the
   * `(unassigned)` sentinel for null. Rendered as active-state on
   * matching rows.
   */
  activeResources?: ReadonlyArray<string>;
  /**
   * Invoked with the row's resource string (sentinel for null) when
   * the user clicks a row. If absent, rows render as static text.
   */
  onToggle?: (resource: string) => void;
};

export type ResourceBreakdownBlockInstance = {
  element: HTMLElement;
  destroy(): void;
};

export function createResourceBreakdownBlock(
  rows: ReadonlyArray<ResourceBreakdownRow>,
  opts: ResourceBreakdownBlockOptions = {},
): ResourceBreakdownBlockInstance {
  const element = document.createElement("div");
  element.className = "mining-lib-resource-block";

  const header = document.createElement("h4");
  header.className = "mining-lib-resource-header";
  header.textContent = "Resources";
  element.appendChild(header);

  const bar = document.createElement("div");
  bar.className = "mining-lib-resource-bar";
  bar.setAttribute("role", "presentation");
  element.appendChild(bar);

  const list = document.createElement("ul");
  list.className = "mining-lib-resource-list";
  element.appendChild(list);

  const active = new Set(opts.activeResources ?? []);
  const visible = rows.slice(0, TOP_CAP);
  const tail = rows.slice(TOP_CAP);

  for (let i = 0; i < visible.length; i += 1) {
    const row = visible[i] as ResourceBreakdownRow;
    const key = resourceKey(row);
    bar.appendChild(buildSegment(row, i, active.has(key)));
    list.appendChild(buildRow(row, active.has(key), opts.onToggle));
  }

  if (tail.length > 0) {
    const tailCount = tail.reduce((s, r) => s + r.count, 0);
    const tailPct = tail.reduce((s, r) => s + r.percentage, 0);
    bar.appendChild(buildOthersSegment(tailPct));
    list.appendChild(buildOthersRow(tail.length, tailCount, tailPct));
  }

  return {
    element,
    destroy(): void {
      element.remove();
    },
  };
}

function resourceKey(row: ResourceBreakdownRow): string {
  return row.resource === null ? UNASSIGNED_LABEL : row.resource;
}

function buildSegment(
  row: ResourceBreakdownRow,
  index: number,
  isActive: boolean,
): HTMLSpanElement {
  const seg = document.createElement("span");
  seg.className = `mining-lib-resource-bar-segment mining-lib-resource-bar-segment-${index}`;
  if (row.resource === null) {
    seg.classList.add("mining-lib-resource-bar-segment-unassigned");
  }
  if (isActive) {
    seg.classList.add("mining-lib-resource-bar-segment-active");
  }
  seg.style.flexBasis = `${row.percentage}%`;
  return seg;
}

function buildOthersSegment(percentage: number): HTMLSpanElement {
  const seg = document.createElement("span");
  seg.className = "mining-lib-resource-bar-segment mining-lib-resource-bar-segment-others";
  seg.style.flexBasis = `${percentage}%`;
  return seg;
}

function buildRow(
  row: ResourceBreakdownRow,
  isActive: boolean,
  onToggle: ((resource: string) => void) | undefined,
): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "mining-lib-resource-row";
  if (isActive) li.classList.add("mining-lib-resource-row-active");

  const inner: HTMLElement = onToggle
    ? (() => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mining-lib-resource-row-btn";
        btn.setAttribute("aria-pressed", isActive ? "true" : "false");
        btn.addEventListener("click", () => onToggle(resourceKey(row)));
        return btn;
      })()
    : document.createElement("div");

  const label = document.createElement("span");
  label.className = "resource-label";
  label.textContent = resourceKey(row);

  const count = document.createElement("span");
  count.className = "resource-count";
  count.textContent = String(row.count);

  const pct = document.createElement("span");
  pct.className = "resource-pct";
  pct.textContent = `${row.percentage}%`;

  inner.appendChild(label);
  inner.appendChild(count);
  inner.appendChild(pct);
  li.appendChild(inner);
  return li;
}

function buildOthersRow(tailLength: number, tailCount: number, tailPct: number): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "mining-lib-resource-row mining-lib-resource-others";

  const label = document.createElement("span");
  label.className = "resource-label";
  label.textContent = `+${tailLength} others`;

  const count = document.createElement("span");
  count.className = "resource-count";
  count.textContent = String(tailCount);

  const pct = document.createElement("span");
  pct.className = "resource-pct";
  pct.textContent = `${tailPct}%`;

  li.appendChild(label);
  li.appendChild(count);
  li.appendChild(pct);
  return li;
}
