import { describe, expect, test } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import { buildDfg } from "./buildDfg.js";
import { parseCsv } from "./parseCsv.js";

const { log } = parseCsv(n5Csv);

describe("buildDfg — n5 fixture nodes", () => {
  test("has 9 distinct activity nodes", () => {
    const dfg = buildDfg(log);
    expect(dfg.nodes.size).toBe(9);
  });

  test("node frequencies match run_metadata.activity_distribution", () => {
    const dfg = buildDfg(log);
    const expected: Record<string, number> = {
      review_in_progress: 7,
      submitted: 5,
      intake_validation: 5,
      assigned_to_reviewer: 4,
      health_inspection: 4,
      request_additional_info: 3,
      approved: 3,
      applicant_provided_info: 3,
      rejected: 2,
    };
    for (const [activity, count] of Object.entries(expected)) {
      expect(dfg.nodes.get(activity)?.absoluteFrequency).toBe(count);
    }
  });

  test("sum of node frequencies equals total events (36)", () => {
    const dfg = buildDfg(log);
    const total = [...dfg.nodes.values()].reduce((s, n) => s + n.absoluteFrequency, 0);
    expect(total).toBe(36);
  });
});

describe("buildDfg — n5 fixture edges", () => {
  test("has 10 distinct transitions", () => {
    const dfg = buildDfg(log);
    expect(dfg.edges.size).toBe(10);
  });

  test("edge frequencies match hand-counted totals", () => {
    const dfg = buildDfg(log);
    const expected: { from: string; to: string; absoluteFrequency: number }[] = [
      { from: "submitted", to: "intake_validation", absoluteFrequency: 5 },
      { from: "intake_validation", to: "rejected", absoluteFrequency: 1 },
      { from: "intake_validation", to: "assigned_to_reviewer", absoluteFrequency: 4 },
      { from: "assigned_to_reviewer", to: "review_in_progress", absoluteFrequency: 4 },
      { from: "review_in_progress", to: "health_inspection", absoluteFrequency: 4 },
      { from: "health_inspection", to: "approved", absoluteFrequency: 3 },
      { from: "health_inspection", to: "rejected", absoluteFrequency: 1 },
      { from: "review_in_progress", to: "request_additional_info", absoluteFrequency: 3 },
      { from: "request_additional_info", to: "applicant_provided_info", absoluteFrequency: 3 },
      { from: "applicant_provided_info", to: "review_in_progress", absoluteFrequency: 3 },
    ];
    const byPair = new Map<string, number>();
    for (const e of dfg.edges.values()) {
      byPair.set(`${e.from}->${e.to}`, e.absoluteFrequency);
    }
    for (const ex of expected) {
      expect(byPair.get(`${ex.from}->${ex.to}`)).toBe(ex.absoluteFrequency);
    }
  });

  test("sum of edge frequencies equals events minus cases (31)", () => {
    const dfg = buildDfg(log);
    const total = [...dfg.edges.values()].reduce((s, e) => s + e.absoluteFrequency, 0);
    expect(total).toBe(36 - 5);
  });

  test("every edge exposes from/to first-class on EdgeStats", () => {
    const dfg = buildDfg(log);
    for (const e of dfg.edges.values()) {
      expect(typeof e.from).toBe("string");
      expect(typeof e.to).toBe("string");
      expect(e.from.length).toBeGreaterThan(0);
      expect(e.to.length).toBeGreaterThan(0);
    }
  });
});

describe("buildDfg — duration stats invariants", () => {
  test("every edge has min <= median <= max and mean > 0", () => {
    const dfg = buildDfg(log);
    for (const e of dfg.edges.values()) {
      expect(e.durationMs.min).toBeLessThanOrEqual(e.durationMs.median);
      expect(e.durationMs.median).toBeLessThanOrEqual(e.durationMs.max);
      expect(e.durationMs.mean).toBeGreaterThan(0);
      expect(e.durationMs.min).toBeGreaterThan(0);
    }
  });

  test("single-occurrence edge has all four stats equal to the single sample", () => {
    const dfg = buildDfg(log);
    const single = [...dfg.edges.values()].find((e) => e.absoluteFrequency === 1);
    expect(single).toBeDefined();
    const { min, median, max, mean } = single?.durationMs ?? { min: 0, median: 0, max: 0, mean: 0 };
    expect(min).toBe(median);
    expect(median).toBe(max);
    expect(max).toBe(mean);
  });

  test("rework-loop edge (review_in_progress -> request_additional_info) has 3 samples", () => {
    const dfg = buildDfg(log);
    const e = [...dfg.edges.values()].find(
      (x) => x.from === "review_in_progress" && x.to === "request_additional_info",
    );
    expect(e?.absoluteFrequency).toBe(3);
    expect(e?.durationMs.min).toBeLessThanOrEqual(e?.durationMs.mean ?? 0);
    expect(e?.durationMs.mean ?? 0).toBeLessThanOrEqual(e?.durationMs.max ?? 0);
  });
});

