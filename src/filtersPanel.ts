/**
 * Filters panel (Phase 22, slim).
 *
 * The right-rail / popover surface that hosts the Active chip row for
 * non-variant filter clauses (branch / node / resourceAt today;
 * attribute / dateRange land in later phases). Variant filtering lives
 * in its own sibling panel (`createVariantsPanel`) since Phase 22 — so
 * this panel no longer owns the Variants `<details>` or the panel-level
 * `Filters` heading, and the chip row's "Active filters" sub-heading
 * dropped (with the `▾ Filters` trigger naming the surface, the
 * heading was redundant).
 */
import { formatAttributeChipLabel, humanizeAttributeName } from "./caseAttributeFilter.js";
import {
  type CaseAttributesSectionInstance,
  type CaseAttributesSectionRow,
  createCaseAttributesSection,
} from "./caseAttributesSection.js";
import { type CaseFilterSectionInstance, createCaseFilterSection } from "./caseFilterSection.js";
import { formatDateChipLabel } from "./dateFilter.js";
import {
  createDateFilterSection,
  type DateClauseState,
  type DateFilterSectionInstance,
} from "./dateFilterSection.js";
import { type FilterClause, UNASSIGNED_RESOURCE } from "./filterClauses.js";
import { reparent } from "./panelHost.js";
import type { AttributeValue, EventLog } from "./types.js";

export type FiltersPanelHooks = {
  removeClause(clause: FilterClause): void;
  clearNonVariant(): void;
  /** Filterable case:* attributes for the currently-loaded log. */
  getAttributes(): string[];
  /**
   * Distinct-value rows for `attribute`. Caller decides whether
   * counts are scoped to the filtered or unfiltered log (Decision
   * D6 — counts dynamic, distinct values static).
   */
  getRowsFor(attribute: string): CaseAttributesSectionRow[];
  /** Values currently filtered on `attribute`. */
  getActiveValues(attribute: string): AttributeValue[];
  /** User toggled a value via the section. */
  onToggleAttribute(attribute: string, value: AttributeValue): void;
  /** Phase 26 — current log for the date section's histogram + input bounds. */
  getLog(): EventLog;
  /** Phase 26 — current date clause if any. */
  getDateClause(): DateClauseState | null;
  /** Phase 26 — user committed a new date clause via the section. */
  onCommitDate(state: DateClauseState): void;
  /** Phase 26 — user clicked the `All` preset; clear date clause. */
  onClearDate(): void;
  /** Phase 27 (2026-05-22 refold) — currently-pinned case id, if any. */
  getCaseId(): string | null;
  /** Phase 27 — user committed a single case id via the section combobox. */
  onCommitCase(caseId: string): void;
  /** Phase 27 — user cleared the case filter (emptied the input). */
  onClearCase(): void;
};

export type FiltersPanelInstance = {
  /** Root `<details>` element. Move with `setHost(newHost)`. */
  element: HTMLElement;
  /** Re-renders chips from the clause list. */
  update(clauses: FilterClause[]): void;
  /**
   * Replace the hook callbacks (used after construction-time wiring).
   * Accepts a partial — any field omitted falls back to a no-op so
   * callers wiring only the chip-row hooks (e.g. test fixtures from
   * Phase 22) continue to work.
   */
  setHooks(hooks: Partial<FiltersPanelHooks>): void;
  /** Re-parent under `newHost` without rebuilding internal state. */
  setHost(newHost: HTMLElement): void;
  destroy(): void;
  /** Count of non-variant clauses currently chipped — for the toolbar's `▾ Filters · N`. */
  getActiveClauseCount(): number;
};

const EMPTY_LOG: EventLog = {
  cases: new Map(),
  events: [],
  schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
};

const NOOP_HOOKS: FiltersPanelHooks = {
  removeClause: () => undefined,
  clearNonVariant: () => undefined,
  getAttributes: () => [],
  getRowsFor: () => [],
  getActiveValues: () => [],
  onToggleAttribute: () => undefined,
  getLog: () => EMPTY_LOG,
  getDateClause: () => null,
  onCommitDate: () => undefined,
  onClearDate: () => undefined,
  getCaseId: () => null,
  onCommitCase: () => undefined,
  onClearCase: () => undefined,
};

/**
 * Sort resources lex asc with `(unassigned)` placed last — matches the
 * convention `getResourceBreakdown` uses for `null` (rendered as the
 * sentinel here because the clause is string-typed).
 */
