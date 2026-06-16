import { describe, expect, test } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import { buildFilteredLog, getVariants, variantSignature } from "./getVariants.js";
import { parseCsv } from "./parseCsv.js";
import type { Case, Event, EventLog } from "./types.js";

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

const DIRECT_APPROVAL = [
  "submitted",
  "intake_validation",
  "assigned_to_reviewer",
  "review_in_progress",
  "health_inspection",
  "approved",
];
const REJECTED_AT_FINAL = [
  "submitted",
  "intake_validation",
  "assigned_to_reviewer",
  "review_in_progress",
  "health_inspection",
  "rejected",
];
const EARLY_REJECTION = ["submitted", "intake_validation", "rejected"];
const REQUEST_INFO_3_LOOPS = [
  "submitted",
  "intake_validation",
  "assigned_to_reviewer",
  "review_in_progress",
  "request_additional_info",
  "applicant_provided_info",
  "review_in_progress",
  "request_additional_info",
  "applicant_provided_info",
  "review_in_progress",
  "request_additional_info",
  "applicant_provided_info",
  "review_in_progress",
  "health_inspection",
  "approved",
];

describe("getVariants — edge cases", () => {
  test("empty log returns []", () => {
    const log = makeLog([]);
    const variants = getVariants(log);
    expect(variants).toEqual([]);
  });

  test("single-event case yields a length-1 sequence variant", () => {
    const log = makeLog([{ id: "c1", activities: ["only"] }]);
    const variants = getVariants(log);
    expect(variants).toHaveLength(1);
    expect(variants[0]?.sequence).toEqual(["only"]);
    expect(variants[0]?.count).toBe(1);
    expect(variants[0]?.percentage).toBe(100);
  });

  test("returns a fresh array (not a reused module-level reference)", () => {
    const log = makeLog([]);
    const a = getVariants(log);
    const b = getVariants(log);
    expect(a).not.toBe(b);
  });
});

describe("getVariants — sort order", () => {
  test("sorts by count desc", () => {
    const log = makeLog([
      { id: "c1", activities: ["a", "b"] },
      { id: "c2", activities: ["a", "c"] },
      { id: "c3", activities: ["a", "c"] },
    ]);
    const variants = getVariants(log);
    expect(variants).toHaveLength(2);
    expect(variants[0]?.sequence).toEqual(["a", "c"]);
    expect(variants[0]?.count).toBe(2);
    expect(variants[1]?.sequence).toEqual(["a", "b"]);
    expect(variants[1]?.count).toBe(1);
  });

  test("ties broken by lexicographic comparison on sequence (ascending)", () => {
    const log = makeLog([
      { id: "c1", activities: ["a", "c"] },
      { id: "c2", activities: ["a", "b"] },
      { id: "c3", activities: ["a", "a"] },
    ]);
    const variants = getVariants(log);
    expect(variants.map((v) => v.sequence)).toEqual([
      ["a", "a"],
      ["a", "b"],
      ["a", "c"],
    ]);
  });

  test("lex tiebreak handles different-length sequences (shorter common-prefix wins)", () => {
    const log = makeLog([
      { id: "c1", activities: ["a", "b", "c"] },
      { id: "c2", activities: ["a", "b"] },
    ]);
    const variants = getVariants(log);
    expect(variants.map((v) => v.sequence)).toEqual([
      ["a", "b"],
      ["a", "b", "c"],
    ]);
  });

  test("count desc dominates lex tiebreak", () => {
    const log = makeLog([
      { id: "c1", activities: ["z"] },
      { id: "c2", activities: ["z"] },
      { id: "c3", activities: ["a"] },
    ]);
    const variants = getVariants(log);
    expect(variants[0]?.sequence).toEqual(["z"]);
    expect(variants[0]?.count).toBe(2);
    expect(variants[1]?.sequence).toEqual(["a"]);
    expect(variants[1]?.count).toBe(1);
  });
});

describe("getVariants — n5 fixture", () => {
  const { log } = parseCsv(n5Csv);

  test("returns exactly 4 variants", () => {
    const variants = getVariants(log);
    expect(variants).toHaveLength(4);
  });

  test("top variant is Direct Approval with count 2 and percentage 40", () => {
    const variants = getVariants(log);
    expect(variants[0]?.sequence).toEqual(DIRECT_APPROVAL);
    expect(variants[0]?.count).toBe(2);
    expect(variants[0]?.percentage).toBe(40);
  });

  test("the three count=1 variants follow lex tiebreak: rejected-at-final, request-info, early-rejection", () => {
    const variants = getVariants(log);
    expect(variants[1]?.sequence).toEqual(REJECTED_AT_FINAL);
    expect(variants[1]?.count).toBe(1);
    expect(variants[1]?.percentage).toBe(20);
    expect(variants[2]?.sequence).toEqual(REQUEST_INFO_3_LOOPS);
    expect(variants[2]?.count).toBe(1);
    expect(variants[2]?.percentage).toBe(20);
    expect(variants[3]?.sequence).toEqual(EARLY_REJECTION);
    expect(variants[3]?.count).toBe(1);
    expect(variants[3]?.percentage).toBe(20);
  });

  test("sum of count is 5 and sum of percentage is 100", () => {
    const variants = getVariants(log);
    const totalCount = variants.reduce((s, v) => s + v.count, 0);
    const totalPercentage = variants.reduce((s, v) => s + v.percentage, 0);
    expect(totalCount).toBe(5);
    expect(totalPercentage).toBe(100);
  });
});

