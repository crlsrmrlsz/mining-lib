import { caseInDateRange, type DateAnchor, parseDateBound } from "./dateFilter.js";
import { variantSignature } from "./getVariants.js";
import type { AttributeValue, Case, Event, EventLog } from "./types.js";

/**
 * Filter clauses (Phase 20, extended Phase 21, reworked 2026-05-12).
 *
 * A `FilterClause` describes one rule for keeping or excluding cases
 * from the rendered DFG. The current diagram applies the *intersection*
 * (AND) of all active clauses to the loaded `EventLog`.
 *
 * Clause kinds:
 *  - `variant`     — keep cases whose canonicalised sequence signature
 *                    is in `sequences`. Replaces the old
 *                    `setVariantFilter`-only path; existing callers
 *                    keep working through the back-compat wrapper.
 *  - `branch`      — keep cases that traverse the given directed edge
 *                    `[from, to]` at least once (strict adjacency in
 *                    the event sequence).
 *  - `node`        — keep cases that contain at least one event of
 *                    `activity`.
 *  - `resourceAt`  — keep cases that have at least one event at
 *                    `activity` whose `org:resource` value is in
 *                    `resources` (OR within clause). Driven by the
 *                    floating selection pill's per-row resource
 *                    toggle (2026-05-12 rework). The sentinel string
 *                    `"(unassigned)"` matches events with
 *                    `resource === null` and is translated once at
 *                    the matcher boundary.
 */
export const UNASSIGNED_RESOURCE = "(unassigned)";

/**
 * Sentinel for `null` / `undefined` case-attribute values in the
 * `attribute` clause's `values` array. Translated at the matcher
 * boundary (see `caseIdsForClause`). Mirrors `UNASSIGNED_RESOURCE`.
 */
export const UNSET_VALUE = "(unset)";

// `DateAnchor` moved to dateFilter.ts (Phase 38-II E3) to break the
// filterClauses ⇄ dateFilter import cycle; re-exported from index.ts there.

export type FilterClause =
  | { kind: "variant"; sequences: string[] }
  | { kind: "branch"; edge: [string, string] }
  | { kind: "node"; activity: string }
  | { kind: "resourceAt"; activity: string; resources: string[] }
  | { kind: "attribute"; attribute: string; values: AttributeValue[] }
  | { kind: "date"; from: string | null; to: string | null; anchor: DateAnchor }
  | { kind: "caseId"; caseIds: string[] };

/**
 * Find the first clause of a given `kind`, narrowed to its concrete variant —
 * a typed replacement for the repeated `list.find(c => c.kind === K) as
 * Extract<FilterClause, …>` idiom (a project anti-pattern).
 */
export function getClause<K extends FilterClause["kind"]>(
  list: readonly FilterClause[],
  kind: K,
): Extract<FilterClause, { kind: K }> | undefined {
  return list.find((c): c is Extract<FilterClause, { kind: K }> => c.kind === kind);
}

/**
 * Structural equality for two clauses. Used by `dedupeClause` to
 * prevent the click-to-filter button from pushing the same
 * `branch` / `node` clause twice on a double-click.
 *
 * Sequence comparison for `variant` is *set* equality — the order
 * the embedder ticks variants in shouldn't change clause identity.
 * Edge tuples and activity strings compare positionally.
 */
export function clauseEquals(a: FilterClause, b: FilterClause): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "variant": {
      const bs = (b as Extract<FilterClause, { kind: "variant" }>).sequences;
      if (a.sequences.length !== bs.length) return false;
      const setA = new Set(a.sequences);
      for (const s of bs) {
        if (!setA.has(s)) return false;
      }
      return true;
    }
    case "branch": {
      const be = (b as Extract<FilterClause, { kind: "branch" }>).edge;
      return a.edge[0] === be[0] && a.edge[1] === be[1];
    }
    case "node":
      return a.activity === (b as Extract<FilterClause, { kind: "node" }>).activity;
    case "resourceAt": {
      const bb = b as Extract<FilterClause, { kind: "resourceAt" }>;
      if (a.activity !== bb.activity) return false;
      if (a.resources.length !== bb.resources.length) return false;
      const setA = new Set(a.resources);
      for (const r of bb.resources) {
        if (!setA.has(r)) return false;
      }
      return true;
    }
    case "attribute": {
      const bb = b as Extract<FilterClause, { kind: "attribute" }>;
      if (a.attribute !== bb.attribute) return false;
      if (a.values.length !== bb.values.length) return false;
      const setA = new Set(a.values);
      for (const v of bb.values) {
        if (!setA.has(v)) return false;
      }
      return true;
    }
    case "date": {
      const bb = b as Extract<FilterClause, { kind: "date" }>;
      return a.from === bb.from && a.to === bb.to && a.anchor === bb.anchor;
    }
    case "caseId": {
      const bb = b as Extract<FilterClause, { kind: "caseId" }>;
      if (a.caseIds.length !== bb.caseIds.length) return false;
      const setA = new Set(a.caseIds);
      for (const id of bb.caseIds) {
        if (!setA.has(id)) return false;
      }
      return true;
    }
  }
}

