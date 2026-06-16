/**
 * Date-filter section (Phase 26, simplified 2026-05-21 follow-up).
 *
 * Mounts inside the Filters popover above the case-attribute
 * sections. Three coupled sub-controls in one `<details>`:
 *  - anchor `<select>` — two options: Started / Ended
 *  - two `<input type="date">` for from + to (pre-filled with the
 *    log's min/max when no clause is active, so users see the
 *    available window rather than blank inputs)
 *  - histogram brush — bars show cases per bucket for the current
 *    anchor (case-starts when Started; case-ends when Ended)
 *
 * Every user-driven change collapses into `hooks.onCommit(state)`
 * with the full `{ from, to, anchor }` payload, except when the
 * user clears both bounds to their pre-filled (log-bound) defaults
 * — that's effectively a no-op filter and `onClear()` is wired in
 * via a chip-row `×` from the parent panel.
 *
 * The original 4-anchor + preset-chip + histogram-with-mismatched-bars
 * design was simplified after user feedback: contained was visually
 * misleading (mostly-empty bars), intersecting was rarely chosen,
 * and the preset chips just duplicated what users could do with two
 * native date inputs in two clicks.
 *
 * The section rebuilds on every `update()` — drag state is owned
 * by the histogram instance which commits on release, so there's
 * no in-flight state to preserve across re-renders.
 */

import type { DateAnchor } from "./dateFilter.js";
import { formatDateChipLabel, logDateRange } from "./dateFilter.js";
import {
  createDateFilterHistogram,
  type DateFilterHistogramInstance,
} from "./dateFilterHistogram.js";
import type { EventLog } from "./types.js";

export type DateClauseState = {
  from: string | null;
  to: string | null;
  anchor: DateAnchor;
};

export type DateFilterSectionHooks = {
  /** Current log — used for the histogram bucketing + input min/max. */
  getLog(): EventLog;
  /** Current date clause, or null when nothing is filtered. */
  getDateClause(): DateClauseState | null;
  /** User committed a new clause (input / select / brush). */
  onCommit(state: DateClauseState): void;
  /** User cleared the date filter (currently routed through the chip ×). */
  onClear(): void;
};

export type DateFilterSectionInstance = {
  element: HTMLElement;
  update(): void;
  setHooks(hooks: Partial<DateFilterSectionHooks>): void;
  destroy(): void;
};

const NOOP_HOOKS: DateFilterSectionHooks = {
  getLog: () => ({
    cases: new Map(),
    events: [],
    schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
  }),
  getDateClause: () => null,
  onCommit: () => undefined,
  onClear: () => undefined,
};

const ANCHOR_OPTIONS: Array<{ value: DateAnchor; label: string }> = [
  { value: "started", label: "Started in range" },
  { value: "ended", label: "Ended in range" },
];

