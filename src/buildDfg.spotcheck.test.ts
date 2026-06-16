import { describe, expect, test } from "vitest";
import n1000Csv from "../data/input/runs/n1000-realistic/events.csv?raw";
import n1000Meta from "../data/input/runs/n1000-realistic/run_metadata.json";
import { buildDfg } from "./buildDfg.js";
import { parseCsv } from "./parseCsv.js";

describe("buildDfg — n1000 aggregate spot-check (run_metadata.json)", () => {
  test("parses 1000 cases and 7347 events with zero warnings", () => {
    const { log, warnings } = parseCsv(n1000Csv);
    expect(warnings).toEqual([]);
    expect(log.cases.size).toBe(n1000Meta.num_cases);
    expect(log.events.length).toBe(n1000Meta.num_events);
  });

  test("dfg.nodes.size matches the activity_distribution cardinality", () => {
    const { log } = parseCsv(n1000Csv);
    const dfg = buildDfg(log);
    expect(dfg.nodes.size).toBe(Object.keys(n1000Meta.activity_distribution).length);
  });

  test("every node frequency matches run_metadata.activity_distribution exactly", () => {
    const { log } = parseCsv(n1000Csv);
    const dfg = buildDfg(log);
    for (const [activity, count] of Object.entries(n1000Meta.activity_distribution)) {
      expect(dfg.nodes.get(activity)?.absoluteFrequency).toBe(count);
    }
  });

  test("sum of node frequencies equals num_events", () => {
    const { log } = parseCsv(n1000Csv);
    const dfg = buildDfg(log);
    const total = [...dfg.nodes.values()].reduce((s, n) => s + n.absoluteFrequency, 0);
    expect(total).toBe(n1000Meta.num_events);
  });

  test("sum of edge frequencies equals num_events minus num_cases", () => {
    const { log } = parseCsv(n1000Csv);
    const dfg = buildDfg(log);
    const total = [...dfg.edges.values()].reduce((s, e) => s + e.absoluteFrequency, 0);
    expect(total).toBe(n1000Meta.num_events - n1000Meta.num_cases);
  });
});

describe("buildDfg — n1000 count-aggregate invariants", () => {
  test("every NodeStats has positive repetition counts and caseFrequency never exceeds absoluteFrequency", () => {
    const { log } = parseCsv(n1000Csv);
    const dfg = buildDfg(log);
    for (const node of dfg.nodes.values()) {
      expect(node.caseFrequency).toBeGreaterThanOrEqual(1);
      expect(node.caseFrequency).toBeLessThanOrEqual(node.absoluteFrequency);
      expect(node.maxRepetitions).toBeGreaterThanOrEqual(1);
      expect(node.meanRepetitions).toBeGreaterThanOrEqual(1);
      expect(node.meanRepetitions).toBeLessThanOrEqual(node.maxRepetitions);
    }
  });

  test("every EdgeStats has positive repetition counts and caseFrequency never exceeds absoluteFrequency", () => {
    const { log } = parseCsv(n1000Csv);
    const dfg = buildDfg(log);
    for (const edge of dfg.edges.values()) {
      expect(edge.caseFrequency).toBeGreaterThanOrEqual(1);
      expect(edge.caseFrequency).toBeLessThanOrEqual(edge.absoluteFrequency);
      expect(edge.maxRepetitions).toBeGreaterThanOrEqual(1);
      expect(edge.meanRepetitions).toBeGreaterThanOrEqual(1);
      expect(edge.meanRepetitions).toBeLessThanOrEqual(edge.maxRepetitions);
    }
  });

  test("sum of caseFrequency across nodes does not exceed sum of absoluteFrequency", () => {
    const { log } = parseCsv(n1000Csv);
    const dfg = buildDfg(log);
    const sumCase = [...dfg.nodes.values()].reduce((s, n) => s + n.caseFrequency, 0);
    const sumAbs = [...dfg.nodes.values()].reduce((s, n) => s + n.absoluteFrequency, 0);
    expect(sumCase).toBeLessThanOrEqual(sumAbs);
  });

  test("at least one node has meanRepetitions > 1 (rework exists in the realistic fixture)", () => {
    const { log } = parseCsv(n1000Csv);
    const dfg = buildDfg(log);
    const rework = [...dfg.nodes.values()].some((n) => n.meanRepetitions > 1);
    expect(rework).toBe(true);
  });
});