/**
 * Append `clause` to `list` unless a structurally-equal clause
 * already exists. Returns the original `list` reference (no change)
 * on dedup hit so callers can `===`-check for "did anything happen".
 */
export function dedupeClause(list: FilterClause[], clause: FilterClause): FilterClause[] {
  for (const existing of list) {
    if (clauseEquals(existing, clause)) return list;
  }
  return [...list, clause];
}

/** Structural deep equality of two clause lists (order-sensitive). */
export function clausesEqual(a: FilterClause[], b: FilterClause[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!clauseEquals(a[i] as FilterClause, b[i] as FilterClause)) return false;
  }
  return true;
}

/** Deep-copy a clause so stored filter state can't be mutated through a caller's reference. */
export function cloneClause(c: FilterClause): FilterClause {
  switch (c.kind) {
    case "variant":
      return { kind: "variant", sequences: [...c.sequences] };
    case "branch":
      return { kind: "branch", edge: [c.edge[0], c.edge[1]] };
    case "node":
      return { kind: "node", activity: c.activity };
    case "resourceAt":
      return { kind: "resourceAt", activity: c.activity, resources: [...c.resources] };
    case "attribute":
      return { kind: "attribute", attribute: c.attribute, values: [...c.values] };
    case "date":
      return { kind: "date", from: c.from, to: c.to, anchor: c.anchor };
    case "caseId":
      return { kind: "caseId", caseIds: [...c.caseIds] };
  }
}

/**
 * Runtime validation for the public `DiagramHandle.setFilters` boundary:
 * assert an unknown value is a well-formed `FilterClause[]`, throwing a
 * descriptive `TypeError` per clause kind otherwise.
 */
export function validateFilterClauses(clauses: unknown): asserts clauses is FilterClause[] {
  if (!Array.isArray(clauses)) {
    throw new TypeError("DiagramHandle.setFilters: clauses must be an array of FilterClause");
  }
  for (const c of clauses) {
    if (c === null || typeof c !== "object") {
      throw new TypeError("DiagramHandle.setFilters: every clause must be a FilterClause object");
    }
    const kind = (c as { kind?: unknown }).kind;
    if (kind === "variant") {
      const sigs = (c as { sequences?: unknown }).sequences;
      if (!Array.isArray(sigs) || !sigs.every((s) => typeof s === "string")) {
        throw new TypeError(
          "DiagramHandle.setFilters: variant clause requires sequences: string[]",
        );
      }
    } else if (kind === "branch") {
      const edge = (c as { edge?: unknown }).edge;
      if (
        !Array.isArray(edge) ||
        edge.length !== 2 ||
        typeof edge[0] !== "string" ||
        typeof edge[1] !== "string"
      ) {
        throw new TypeError(
          "DiagramHandle.setFilters: branch clause requires edge: [string, string]",
        );
      }
    } else if (kind === "node") {
      const activity = (c as { activity?: unknown }).activity;
      if (typeof activity !== "string") {
        throw new TypeError("DiagramHandle.setFilters: node clause requires activity: string");
      }
    } else if (kind === "resourceAt") {
      const activity = (c as { activity?: unknown }).activity;
      const rs = (c as { resources?: unknown }).resources;
      if (typeof activity !== "string") {
        throw new TypeError(
          "DiagramHandle.setFilters: resourceAt clause requires activity: string",
        );
      }
      if (!Array.isArray(rs) || !rs.every((r) => typeof r === "string")) {
        throw new TypeError(
          "DiagramHandle.setFilters: resourceAt clause requires resources: string[]",
        );
      }
    } else if (kind === "attribute") {
      const attribute = (c as { attribute?: unknown }).attribute;
      const vs = (c as { values?: unknown }).values;
      if (typeof attribute !== "string") {
        throw new TypeError(
          "DiagramHandle.setFilters: attribute clause requires attribute: string",
        );
      }
      if (
        !Array.isArray(vs) ||
        !vs.every(
          (v) =>
            v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean",
        )
      ) {
        throw new TypeError(
          "DiagramHandle.setFilters: attribute clause requires values: AttributeValue[]",
        );
      }
    } else if (kind === "date") {
      const from = (c as { from?: unknown }).from;
      const to = (c as { to?: unknown }).to;
      const anchor = (c as { anchor?: unknown }).anchor;
      if (from !== null && typeof from !== "string") {
        throw new TypeError("DiagramHandle.setFilters: date clause requires from: string | null");
      }
      if (to !== null && typeof to !== "string") {
        throw new TypeError("DiagramHandle.setFilters: date clause requires to: string | null");
      }
      if (anchor !== "started" && anchor !== "ended") {
        throw new TypeError("DiagramHandle.setFilters: date clause requires anchor: DateAnchor");
      }
    } else if (kind === "caseId") {
      const ids = (c as { caseIds?: unknown }).caseIds;
      if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string" && id.length > 0)) {
        throw new TypeError(
          "DiagramHandle.setFilters: caseId clause requires caseIds: non-empty string[]",
        );
      }
    } else {
      throw new TypeError(`DiagramHandle.setFilters: unknown clause kind ${String(kind)}`);
    }
  }
}