describe("variantSignature", () => {
  test("returns JSON.stringify of the sequence", () => {
    expect(variantSignature(["a", "b", "c"])).toBe(JSON.stringify(["a", "b", "c"]));
  });

  test("equal sequences produce strictly-equal signatures", () => {
    const a = variantSignature(["submitted", "approved"]);
    const b = variantSignature(["submitted", "approved"]);
    expect(a).toBe(b);
  });

  test("different sequences produce different signatures", () => {
    expect(variantSignature(["a", "b"])).not.toBe(variantSignature(["a", "c"]));
    expect(variantSignature(["a", "b"])).not.toBe(variantSignature(["b", "a"]));
    expect(variantSignature(["a"])).not.toBe(variantSignature(["a", "a"]));
  });

  test("mutating the input array does not change a previously-computed signature", () => {
    const seq = ["a", "b"];
    const sig = variantSignature(seq);
    seq.push("c");
    expect(sig).toBe(JSON.stringify(["a", "b"]));
  });

  test("matches the signatures used as keys by getVariants", () => {
    const log = makeLog([
      { id: "c1", activities: ["a", "b"] },
      { id: "c2", activities: ["a", "b"] },
      { id: "c3", activities: ["a", "c"] },
    ]);
    const variants = getVariants(log);
    const signaturesFromVariants = variants.map((v) => variantSignature(v.sequence));
    expect(new Set(signaturesFromVariants).size).toBe(2);
    expect(signaturesFromVariants).toContain(JSON.stringify(["a", "b"]));
    expect(signaturesFromVariants).toContain(JSON.stringify(["a", "c"]));
  });
});

describe("buildFilteredLog", () => {
  test("null returns the input log by reference (no allocation)", () => {
    const log = makeLog([{ id: "c1", activities: ["a", "b"] }]);
    expect(buildFilteredLog(log, null)).toBe(log);
  });

  test("[] returns a new empty log (size 0, events 0)", () => {
    const log = makeLog([
      { id: "c1", activities: ["a", "b"] },
      { id: "c2", activities: ["c", "d"] },
    ]);
    const filtered = buildFilteredLog(log, []);
    expect(filtered).not.toBe(log);
    expect(filtered.cases.size).toBe(0);
    expect(filtered.events).toEqual([]);
    expect(filtered.schema).toBe(log.schema);
  });

  test("filters to a single signature, preserves case order and event chronology", () => {
    const log = makeLog([
      { id: "c1", activities: ["a", "b"] },
      { id: "c2", activities: ["x", "y"] },
      { id: "c3", activities: ["a", "b"] },
    ]);
    const sig = variantSignature(["a", "b"]);
    const filtered = buildFilteredLog(log, [sig]);
    expect(Array.from(filtered.cases.keys())).toEqual(["c1", "c3"]);
    expect(filtered.events.map((e) => e.caseId)).toEqual(["c1", "c1", "c3", "c3"]);
    expect(filtered.events.map((e) => e.activity)).toEqual(["a", "b", "a", "b"]);
  });

  test("filters to two signatures (union)", () => {
    const log = makeLog([
      { id: "c1", activities: ["a"] },
      { id: "c2", activities: ["b"] },
      { id: "c3", activities: ["c"] },
    ]);
    const filtered = buildFilteredLog(log, [variantSignature(["a"]), variantSignature(["c"])]);
    expect(Array.from(filtered.cases.keys())).toEqual(["c1", "c3"]);
  });

  test("unknown signature filters everything out (no match)", () => {
    const log = makeLog([{ id: "c1", activities: ["a", "b"] }]);
    const filtered = buildFilteredLog(log, [variantSignature(["zzz"])]);
    expect(filtered.cases.size).toBe(0);
    expect(filtered.events).toEqual([]);
  });

  test("output is round-trippable through getVariants", () => {
    const log = makeLog([
      { id: "c1", activities: ["a", "b"] },
      { id: "c2", activities: ["a", "b"] },
      { id: "c3", activities: ["c", "d"] },
    ]);
    const filtered = buildFilteredLog(log, [variantSignature(["a", "b"])]);
    const variants = getVariants(filtered);
    expect(variants).toHaveLength(1);
    expect(variants[0]?.sequence).toEqual(["a", "b"]);
    expect(variants[0]?.count).toBe(2);
    expect(variants[0]?.percentage).toBe(100);
  });

  test("n5 fixture: filtering by Direct Approval signature returns 2 cases, 12 events", () => {
    const { log } = parseCsv(n5Csv);
    const sig = variantSignature(DIRECT_APPROVAL);
    const filtered = buildFilteredLog(log, [sig]);
    expect(filtered.cases.size).toBe(2);
    expect(Array.from(filtered.cases.keys()).sort()).toEqual(["case_0002", "case_0004"]);
    expect(filtered.events).toHaveLength(12);
    for (const ev of filtered.events) {
      expect(["case_0002", "case_0004"]).toContain(ev.caseId);
    }
  });

  test("n5 fixture: filtering by early-rejection + Direct Approval returns 3 cases", () => {
    const { log } = parseCsv(n5Csv);
    const filtered = buildFilteredLog(log, [
      variantSignature(EARLY_REJECTION),
      variantSignature(DIRECT_APPROVAL),
    ]);
    expect(filtered.cases.size).toBe(3);
    expect(Array.from(filtered.cases.keys()).sort()).toEqual([
      "case_0001",
      "case_0002",
      "case_0004",
    ]);
  });

  test("preserves EventLog shape (Map for cases, array for events, schema passed through)", () => {
    const log = makeLog([{ id: "c1", activities: ["a"] }]);
    const filtered = buildFilteredLog(log, [variantSignature(["a"])]);
    expect(filtered.cases).toBeInstanceOf(Map);
    expect(Array.isArray(filtered.events)).toBe(true);
    expect(filtered.schema).toBe(log.schema);
  });
});
