/**
 * Case-attribute filter helpers (Phase 25).
 *
 * Pure functions powering the auto-detected case:* attribute
 * filter that lives inside the Filters popover and inside the
 * floating selection pill. The clause shape itself
 * (`{ kind: "attribute"; attribute: string; values: AttributeValue[] }`)
 * is defined in `filterClauses.ts` alongside the other kinds;
 * this module owns the distribution / display / toggle helpers
 * the UI surfaces consume.
 *
 * Architectural sibling of `getResourceBreakdown.ts` (Phase 21)
 * — same "distinct values + counts, sorted, sentinel handling"
 * shape, but case-scoped (one value per case) instead of
 * event-scoped (one row per event).
 */

import { type FilterClause, UNSET_VALUE } from "./filterClauses.js";
import type { AttributeValue, EventLog } from "./types.js";

export { UNSET_VALUE };

export type CaseAttributeDistributionRow = {
  value: AttributeValue;
  count: number;
};

/**
 * `true` iff `log.schema.caseAttributes` is non-empty AND at
 * least one of those attributes has ≥ 2 distinct values across
 * `log.cases`. Drives the panel + pill mount conditions.
 */
export function logHasCaseAttributes(log: EventLog): boolean {
  return getFilterableCaseAttributes(log).length > 0;
}

/**
 * `log.schema.caseAttributes` filtered to those with ≥ 2 distinct
 * values across all cases. Schema order preserved. Mono-value
 * columns (the same value in every case) are hidden — filtering
 * by a constant attribute is a no-op (Decision D5).
 */
export function getFilterableCaseAttributes(log: EventLog): string[] {
  return log.schema.caseAttributes.filter((attr) => countDistinctValues(attr, log) >= 2);
}

/**
 * Distinct-value distribution for `attribute` across `log.cases`.
 * Sorted by count desc, then lex tiebreak via
 * `formatAttributeValue`, with the `(unset)` sentinel always
 * placed last regardless of count. Mirrors `getResourceBreakdown`.
 */
export function getCaseAttributeDistribution(
  attribute: string,
  log: EventLog,
): CaseAttributeDistributionRow[] {
  const counts = new Map<AttributeValue, number>();
  for (const c of log.cases.values()) {
    const raw = c.attributes[attribute];
    const v: AttributeValue = raw === undefined ? null : raw;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const rows: CaseAttributeDistributionRow[] = [];
  for (const [value, count] of counts) {
    rows.push({ value, count });
  }
  rows.sort(compareRows);
  return rows;
}

/**
 * Same shape as `getCaseAttributeDistribution`, but scoped to
 * cases that contain at least one event at `activity`. Drives the
 * selection-pill Attributes block (per-node breakdown).
 */
export function getCaseAttributeDistributionAtNode(
  activity: string,
  attribute: string,
  log: EventLog,
): CaseAttributeDistributionRow[] {
  const matchingCases = new Set<string>();
  for (const ev of log.events) {
    if (ev.activity === activity) matchingCases.add(ev.caseId);
  }
  if (matchingCases.size === 0) return [];
  const counts = new Map<AttributeValue, number>();
  for (const caseId of matchingCases) {
    const c = log.cases.get(caseId);
    if (!c) continue;
    const raw = c.attributes[attribute];
    const v: AttributeValue = raw === undefined ? null : raw;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const rows: CaseAttributeDistributionRow[] = [];
  for (const [value, count] of counts) {
    rows.push({ value, count });
  }
  rows.sort(compareRows);
  return rows;
}

/**
 * Toggle a value on the `attribute` clause for `attribute`. If
 * no such clause exists, creates one with `[value]`. If the value
 * is already in the clause, removes it (and strips the clause
 * entirely when `values` would become empty). Returns a new list.
 *
 * Mirrors `toggleResourceAt`. Sentinel-safe — `UNSET_VALUE` is
 * just another string in the array.
 */
export function toggleCaseAttribute(
  list: FilterClause[],
  attribute: string,
  value: AttributeValue,
): FilterClause[] {
  let found = false;
  const next: FilterClause[] = [];
  for (const c of list) {
    if (c.kind !== "attribute" || c.attribute !== attribute) {
      next.push(c);
      continue;
    }
    found = true;
    const has = c.values.includes(value);
    const updated = has ? c.values.filter((v) => v !== value) : [...c.values, value];
    if (updated.length > 0) {
      next.push({ kind: "attribute", attribute, values: updated });
    }
  }
  if (!found) {
    next.push({ kind: "attribute", attribute, values: [value] });
  }
  return next;
}

/**
 * The values currently in the `attribute` clause for `attribute`,
 * as a defensive copy. Returns `[]` when no such clause exists.
 * Drives the panel's checkbox active state + the pill row
 * highlight.
 */
export function activeCaseAttributeValues(
  list: FilterClause[],
  attribute: string,
): AttributeValue[] {
  for (const c of list) {
    if (c.kind === "attribute" && c.attribute === attribute) {
      return [...c.values];
    }
  }
  return [];
}

/**
 * Render an `AttributeValue` as a display string:
 *   null / undefined → UNSET_VALUE ("(unset)")
 *   boolean → "true" / "false"
 *   number  → String(n)
 *   string  → identity
 * Centralises type rendering so callers don't sprinkle ad-hoc
 * `String(v)` conversions through the panel and pill code.
 */
export function formatAttributeValue(value: AttributeValue): string {
  if (value === null || value === undefined) return UNSET_VALUE;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return value;
}

/**
 * Active-chip label for an attribute clause.
 *   1 value:  "{label}: {v}"
 *   2 values: "{label}: {v1}, {v2}"  (lex-sorted)
 *   ≥ 3:      "{label}: {v1} +{n-1}" (v1 = lex-smallest)
 * Per Decision D7 — keeps chips compact in the wrap-flow Active
 * row; the full list stays visible in the panel section.
 */
export function formatAttributeChipLabel(humanLabel: string, values: AttributeValue[]): string {
  const sorted = values.map(formatAttributeValue).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (sorted.length === 1) return `${humanLabel}: ${sorted[0]}`;
  if (sorted.length === 2) return `${humanLabel}: ${sorted[0]}, ${sorted[1]}`;
  return `${humanLabel}: ${sorted[0]} +${sorted.length - 1}`;
}

/**
 * Strip `case:` prefix, replace underscores with spaces,
 * capitalise the first letter only. `case:applicant_type` →
 * `Applicant type`. Keeps XES vocabulary out of the rendered UI.
 */
export function humanizeAttributeName(name: string): string {
  const stripped = name.startsWith("case:") ? name.slice("case:".length) : name;
  const spaced = stripped.replace(/_/g, " ");
  if (spaced.length === 0) return spaced;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function countDistinctValues(attribute: string, log: EventLog): number {
  const seen = new Set<AttributeValue>();
  for (const c of log.cases.values()) {
    const raw = c.attributes[attribute];
    const v: AttributeValue = raw === undefined ? null : raw;
    seen.add(v);
  }
  return seen.size;
}

function compareRows(a: CaseAttributeDistributionRow, b: CaseAttributeDistributionRow): number {
  // Sentinel (null → UNSET_VALUE) always last.
  if (a.value === null && b.value !== null) return 1;
  if (b.value === null && a.value !== null) return -1;
  if (b.count !== a.count) return b.count - a.count;
  const av = formatAttributeValue(a.value);
  const bv = formatAttributeValue(b.value);
  if (av < bv) return -1;
  if (av > bv) return 1;
  return 0;
}