/**
 * Strip every clause of the given `kind` from `list`. If `payload` is
 * non-null, append a fresh clause of that kind after stripping. Used
 * for clause kinds with natural one-at-a-time semantics: `variant`
 * (back-compat for `setVariantFilter`) and `date` (Phase 26 — two
 * date clauses ANDed would just intersect into a tighter range).
 */
type DateClausePayload = { from: string | null; to: string | null; anchor: DateAnchor };
type CaseIdClausePayload = { caseIds: string[] };

export function replaceClause(
  list: FilterClause[],
  kind: "variant",
  payload: string[] | null,
): FilterClause[];
export function replaceClause(
  list: FilterClause[],
  kind: "date",
  payload: DateClausePayload | null,
): FilterClause[];
export function replaceClause(
  list: FilterClause[],
  kind: "caseId",
  payload: CaseIdClausePayload | null,
): FilterClause[];
export function replaceClause(
  list: FilterClause[],
  kind: "variant" | "date" | "caseId",
  payload: string[] | DateClausePayload | CaseIdClausePayload | null,
): FilterClause[] {
  const stripped = list.filter((c) => c.kind !== kind);
  if (payload === null) return stripped;
  if (kind === "variant") {
    return [...stripped, { kind: "variant", sequences: [...(payload as string[])] }];
  }
  if (kind === "caseId") {
    const cp = payload as CaseIdClausePayload;
    return [...stripped, { kind: "caseId", caseIds: [...cp.caseIds] }];
  }
  const dp = payload as DateClausePayload;
  return [...stripped, { kind: "date", from: dp.from, to: dp.to, anchor: dp.anchor }];
}

/**
 * Toggle a resource on the `resourceAt` clause for `activity`. If no
 * such clause exists, creates one with `[resource]`. If the resource
 * is already in the clause, removes it (and strips the clause when
 * the resources array becomes empty). Returns a new list.
 *
 * Drives the floating selection pill's per-row click affordance.
 */
export function toggleResourceAt(
  list: FilterClause[],
  activity: string,
  resource: string,
): FilterClause[] {
  let found = false;
  const next: FilterClause[] = [];
  for (const c of list) {
    if (c.kind !== "resourceAt" || c.activity !== activity) {
      next.push(c);
      continue;
    }
    found = true;
    const hasResource = c.resources.includes(resource);
    const updated = hasResource
      ? c.resources.filter((r) => r !== resource)
      : [...c.resources, resource];
    if (updated.length > 0) {
      next.push({ kind: "resourceAt", activity, resources: updated });
    }
  }
  if (!found) {
    next.push({ kind: "resourceAt", activity, resources: [resource] });
  }
  return next;
}

/**
 * Return the resources currently filtered on `activity`. Used by the
 * selection pill to render active-state on each breakdown row.
 */
export function activeResourcesAt(list: FilterClause[], activity: string): string[] {
  for (const c of list) {
    if (c.kind === "resourceAt" && c.activity === activity) {
      return [...c.resources];
    }
  }
  return [];
}

/**
 * Compute the intersection of the case sets implied by every clause.
 * Returns `null` when the clause list is empty so the caller knows to
 * skip filtering entirely (don't materialise a no-op filtered log).
 *
 * Per-kind logic:
 *  - `variant` → cases whose sequence signature is in `sequences`
 *  - `branch`  → cases with at least one adjacent event-pair where
 *                `events[i].activity === edge[0]` and
 *                `events[i+1].activity === edge[1]`
 *  - `node`    → cases with at least one event whose activity equals
 *                `activity`
 */
export function clausesToCaseIds(log: EventLog, clauses: FilterClause[]): Set<string> | null {
  if (clauses.length === 0) return null;

  let acc: Set<string> | null = null;
  for (const clause of clauses) {
    const next = caseIdsForClause(log, clause);
    if (acc === null) {
      acc = next;
    } else {
      const intersection = new Set<string>();
      for (const id of acc) {
        if (next.has(id)) intersection.add(id);
      }
      acc = intersection;
    }
  }
  return acc;
}