export function createDateFilterSection(
  initialHooks: DateFilterSectionHooks,
): DateFilterSectionInstance {
  let hooks = initialHooks;
  const element = document.createElement("div");
  element.className = "mining-lib-date-section-mount";
  let histogram: DateFilterHistogramInstance | null = null;

  function commitWithSwap(from: string | null, to: string | null, anchor: DateAnchor): void {
    let lo = from;
    let hi = to;
    if (lo !== null && hi !== null && lo > hi) {
      const t = lo;
      lo = hi;
      hi = t;
    }
    hooks.onCommit({ from: lo, to: hi, anchor });
  }

  function build(log: EventLog): void {
    const range = logDateRange(log);
    if (range === null) {
      element.replaceChildren();
      histogram = null;
      return;
    }

    const clause = hooks.getDateClause();
    const from = clause?.from ?? null;
    const to = clause?.to ?? null;
    const anchor = clause?.anchor ?? "started";
    // For display only: when no clause exists, pre-fill inputs with the
    // log's full date range so users see the actual available window
    // instead of empty inputs. Internally `from`/`to` stay null until
    // the user touches a control (no implicit filter).
    const displayFrom = from ?? msToYmd(range.min);
    const displayTo = to ?? msToYmd(range.max);
    const activeBoundCount = (from === null ? 0 : 1) + (to === null ? 0 : 1);

    const details = document.createElement("details");
    details.className = "mining-lib-date-section";
    details.open = true;

    const summary = document.createElement("summary");
    summary.textContent = activeBoundCount > 0 ? "Date range · active" : "Date range";
    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "mining-lib-date-body";

    // Anchor select — two options.
    const anchorSelect = document.createElement("select");
    anchorSelect.className = "mining-lib-date-anchor";
    for (const opt of ANCHOR_OPTIONS) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === anchor) o.selected = true;
      anchorSelect.appendChild(o);
    }
    anchorSelect.addEventListener("change", () => {
      commitWithSwap(from, to, anchorSelect.value as DateAnchor);
    });
    body.appendChild(anchorSelect);

    // Input pair.
    const inputsBlock = document.createElement("div");
    inputsBlock.className = "mining-lib-date-inputs";

    const fromWrap = buildInput("from", displayFrom, range, () => {
      const v = fromInput.value === "" ? null : fromInput.value;
      commitWithSwap(v, currentToValue(), anchor);
    });
    const fromInput = fromWrap.querySelector("input") as HTMLInputElement;

    const toWrap = buildInput("to", displayTo, range, () => {
      const v = toInput.value === "" ? null : toInput.value;
      commitWithSwap(currentFromValue(), v, anchor);
    });
    const toInput = toWrap.querySelector("input") as HTMLInputElement;

    function currentFromValue(): string | null {
      return fromInput.value === "" ? null : fromInput.value;
    }
    function currentToValue(): string | null {
      return toInput.value === "" ? null : toInput.value;
    }

    inputsBlock.appendChild(fromWrap);
    inputsBlock.appendChild(toWrap);
    body.appendChild(inputsBlock);

    // Histogram. `onDragPreview` syncs the input values to the brush
    // handles during the drag (purely visual — no clause push). The
    // commit on release goes through `commitWithSwap` which actually
    // updates the diagram (Phase 26 D8).
    histogram = createDateFilterHistogram({
      log,
      bucketCount: 40,
      anchor,
      hooks: {
        onCommit: (brushFrom, brushTo) => {
          commitWithSwap(brushFrom, brushTo, anchor);
        },
        onDragPreview: (brushFrom, brushTo) => {
          fromInput.value = brushFrom ?? "";
          toInput.value = brushTo ?? "";
        },
      },
    });
    body.appendChild(histogram.element);
    histogram.update(from, to);

    details.appendChild(body);
    element.replaceChildren(details);
  }

  function update(): void {
    build(hooks.getLog());
  }

  return {
    element,
    update,
    setHooks(next: Partial<DateFilterSectionHooks>): void {
      hooks = { ...NOOP_HOOKS, ...hooks, ...next };
    },
    destroy(): void {
      if (histogram !== null) histogram.destroy();
      histogram = null;
      element.remove();
      hooks = NOOP_HOOKS;
    },
  };
}

function buildInput(
  kind: "from" | "to",
  value: string,
  range: { min: Date; max: Date },
  onChange: () => void,
): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "mining-lib-date-input-wrap";
  wrap.dataset.kind = kind;

  const input = document.createElement("input");
  input.type = "date";
  input.className = "mining-lib-date-input";
  input.dataset.kind = kind;
  input.min = msToYmd(range.min);
  input.max = msToYmd(range.max);
  input.value = value;
  input.addEventListener("change", onChange);
  wrap.appendChild(input);

  return wrap;
}

function msToYmd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// formatDateChipLabel is re-used by the panel-level chip render;
// re-exporting here keeps the section's neighbours from importing
// dateFilter directly.
export { formatDateChipLabel };