describe("buildDfg — count aggregates", () => {
  test("review_in_progress carries the rework-loop aggregates exactly", () => {
    const dfg = buildDfg(log);
    const node = dfg.nodes.get("review_in_progress");
    expect(node).toEqual({
      activity: "review_in_progress",
      absoluteFrequency: 7,
      caseFrequency: 4,
      maxRepetitions: 4,
      meanRepetitions: 1.75,
    });
  });

  test("submitted collapses all four aggregates to the one-per-case shape", () => {
    const dfg = buildDfg(log);
    const node = dfg.nodes.get("submitted");
    expect(node).toEqual({
      activity: "submitted",
      absoluteFrequency: 5,
      caseFrequency: 5,
      maxRepetitions: 1,
      meanRepetitions: 1,
    });
  });

  test("rework-back edge review_in_progress -> request_additional_info aggregates to a single-case loop", () => {
    const dfg = buildDfg(log);
    const edge = [...dfg.edges.values()].find(
      (e) => e.from === "review_in_progress" && e.to === "request_additional_info",
    );
    expect(edge).toBeDefined();
    expect(edge?.absoluteFrequency).toBe(3);
    expect(edge?.caseFrequency).toBe(1);
    expect(edge?.maxRepetitions).toBe(3);
    expect(edge?.meanRepetitions).toBe(3);
  });

  test("every NodeStats respects caseFrequency <= absoluteFrequency and repetition lower bounds", () => {
    const dfg = buildDfg(log);
    for (const node of dfg.nodes.values()) {
      expect(node.caseFrequency).toBeGreaterThanOrEqual(1);
      expect(node.caseFrequency).toBeLessThanOrEqual(node.absoluteFrequency);
      expect(node.maxRepetitions).toBeGreaterThanOrEqual(1);
      expect(node.meanRepetitions).toBeGreaterThanOrEqual(1);
      expect(node.meanRepetitions).toBeLessThanOrEqual(node.maxRepetitions);
    }
  });

  test("every EdgeStats respects caseFrequency <= absoluteFrequency and repetition lower bounds", () => {
    const dfg = buildDfg(log);
    for (const edge of dfg.edges.values()) {
      expect(edge.caseFrequency).toBeGreaterThanOrEqual(1);
      expect(edge.caseFrequency).toBeLessThanOrEqual(edge.absoluteFrequency);
      expect(edge.maxRepetitions).toBeGreaterThanOrEqual(1);
      expect(edge.meanRepetitions).toBeGreaterThanOrEqual(1);
      expect(edge.meanRepetitions).toBeLessThanOrEqual(edge.maxRepetitions);
    }
  });
});

describe("buildDfg — purity", () => {
  test("returns a fresh Dfg each call (no shared state)", () => {
    const a = buildDfg(log);
    const b = buildDfg(log);
    expect(a).not.toBe(b);
    expect(a.nodes).not.toBe(b.nodes);
    expect(a.edges).not.toBe(b.edges);
  });

  test("does not mutate the input EventLog", () => {
    const { log: fresh } = parseCsv(n5Csv);
    const beforeEventCount = fresh.events.length;
    const beforeCaseCount = fresh.cases.size;
    const firstCaseEventCount = fresh.cases.get("case_0001")?.events.length ?? 0;
    buildDfg(fresh);
    expect(fresh.events.length).toBe(beforeEventCount);
    expect(fresh.cases.size).toBe(beforeCaseCount);
    expect(fresh.cases.get("case_0001")?.events.length).toBe(firstCaseEventCount);
  });
});