function sortResourcesForLabel(resources: readonly string[]): string[] {
  return [...resources].sort((a, b) => {
    if (a === UNASSIGNED_RESOURCE) return 1;
    if (b === UNASSIGNED_RESOURCE) return -1;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
}

export function createFiltersPanel(host: HTMLElement): FiltersPanelInstance {
  // Plain `<div>` since the popover trigger already names the section
  // ("▾ Filters"). See createVariantsPanel for the same rationale.
  const element = document.createElement("div");
  element.className = "mining-lib-filters-panel";
  element.setAttribute("part", "filters-panel");

  // Active row — hidden until a non-variant clause exists. Contains
  // the chips + Clear all link side-by-side (right-aligned via CSS).
  const activeRow = document.createElement("section");
  activeRow.className = "mining-lib-filters-active";
  activeRow.hidden = true;
  const chipRow = document.createElement("div");
  chipRow.className = "mining-lib-filters-chips";
  activeRow.appendChild(chipRow);
  const clearAllBtn = document.createElement("button");
  clearAllBtn.type = "button";
  clearAllBtn.className = "mining-lib-clear-all";
  clearAllBtn.textContent = "Clear all";
  activeRow.appendChild(clearAllBtn);
  element.appendChild(activeRow);

  let hooks: FiltersPanelHooks = NOOP_HOOKS;
  let nonVariantCount = 0;

  // Phase 26: the date section sits above the case-attribute sections —
  // date is the coarsest axis (users typically reach for it first).
  const dateSection: DateFilterSectionInstance = createDateFilterSection({
    getLog: () => hooks.getLog(),
    getDateClause: () => hooks.getDateClause(),
    onCommit: (state) => hooks.onCommitDate(state),
    onClear: () => hooks.onClearDate(),
  });
  element.appendChild(dateSection.element);

  // Phase 27 follow-up (2026-05-22): case section sits below the date
  // section. Per user feedback the case picker is "just one more
  // filter" — a single-id `caseId` clause. Mounted inline so the
  // datalist dropdown behaves like a regular HTML combobox (no extra
  // popover envelope).
  const caseSection: CaseFilterSectionInstance = createCaseFilterSection({
    getLog: () => hooks.getLog(),
    getCaseId: () => hooks.getCaseId(),
    onCommit: (id) => hooks.onCommitCase(id),
    onClear: () => hooks.onClearCase(),
  });
  element.appendChild(caseSection.element);

  // Phase 25: case-attribute sections live below the Active chip row.
  // The section reads its data via the panel's hooks (which createDiagram
  // populates with closure-captured state). Mount unconditionally —
  // when there are no filterable attributes the section renders empty
  // and stays out of the way.
  const attributesSection: CaseAttributesSectionInstance = createCaseAttributesSection({
    getAttributes: () => hooks.getAttributes(),
    getRowsFor: (attribute) => hooks.getRowsFor(attribute),
    getActiveValues: (attribute) => hooks.getActiveValues(attribute),
    onToggle: (attribute, value) => hooks.onToggleAttribute(attribute, value),
  });
  element.appendChild(attributesSection.element);

  clearAllBtn.addEventListener("click", () => hooks.clearNonVariant());

  function chipLabel(c: FilterClause): string {
    switch (c.kind) {
      case "branch":
        return `Through ${c.edge[0]} → ${c.edge[1]}`;
      case "node":
        return `At ${c.activity}`;
      case "resourceAt": {
        const sorted = sortResourcesForLabel(c.resources);
        const primary = sorted[0] ?? "";
        const tail = sorted.length - 1;
        return tail > 0 ? `${primary} + ${tail} at ${c.activity}` : `${primary} at ${c.activity}`;
      }
      case "attribute":
        return formatAttributeChipLabel(humanizeAttributeName(c.attribute), c.values);
      case "variant":
        return ""; // never reached — variant clauses don't get chips
      case "date":
        return formatDateChipLabel(c.from, c.to, c.anchor);
      case "caseId":
        return c.caseIds.length === 1 ? (c.caseIds[0] ?? "") : `${c.caseIds.length} cases`;
    }
  }

  function buildChip(clause: FilterClause): HTMLButtonElement {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "mining-lib-filters-chip";
    chip.dataset.kind = clause.kind;
    if (clause.kind === "branch") {
      chip.dataset.from = clause.edge[0];
      chip.dataset.to = clause.edge[1];
    } else if (clause.kind === "node") {
      chip.dataset.activity = clause.activity;
    } else if (clause.kind === "resourceAt") {
      chip.dataset.activity = clause.activity;
    } else if (clause.kind === "attribute") {
      chip.dataset.attribute = clause.attribute;
    } else if (clause.kind === "date") {
      chip.dataset.anchor = clause.anchor;
      if (clause.from !== null) chip.dataset.from = clause.from;
      if (clause.to !== null) chip.dataset.to = clause.to;
    }

    const label = document.createElement("span");
    label.className = "mining-lib-filters-chip-label";
    label.textContent = chipLabel(clause);
    chip.appendChild(label);

    const closeBtn = document.createElement("span");
    closeBtn.className = "mining-lib-filters-chip-x";
    closeBtn.textContent = "×";
    closeBtn.setAttribute("aria-label", "Remove filter");
    chip.appendChild(closeBtn);

    chip.addEventListener("click", (e) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".mining-lib-filters-chip-x")) {
        hooks.removeClause(clause);
      }
    });
    return chip;
  }

  host.appendChild(element);

  return {
    element,
    update(clauses: FilterClause[]): void {
      const chipped = clauses.filter((c) => c.kind !== "variant" && chipLabel(c) !== "");
      nonVariantCount = chipped.length;
      chipRow.replaceChildren();
      for (const c of chipped) {
        chipRow.appendChild(buildChip(c));
      }
      activeRow.hidden = chipped.length === 0;
      dateSection.update();
      caseSection.update();
      attributesSection.update();
    },
    setHooks(next: Partial<FiltersPanelHooks>): void {
      hooks = { ...NOOP_HOOKS, ...next };
    },
    setHost(newHost: HTMLElement): void {
      reparent(element, newHost);
    },
    destroy(): void {
      dateSection.destroy();
      caseSection.destroy();
      hooks = NOOP_HOOKS;
      element.remove();
    },
    getActiveClauseCount(): number {
      return nonVariantCount;
    },
  };
}
