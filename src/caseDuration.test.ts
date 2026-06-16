import { describe, expect, test } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import n1000Csv from "../data/input/runs/n1000-realistic/events.csv?raw";
import n1000Meta from "../data/input/runs/n1000-realistic/run_metadata.json";
import { buildDfg } from "./buildDfg.js";
import { getCaseDurations, getTerminalNodeDurations } from "./caseDuration.js";
import { buildFilteredLog } from "./getVariants.js";
import { parseCsv } from "./parseCsv.js";
import type { Case, Dfg, EdgeStats, Event, EventLog, NodeStats } from "./types.js";

const emptyLog: EventLog = {
  cases: new Map(),
  events: [],
  schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
};

const DAY_MS = 86_400_000;

describe("getCaseDurations", () => {
  test("empty log returns empty Map", () => {
    const result = getCaseDurations(emptyLog);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  test("n5-fixture: exact ms values for every case", () => {
    const { log } = parseCsv(n5Csv);
    const durations = getCaseDurations(log);
    expect(durations.size).toBe(5);
    expect(durations.get("case_0001")).toBe(3 * DAY_MS);
    expect(durations.get("case_0002")).toBe(14 * DAY_MS);
    expect(durations.get("case_0003")).toBe(14 * DAY_MS);
    expect(durations.get("case_0004")).toBe(16 * DAY_MS);
    expect(durations.get("case_0005")).toBe(55 * DAY_MS);
  });

  test("n1000-realistic spot-check: size matches, every value ≥ 0, sum > 0", () => {
    const { log } = parseCsv(n1000Csv);
    const durations = getCaseDurations(log);
    expect(durations.size).toBe(n1000Meta.num_cases);
    let sum = 0;
    for (const v of durations.values()) {
      expect(v).toBeGreaterThanOrEqual(0);
      sum += v;
    }
    expect(sum).toBeGreaterThan(0);
  });

  test("determinism — two calls return structurally equal Maps", () => {
    const { log } = parseCsv(n5Csv);
    const a = getCaseDurations(log);
    const b = getCaseDurations(log);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  test("single-event case contributes 0 ms", () => {
    const log = makeLog([{ id: "c1", activities: ["x"] }]);
    const durations = getCaseDurations(log);
    expect(durations.get("c1")).toBe(0);
  });

  test("zero-event case is skipped, valid cases still measured", () => {
    // A case with an empty events array has no first/last event → it is
    // skipped silently rather than producing a NaN/garbage entry.
    const log = makeLog([{ id: "c1", activities: ["a", "b"] }]);
    log.cases.set("empty", { id: "empty", events: [], attributes: {} });
    const durations = getCaseDurations(log);
    expect(durations.has("empty")).toBe(false);
    expect(durations.has("c1")).toBe(true);
    expect(durations.size).toBe(1);
  });
});

describe("getTerminalNodeDurations", () => {
  test("n5-fixture unfiltered: terminal set = {rejected, approved} with correct aggregates", () => {
    const { log } = parseCsv(n5Csv);
    const dfg = buildDfg(log);
    const terminals = getTerminalNodeDurations(dfg, log);

    expect([...terminals.keys()].sort()).toEqual(["approved", "rejected"]);

    const rejected = terminals.get("rejected");
    expect(rejected).toEqual({
      mean: ((3 + 14) * DAY_MS) / 2,
      median: ((3 + 14) * DAY_MS) / 2,
      count: 2,
    });

    const approved = terminals.get("approved");
    expect(approved).toEqual({
      mean: ((14 + 16 + 55) * DAY_MS) / 3,
      median: 16 * DAY_MS,
      count: 3,
    });
  });

  test("non-terminal activities are absent from the Map", () => {
    const { log } = parseCsv(n5Csv);
    const dfg = buildDfg(log);
    const terminals = getTerminalNodeDurations(dfg, log);
    for (const nonTerminal of [
      "submitted",
      "intake_validation",
      "assigned_to_reviewer",
      "review_in_progress",
      "health_inspection",
      "request_additional_info",
      "applicant_provided_info",
    ]) {
      expect(terminals.has(nonTerminal)).toBe(false);
    }
  });

  test("filtered Dfg narrows the terminal set and recomputes values", () => {
    const { log } = parseCsv(n5Csv);
    // Keep only the direct-approval variant of case_0002 (no rework loops).
    const signatures = [
      JSON.stringify([
        "submitted",
        "intake_validation",
        "assigned_to_reviewer",
        "review_in_progress",
        "health_inspection",
        "approved",
      ]),
    ];
    const filtered = buildFilteredLog(log, signatures);
    const dfg = buildDfg(filtered);
    const terminals = getTerminalNodeDurations(dfg, filtered);

    // case_0002 (14 days) and case_0004 (16 days) both follow the direct-approval
    // variant; case_0005 has rework loops so it's filtered out.
    expect([...terminals.keys()]).toEqual(["approved"]);
    const approved = terminals.get("approved");
    expect(approved).toEqual({
      mean: ((14 + 16) * DAY_MS) / 2,
      median: ((14 + 16) * DAY_MS) / 2,
      count: 2,
    });
  });

  test("empty log returns empty Map", () => {
    const emptyDfg: Dfg = { nodes: new Map(), edges: new Map() };
    expect(getTerminalNodeDurations(emptyDfg, emptyLog).size).toBe(0);
  });

  test("zero-duration single-event case contributes 0 ms", () => {
    const log = makeLog([{ id: "c1", activities: ["finish"] }]);
    const dfg = buildDfg(log);
    const terminals = getTerminalNodeDurations(dfg, log);
    expect(terminals.get("finish")).toEqual({ mean: 0, median: 0, count: 1 });
  });

  test("hand-built Dfg: case ending at a non-terminal activity is excluded", () => {
    // Build a log: one case ends at "B"; another case ends at "C".
    const log = makeLog([
      { id: "c1", activities: ["A", "B"] },
      { id: "c2", activities: ["A", "B", "C"] },
    ]);
    // Hand-build a Dfg in which "B" is NOT terminal (it has an outgoing edge to "C").
    const handDfg: Dfg = {
      nodes: new Map<string, NodeStats>([
        ["A", makeNode("A")],
        ["B", makeNode("B")],
        ["C", makeNode("C")],
      ]),
      edges: new Map<string, EdgeStats>([
        ["AB", makeEdge("A", "B")],
        ["BC", makeEdge("B", "C")],
      ]),
    };
    const terminals = getTerminalNodeDurations(handDfg, log);
    // Only "C" is terminal; c1 ends at "B" which is non-terminal in this Dfg → excluded.
    expect([...terminals.keys()]).toEqual(["C"]);
    expect(terminals.get("C")?.count).toBe(1);
  });

  test("zero-event case is skipped without polluting terminal buckets", () => {
    // The empty case has no last event, so it cannot belong to any terminal
    // bucket; the lone real case ending at "finish" is the only aggregate.
    const log = makeLog([{ id: "c1", activities: ["start", "finish"] }]);
    log.cases.set("empty", { id: "empty", events: [], attributes: {} });
    const dfg = buildDfg(log);
    const terminals = getTerminalNodeDurations(dfg, log);
    expect([...terminals.keys()]).toEqual(["finish"]);
    expect(terminals.get("finish")?.count).toBe(1);
  });

  test("median: odd count returns middle, even count returns mean of two middles", () => {
    // Build five cases all ending at terminal "end", with durations 1, 2, 3, 4, 5 minutes.
    const start = new Date(2024, 0, 1, 0, 0, 0);
    const cases: Case[] = [1, 2, 3, 4, 5].map((min, i) => {
      const id = `c${i}`;
      const startEvent: Event = {
        caseId: id,
        activity: "start",
        timestamp: start,
        resource: null,
        lifecycle: "complete",
        attributes: {},
      };
      const endEvent: Event = {
        caseId: id,
        activity: "end",
        timestamp: new Date(start.getTime() + min * 60_000),
        resource: null,
        lifecycle: "complete",
        attributes: {},
      };
      return { id, events: [startEvent, endEvent], attributes: {} };
    });
    const caseMap = new Map<string, Case>();
    const events: Event[] = [];
    for (const c of cases) {
      caseMap.set(c.id, c);
      events.push(...c.events);
    }
    const log: EventLog = {
      cases: caseMap,
      events,
      schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
    };
    const dfg = buildDfg(log);
    const odd = getTerminalNodeDurations(dfg, log);
    expect(odd.get("end")?.median).toBe(3 * 60_000);

    // Drop the last case → even count → median = mean of the two middles (2 & 3).
    caseMap.delete("c4");
    log.events = log.events.filter((e) => e.caseId !== "c4");
    const evenDfg = buildDfg(log);
    const even = getTerminalNodeDurations(evenDfg, log);
    expect(even.get("end")?.median).toBe(2.5 * 60_000);
  });
});

function makeLog(cases: { id: string; activities: string[] }[]): EventLog {
  const eventList: Event[] = [];
  const caseMap = new Map<string, Case>();
  for (const c of cases) {
    const events: Event[] = c.activities.map((activity, i) => ({
      caseId: c.id,
      activity,
      timestamp: new Date(2024, 0, 1, 0, i),
      resource: null,
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

function makeNode(activity: string): NodeStats {
  return {
    activity,
    absoluteFrequency: 1,
    caseFrequency: 1,
    maxRepetitions: 1,
    meanRepetitions: 1,
  };
}

function makeEdge(from: string, to: string): EdgeStats {
  return {
    from,
    to,
    absoluteFrequency: 1,
    caseFrequency: 1,
    maxRepetitions: 1,
    meanRepetitions: 1,
    durationMs: { mean: 0, median: 0, min: 0, max: 0 },
  };
}
