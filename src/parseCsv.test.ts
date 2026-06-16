import { describe, expect, test } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import { parseCsv } from "./parseCsv.js";

describe("parseCsv — n5 fixture (LOG_FORMAT_SPEC.md v1.1)", () => {
  test("parses into 5 cases and 36 events with zero warnings", () => {
    const { log, warnings } = parseCsv(n5Csv);
    expect(warnings).toEqual([]);
    expect(log.cases.size).toBe(5);
    expect(log.events.length).toBe(36);
  });

  test("partitions case:* attrs onto Case; no case:* leaks into Event.attributes", () => {
    const { log } = parseCsv(n5Csv);
    const c1 = log.cases.get("case_0001");
    expect(c1?.attributes["case:priority"]).toBe("normal");
    expect(c1?.attributes["case:applicant_type"]).toBe("new_business");

    const c5 = log.cases.get("case_0005");
    expect(c5?.attributes["case:priority"]).toBe("high");
    expect(c5?.attributes["case:applicant_type"]).toBe("existing_business");

    for (const ev of log.events) {
      expect(Object.hasOwn(ev.attributes, "case:priority")).toBe(false);
      expect(Object.hasOwn(ev.attributes, "case:applicant_type")).toBe(false);
    }
  });

  test("coerces cost:amount to number on Event.attributes", () => {
    const { log } = parseCsv(n5Csv);
    const costs = log.events.map((e) => e.attributes["cost:amount"]);
    for (const v of costs) {
      expect(typeof v).toBe("number");
    }
    const submittedCost = log.events.find((e) => e.activity === "submitted")?.attributes[
      "cost:amount"
    ];
    expect(submittedCost).toBe(0);
  });

  test("treats empty org:resource as null on automatic events", () => {
    const { log } = parseCsv(n5Csv);
    const submitted = log.events.find((e) => e.activity === "submitted");
    expect(submitted?.resource).toBeNull();
    const intake = log.events.find((e) => e.activity === "intake_validation");
    expect(typeof intake?.resource).toBe("string");
    expect(intake?.resource).not.toBe("");
  });

  test("records schema with case+event custom attributes in header order", () => {
    const { log } = parseCsv(n5Csv);
    expect(log.schema.caseAttributes).toEqual(["case:applicant_type", "case:priority"]);
    expect(log.schema.eventAttributes).toEqual(["cost:amount"]);
    expect(log.schema.columnTypes["cost:amount"]).toBe("number");
  });

  test("sorts per-case events by timestamp ascending", () => {
    const { log } = parseCsv(n5Csv);
    for (const c of log.cases.values()) {
      for (let i = 1; i < c.events.length; i++) {
        const prev = c.events[i - 1]?.timestamp.getTime() ?? 0;
        const curr = c.events[i]?.timestamp.getTime() ?? 0;
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    }
  });

  test("parses microsecond-precision timestamps without NaN", () => {
    const { log } = parseCsv(n5Csv);
    for (const ev of log.events) {
      expect(Number.isNaN(ev.timestamp.getTime())).toBe(false);
    }
  });
});

describe("parseCsv — error policy", () => {
  const HEADER = "case:concept:name,concept:name,time:timestamp,org:resource,lifecycle:transition";

  test("throws on missing mandatory header column", () => {
    const body = [
      "case:concept:name,concept:name,org:resource,lifecycle:transition",
      "c1,a,,complete",
    ].join("\n");
    expect(() => parseCsv(body)).toThrow(/time:timestamp/);
  });

  test("throws naming every missing mandatory column", () => {
    expect(() => parseCsv("foo,bar\n1,2")).toThrow(
      /case:concept:name.*concept:name.*time:timestamp.*org:resource.*lifecycle:transition/,
    );
  });

  test("warns and skips malformed rows while keeping good ones (scenario 2)", () => {
    const csv = [
      HEADER,
      "c1,a,2024-01-01T00:00:00Z,,complete",
      "c1,b,2024-01-01T01:00:00Z,,complete",
      "c2,a,not a date,,complete",
      "c2,b,2024-01-02T01:00:00Z,,complete",
      "c3,,2024-01-03T00:00:00Z,,complete",
      "c4,a,2024-01-04T00:00:00Z,,complete",
    ].join("\n");

    const { log, warnings } = parseCsv(csv);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]?.row).toBe(4);
    expect(warnings[0]?.reason).toMatch(/time:timestamp/);
    expect(warnings[1]?.row).toBe(6);
    expect(warnings[1]?.reason).toMatch(/concept:name/);
    expect(log.events.length).toBe(4);
    expect(log.cases.size).toBe(3);
    expect(log.cases.has("c3")).toBe(false);
  });

  test("warns and skips duplicate (caseId, timestamp, activity) rows", () => {
    const csv = [
      HEADER,
      "c1,a,2024-01-01T00:00:00Z,,complete",
      "c1,a,2024-01-01T00:00:00Z,,complete",
    ].join("\n");
    const { log, warnings } = parseCsv(csv);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.reason).toMatch(/duplicate/);
    expect(log.events.length).toBe(1);
  });

  test("infers boolean column type from true/false values", () => {
    const csv = [
      `${HEADER},case:expedited`,
      "c1,a,2024-01-01T00:00:00Z,,complete,true",
      "c2,a,2024-01-02T00:00:00Z,,complete,false",
    ].join("\n");
    const { log } = parseCsv(csv);
    expect(log.schema.columnTypes["case:expedited"]).toBe("boolean");
    expect(log.cases.get("c1")?.attributes["case:expedited"]).toBe(true);
    expect(log.cases.get("c2")?.attributes["case:expedited"]).toBe(false);
  });

  test("empty custom attribute cell becomes null regardless of inferred type", () => {
    const csv = [
      `${HEADER},cost:amount`,
      "c1,a,2024-01-01T00:00:00Z,,complete,42.5",
      "c1,b,2024-01-01T01:00:00Z,,complete,",
    ].join("\n");
    const { log } = parseCsv(csv);
    const events = [...(log.cases.get("c1")?.events ?? [])];
    expect(events[0]?.attributes["cost:amount"]).toBe(42.5);
    expect(events[1]?.attributes["cost:amount"]).toBeNull();
  });

  test("infers string type for a custom column with no non-empty values", () => {
    // Every cell of the custom column is empty, so anyNonEmpty stays false:
    // inferColumnType must fall back to "string" (not the all-numeric "number"
    // default the accumulators would otherwise still be holding).
    const csv = [
      `${HEADER},case:note`,
      "c1,a,2024-01-01T00:00:00Z,,complete,",
      "c2,a,2024-01-02T00:00:00Z,,complete,",
    ].join("\n");
    const { log } = parseCsv(csv);
    expect(log.schema.columnTypes["case:note"]).toBe("string");
    expect(log.cases.get("c1")?.attributes["case:note"]).toBeNull();
    expect(log.cases.get("c2")?.attributes["case:note"]).toBeNull();
  });
});
