import { describe, expect, test } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import { getResourceBreakdown, logHasResources } from "./getResourceBreakdown.js";
import { parseCsv } from "./parseCsv.js";
import type { Case, Event, EventLog } from "./types.js";

function makeLog(
  cases: { id: string; events: { activity: string; resource: string | null }[] }[],
): EventLog {
  const eventList: Event[] = [];
  const caseMap = new Map<string, Case>();
  for (const c of cases) {
    const events: Event[] = c.events.map((e, i) => ({
      caseId: c.id,
      activity: e.activity,
      timestamp: new Date(2024, 0, 1, 0, i),
      resource: e.resource,
      lifecycle: "complete",
      attributes: {},
    }));
    eventList.push(...events);
    caseMap.set(c.id, { id: c.id, events, attributes: {} });
  }
  return {
    cases: caseMap,
    events: eventList,
    schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
  };
}

function nullEveryResource(log: EventLog): EventLog {
  const events: Event[] = log.events.map((e) => ({ ...e, resource: null }));
  const cases = new Map<string, Case>();
  for (const [id, c] of log.cases) {
    cases.set(id, {
      id,
      events: c.events.map((e) => ({ ...e, resource: null })),
      attributes: c.attributes,
    });
  }
  return { cases, events, schema: log.schema };
}

describe("getResourceBreakdown — empty / edge cases", () => {
  test("activity that doesn't appear in the log returns []", () => {
    const { log } = parseCsv(n5Csv);
    expect(getResourceBreakdown("does_not_exist", log)).toEqual([]);
  });

  test("empty log returns []", () => {
    const log = makeLog([]);
    expect(getResourceBreakdown("submitted", log)).toEqual([]);
  });

  test("returns a fresh array (not a reused reference)", () => {
    const { log } = parseCsv(n5Csv);
    const a = getResourceBreakdown("submitted", log);
    const b = getResourceBreakdown("submitted", log);
    expect(a).not.toBe(b);
  });
});

describe("getResourceBreakdown — n5 fixture", () => {
  const { log } = parseCsv(n5Csv);

  test("'submitted' is always unassigned → single null row at 100%", () => {
    const rows = getResourceBreakdown("submitted", log);
    expect(rows).toEqual([{ resource: null, count: 5, percentage: 100 }]);
  });

  test("'intake_validation' → clerk_002 ×4 (80%), clerk_003 ×1 (20%)", () => {
    const rows = getResourceBreakdown("intake_validation", log);
    expect(rows).toEqual([
      { resource: "clerk_002", count: 4, percentage: 80 },
      { resource: "clerk_003", count: 1, percentage: 20 },
    ]);
  });

  test("'review_in_progress' — lex tiebreak between reviewer_001 (3) and reviewer_004 (3)", () => {
    const rows = getResourceBreakdown("review_in_progress", log);
    expect(rows).toEqual([
      { resource: "reviewer_001", count: 3, percentage: expect.any(Number) },
      { resource: "reviewer_004", count: 3, percentage: expect.any(Number) },
      { resource: "reviewer_003", count: 1, percentage: expect.any(Number) },
    ]);
  });

  test("returns the full sorted list (not capped at 5)", () => {
    const rows = getResourceBreakdown("review_in_progress", log);
    expect(rows).toHaveLength(3);
  });

  test("sum of count equals total events for that activity", () => {
    const rows = getResourceBreakdown("review_in_progress", log);
    const total = rows.reduce((s, r) => s + r.count, 0);
    expect(total).toBe(7);
  });
});

describe("getResourceBreakdown — sort order", () => {
  test("count desc dominates lex tiebreak", () => {
    const log = makeLog([
      {
        id: "c1",
        events: [
          { activity: "x", resource: "zeta" },
          { activity: "x", resource: "zeta" },
          { activity: "x", resource: "alpha" },
        ],
      },
    ]);
    const rows = getResourceBreakdown("x", log);
    expect(rows.map((r) => r.resource)).toEqual(["zeta", "alpha"]);
  });

  test("equal counts → lex asc on named resources, null placed last", () => {
    const log = makeLog([
      {
        id: "c1",
        events: [
          { activity: "x", resource: "bob" },
          { activity: "x", resource: "alice" },
          { activity: "x", resource: null },
        ],
      },
    ]);
    const rows = getResourceBreakdown("x", log);
    expect(rows.map((r) => r.resource)).toEqual(["alice", "bob", null]);
  });

  test("named resource and null at equal count → null still last", () => {
    const log = makeLog([
      {
        id: "c1",
        events: [
          { activity: "x", resource: null },
          { activity: "x", resource: "alice" },
        ],
      },
    ]);
    const rows = getResourceBreakdown("x", log);
    expect(rows.map((r) => r.resource)).toEqual(["alice", null]);
  });

  test("equal counts → lex tiebreak resolves both directions (a<b and a>b)", () => {
    // Three distinct named resources at equal count force the comparator down
    // both the `a < b` (return -1) and `a > b` (return 1) lexical branches,
    // regardless of the pivots V8's sort happens to pick.
    const log = makeLog([
      {
        id: "c1",
        events: [
          { activity: "x", resource: "charlie" },
          { activity: "x", resource: "alpha" },
          { activity: "x", resource: "bravo" },
        ],
      },
    ]);
    const rows = getResourceBreakdown("x", log);
    expect(rows.map((r) => r.resource)).toEqual(["alpha", "bravo", "charlie"]);
  });

  test("all-null activity → single null row at 100%", () => {
    const log = makeLog([
      {
        id: "c1",
        events: [
          { activity: "x", resource: null },
          { activity: "x", resource: null },
          { activity: "x", resource: null },
        ],
      },
    ]);
    const rows = getResourceBreakdown("x", log);
    expect(rows).toEqual([{ resource: null, count: 3, percentage: 100 }]);
  });
});

describe("logHasResources", () => {
  test("n5 fixture has resources (clerk_NN etc.)", () => {
    const { log } = parseCsv(n5Csv);
    expect(logHasResources(log)).toBe(true);
  });

  test("synthetic all-null log → false", () => {
    const { log } = parseCsv(n5Csv);
    const mutated = nullEveryResource(log);
    expect(logHasResources(mutated)).toBe(false);
  });

  test("empty log → false", () => {
    const log = makeLog([]);
    expect(logHasResources(log)).toBe(false);
  });

  test("short-circuits — true the moment any event has a non-null resource", () => {
    const log = makeLog([
      {
        id: "c1",
        events: [
          { activity: "x", resource: null },
          { activity: "x", resource: null },
          { activity: "x", resource: "alice" },
          { activity: "x", resource: null },
        ],
      },
    ]);
    expect(logHasResources(log)).toBe(true);
  });
});
