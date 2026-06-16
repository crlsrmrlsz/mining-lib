import { describe, expect, test } from "vitest";

import loanCsv from "../data/input/runs/loan-origination/events.csv?raw";
import loanMeta from "../data/input/runs/loan-origination/run_metadata.json";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import n5Json from "../data/input/runs/n5-fixture/events.json?raw";
import { buildDfg } from "./buildDfg.js";
import { getTerminalNodeDurations } from "./caseDuration.js";
import { getVariants } from "./getVariants.js";
import { parseLog } from "./parseNdjson.js";

// Loose aggregate spot-check à la Phase 2's n1000 pattern — designed
// to catch "the run is broken / lost an activity / has zero cases"
// without pinning seed-42 emergent counts that would churn on every
// ProcessLog patch update.

const HUMAN_ACTIVITIES = new Set([
  "Document Collection",
  "Initial Review",
  "Underwriting",
  "Property Appraisal",
  "Clear to Close",
]);

const TERMINAL_ACTIVITIES = new Set(["Loan Funded", "Declined", "Withdrawn"]);

const NAMED_VARIANT_ENDS = {
  funded: "Loan Funded",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

// The loan dataset ships as CSV only in the public package (its NDJSON
// serialization is a 7.5 MB duplicate). These data-shape assertions are
// format-agnostic, and NDJSON parsing + CSV↔NDJSON parity are covered on the
// tiny n5 fixture (below + parseNdjson.test.ts).
describe.each([
  ["CSV (parseLog auto-detect)", loanCsv],
])("loan-origination fixture — %s", (_label, raw) => {
  test("parses with zero warnings", () => {
    const { warnings } = parseLog(raw);
    expect(warnings).toEqual([]);
  });

  test("~2500 cases (±10) and the metadata's event total", () => {
    const { log } = parseLog(raw);
    expect(log.cases.size).toBeGreaterThanOrEqual(loanMeta.num_cases - 10);
    expect(log.cases.size).toBeLessThanOrEqual(loanMeta.num_cases + 10);
    expect(log.events.length).toBe(loanMeta.num_events);
  });

  test("13 distinct activity nodes — every activity in the config is present", () => {
    const { log } = parseLog(raw);
    const dfg = buildDfg(log);
    expect(dfg.nodes.size).toBe(13);
    const activities = new Set([...dfg.nodes.keys()]);
    for (const expected of [
      "Application Submitted",
      "Credit Check",
      "Document Collection",
      "Initial Review",
      "Underwriting",
      "Request Additional Documents",
      "Documents Received",
      "Property Appraisal",
      "Conditional Approval",
      "Clear to Close",
      "Loan Funded",
      "Declined",
      "Withdrawn",
    ]) {
      expect(activities.has(expected)).toBe(true);
    }
  });

  test("Direct Funding is the top variant by case count", () => {
    const { log } = parseLog(raw);
    const variants = getVariants(log);
    expect(variants.length).toBeGreaterThan(0);
    const top = variants[0];
    if (!top) throw new Error("expected at least one variant");
    expect(top.sequence[0]).toBe("Application Submitted");
    expect(top.sequence[top.sequence.length - 1]).toBe(NAMED_VARIANT_ENDS.funded);
    // Direct Funding visits Underwriting exactly once (no loop).
    const uwVisits = top.sequence.filter((a) => a === "Underwriting").length;
    expect(uwVisits).toBe(1);
    // And the top variant should account for roughly half of the cases.
    expect(top.percentage).toBeGreaterThan(40);
    expect(top.percentage).toBeLessThan(65);
  });

  test("three terminal nodes, each with non-zero mean duration", () => {
    const { log } = parseLog(raw);
    const dfg = buildDfg(log);
    const terminals = getTerminalNodeDurations(dfg, log);
    const terminalActivities = new Set([...terminals.keys()]);
    expect(terminalActivities).toEqual(TERMINAL_ACTIVITIES);
    for (const [activity, stats] of terminals) {
      expect(stats.count, `${activity} count`).toBeGreaterThan(0);
      expect(stats.mean, `${activity} mean duration`).toBeGreaterThan(0);
      expect(stats.median, `${activity} median duration`).toBeGreaterThan(0);
    }
  });

  test("at least 10 distinct org:resource values across human-activity events", () => {
    const { log } = parseLog(raw);
    const resources = new Set<string>();
    for (const event of log.events) {
      if (HUMAN_ACTIVITIES.has(event.activity) && event.resource) {
        resources.add(event.resource);
      }
    }
    expect(resources.size).toBeGreaterThanOrEqual(10);
  });

  test("cost:amount > 0 on every human-activity event; zero on automatic", () => {
    const { log } = parseLog(raw);
    let humanWithPositiveCost = 0;
    for (const event of log.events) {
      const cost = event.attributes["cost:amount"];
      if (HUMAN_ACTIVITIES.has(event.activity)) {
        expect(typeof cost).toBe("number");
        expect(cost as number).toBeGreaterThan(0);
        humanWithPositiveCost += 1;
      } else {
        // Automatic + final activities carry cost: 0 (apply_to_types: [human]).
        expect(cost).toBe(0);
      }
    }
    expect(humanWithPositiveCost).toBeGreaterThan(0);
  });

  test("five case attributes appear on every case (alphabetical-within-scope per LOG_FORMAT_SPEC)", () => {
    const { log } = parseLog(raw);
    const expected = [
      "case:applicant_segment",
      "case:channel",
      "case:loan_amount_band",
      "case:loan_purpose",
      "case:region",
    ];
    expect([...log.schema.caseAttributes].sort()).toEqual(expected);
    for (const c of log.cases.values()) {
      for (const attr of expected) {
        expect(c.attributes[attr], `case ${c.id} attr ${attr}`).toBeDefined();
      }
    }
  });

  test("every case ends in exactly one of the three terminals", () => {
    const { log } = parseLog(raw);
    let funded = 0;
    let declined = 0;
    let withdrawn = 0;
    for (const c of log.cases.values()) {
      const lastEvent = c.events[c.events.length - 1];
      if (!lastEvent) throw new Error(`Case ${c.id} has no events`);
      const last = lastEvent.activity;
      if (last === "Loan Funded") funded += 1;
      else if (last === "Declined") declined += 1;
      else if (last === "Withdrawn") withdrawn += 1;
      else throw new Error(`Case ${c.id} ends in unexpected activity ${last}`);
    }
    expect(funded + declined + withdrawn).toBe(log.cases.size);
    // Funded is the dominant outcome by a wide margin.
    expect(funded).toBeGreaterThan(declined);
    expect(funded).toBeGreaterThan(withdrawn);
  });
});

describe("loan-origination fixture — metadata + columns", () => {
  test("run_metadata.json reads generator 1.2.0 against the loan config", () => {
    expect(loanMeta.generator_version).toBe("1.2.0");
    expect(loanMeta.config_file).toBe("data/input/loan-origination.config.yaml");
    expect(loanMeta.num_cases).toBe(2500);
    expect(loanMeta.start_date).toBe("2025-01-01");
    expect(loanMeta.end_date).toBe("2025-06-30");
    expect(loanMeta.timezone).toBe("America/New_York");
  });

  test("columns block lists 5 mandatory + 5 case_custom + 1 event_custom in canonical order", () => {
    const mandatory = loanMeta.columns.filter((c) => c.scope === "event_mandatory");
    const caseCustom = loanMeta.columns.filter((c) => c.scope === "case_custom");
    const eventCustom = loanMeta.columns.filter((c) => c.scope === "event_custom");

    expect(mandatory.map((c) => c.name)).toEqual([
      "case:concept:name",
      "concept:name",
      "time:timestamp",
      "org:resource",
      "lifecycle:transition",
    ]);

    // Custom attributes alphabetical-within-scope.
    const caseNames = caseCustom.map((c) => c.name);
    expect(caseNames).toEqual([...caseNames].sort());
    expect(caseNames).toEqual([
      "case:applicant_segment",
      "case:channel",
      "case:loan_amount_band",
      "case:loan_purpose",
      "case:region",
    ]);

    expect(eventCustom.map((c) => c.name)).toEqual(["cost:amount"]);
  });

  test("CSV and NDJSON serializations parse to identical case + event counts", () => {
    const fromCsv = parseLog(n5Csv);
    const fromJson = parseLog(n5Json);
    expect(fromCsv.log.cases.size).toBe(fromJson.log.cases.size);
    expect(fromCsv.log.events.length).toBe(fromJson.log.events.length);
  });
});
