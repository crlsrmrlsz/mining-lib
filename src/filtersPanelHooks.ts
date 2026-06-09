import {
  activeCaseAttributeValues,
  formatAttributeValue,
  getCaseAttributeDistribution,
  getFilterableCaseAttributes,
  toggleCaseAttribute,
  UNSET_VALUE,
} from "./caseAttributeFilter.js";
import type { DateClauseState } from "./dateFilterSection.js";
import { clauseEquals, type FilterClause, replaceClause } from "./filterClauses.js";
import type { FiltersPanelHooks } from "./filtersPanel.js";
import type { EventLog } from "./types.js";

/**
 * Readers + delegates the Filters panel's hook bag needs from the diagram
 * coordinator. Every action funnels back through `setFilters` / `setTraceCase`
 * so the coordinator's `rebuildAndDraw` pipeline stays the single place that
 * mutates state and redraws — this module only builds the callbacks.
 */
export interface FiltersPanelHooksContext {
  getCurrentLog: () => EventLog | null;
  getFilteredLog: () => EventLog | null;
  /** Non-null unfiltered log (with an empty-log fallback) for the date/case sections. */
  getLogForHooks: () => EventLog;
  getActiveClauses: () => FilterClause[];
  getDateClause: () => DateClauseState | null;
  getTraceCaseId: () => string | null;
  setFilters: (clauses: FilterClause[]) => void;
  setTraceCase: (caseId: string | null) => void;
}

export function buildFiltersPanelHooks(ctx: FiltersPanelHooksContext): FiltersPanelHooks {
  return {
    removeClause: (clause) => {
      ctx.setFilters(ctx.getActiveClauses().filter((c) => !clauseEquals(c, clause)));
    },
    clearNonVariant: () => {
      ctx.setFilters(ctx.getActiveClauses().filter((c) => c.kind === "variant"));
    },
    getAttributes: () => {
      const log = ctx.getCurrentLog();
      return log === null ? [] : getFilterableCaseAttributes(log);
    },
    getRowsFor: (attribute) => {
      const log = ctx.getCurrentLog();
      if (log === null) return [];
      const distinct = getCaseAttributeDistribution(attribute, log);
      const filteredCounts = new Map<unknown, number>();
      const filteredSource = ctx.getFilteredLog() ?? log;
      for (const r of getCaseAttributeDistribution(attribute, filteredSource)) {
        filteredCounts.set(r.value, r.count);
      }
      return distinct.map((r) => {
        // Sentinel translation at the boundary: rows whose raw value is null
        // carry the UNSET_VALUE sentinel string so the panel section's
        // active-value compare lines up with what activeCaseAttributeValues
        // reads back from the clause (Decision D4).
        const sentinelValue = r.value === null ? UNSET_VALUE : r.value;
        return {
          value: sentinelValue,
          displayLabel: formatAttributeValue(r.value),
          count: filteredCounts.get(r.value) ?? 0,
        };
      });
    },
    getActiveValues: (attribute) => activeCaseAttributeValues(ctx.getActiveClauses(), attribute),
    onToggleAttribute: (attribute, value) => {
      ctx.setFilters(toggleCaseAttribute(ctx.getActiveClauses(), attribute, value));
    },
    // Phase 26 — both the date section (histogram + input bounds) and the
    // Phase-27 case section (datalist case-id options) read through this hook.
    // Pass the **unfiltered** source log so each section's domain reflects the
    // full data — narrowing a filter to zero cases shouldn't collapse the very
    // controls used to adjust it.
    getLog: () => ctx.getLogForHooks(),
    getDateClause: () => ctx.getDateClause(),
    onCommitDate: (state: DateClauseState) => {
      ctx.setFilters(replaceClause(ctx.getActiveClauses(), "date", state));
    },
    onClearDate: () => {
      ctx.setFilters(replaceClause(ctx.getActiveClauses(), "date", null));
    },
    // Phase 27 follow-up (2026-05-22 refold) — case picker is a section inside
    // this same panel. `getCaseId` reads back the single-id `caseId` clause;
    // commit / clear pipe through the `setTraceCase` wrapper exactly like date.
    getCaseId: () => ctx.getTraceCaseId(),
    onCommitCase: (caseId: string) => {
      ctx.setTraceCase(caseId);
    },
    onClearCase: () => {
      ctx.setTraceCase(null);
    },
  };
}