function caseIdsForClause(log: EventLog, clause: FilterClause): Set<string> {
  const ids = new Set<string>();
  switch (clause.kind) {
    case "variant": {
      const allowed = new Set(clause.sequences);
      for (const [caseId, c] of log.cases) {
        if (allowed.has(sigOf(c))) ids.add(caseId);
      }
      return ids;
    }
    case "branch": {
      const [from, to] = clause.edge;
      for (const [caseId, c] of log.cases) {
        if (caseTraversesEdge(c.events, from, to)) ids.add(caseId);
      }
      return ids;
    }
    case "node": {
      const target = clause.activity;
      for (const [caseId, c] of log.cases) {
        for (const ev of c.events) {
          if (ev.activity === target) {
            ids.add(caseId);
            break;
          }
        }
      }
      return ids;
    }
    case "resourceAt": {
      // OR within clause: a case survives if it has at least one event
      // at `activity` whose resource is in `resources`. Sentinel
      // `(unassigned)` matches events with `resource === null`.
      const targetActivity = clause.activity;
      const allowed = new Set<string>();
      let includeUnassigned = false;
      for (const r of clause.resources) {
        if (r === UNASSIGNED_RESOURCE) includeUnassigned = true;
        else allowed.add(r);
      }
      for (const [caseId, c] of log.cases) {
        for (const ev of c.events) {
          if (ev.activity !== targetActivity) continue;
          if (ev.resource === null) {
            if (includeUnassigned) {
              ids.add(caseId);
              break;
            }
            continue;
          }
          if (allowed.has(ev.resource)) {
            ids.add(caseId);
            break;
          }
        }
      }
      return ids;
    }
    case "attribute": {
      // OR within clause: a case survives if its
      // `attributes[clause.attribute]` is among the allowed values.
      // Sentinel `(unset)` matches null/undefined values. A literal
      // `null` in the values array also matches null/undefined (a
      // defensive convenience for programmatic callers).
      const targetAttr = clause.attribute;
      const allowed = new Set<AttributeValue>();
      let includeUnset = false;
      for (const v of clause.values) {
        if (v === UNSET_VALUE || v === null) includeUnset = true;
        else allowed.add(v);
      }
      for (const [caseId, c] of log.cases) {
        const v = c.attributes[targetAttr];
        if (v === undefined || v === null) {
          if (includeUnset) ids.add(caseId);
          continue;
        }
        if (allowed.has(v)) ids.add(caseId);
      }
      return ids;
    }
    case "date": {
      // ISO bound translation + anchor predicate live in dateFilter.ts
      // (parseDateBound owns the native-input UTC-midnight gotcha).
      // Defensive auto-swap so a programmatic setFilters caller passing
      // from > to still matches honestly; the UI already swaps before
      // push (Phase 26 D5).
      const rawLo = parseDateBound(clause.from, "from");
      const rawHi = parseDateBound(clause.to, "to");
      const lo = Math.min(rawLo, rawHi);
      const hi = Math.max(rawLo, rawHi);
      for (const [caseId, c] of log.cases) {
        if (caseInDateRange(c, lo, hi, clause.anchor)) ids.add(caseId);
      }
      return ids;
    }
    case "caseId": {
      // OR within clause: keep cases whose id ∈ caseIds. Empty array
      // matches nothing (no case is in an empty set). Sub-set across
      // the log's keys so non-existent IDs in the clause silently drop.
      const allowed = new Set(clause.caseIds);
      for (const caseId of log.cases.keys()) {
        if (allowed.has(caseId)) ids.add(caseId);
      }
      return ids;
    }
  }
}

function sigOf(c: Case): string {
  return variantSignature(c.events.map((e) => e.activity));
}

function caseTraversesEdge(events: Event[], from: string, to: string): boolean {
  for (let i = 0; i < events.length - 1; i += 1) {
    const a = events[i] as Event;
    const b = events[i + 1] as Event;
    if (a.activity === from && b.activity === to) return true;
  }
  return false;
}

/**
 * Apply a clause list to an `EventLog`, returning a new `EventLog`
 * scoped to the surviving case set. Empty clauses round-trip to the
 * input log (reference identity) so the diagram can shortcut the
 * "no filter" path without copying.
 */
export function buildFilteredLogFromClauses(log: EventLog, clauses: FilterClause[]): EventLog {
  const ids = clausesToCaseIds(log, clauses);
  if (ids === null) return log;
  const filteredCases = new Map<string, Case>();
  const filteredEvents: Event[] = [];
  for (const [caseId, c] of log.cases) {
    if (!ids.has(caseId)) continue;
    filteredCases.set(caseId, c);
    for (const ev of c.events) filteredEvents.push(ev);
  }
  return {
    cases: filteredCases,
    events: filteredEvents,
    schema: log.schema,
  };
}
