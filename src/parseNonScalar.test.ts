import { describe, expect, test } from "vitest";
import { parseNdjson } from "./parseNdjson.js";

// NDJSON values arrive natively typed. A non-scalar (object / array) in a
// MANDATORY column would `String(v)` into a corrupt `"[object Object]"` /
// comma-joined graph node with no warning — silent corruption. It must instead
// hit the warn+skip path (a number/boolean still coerces — those are scalar).
const VALID =
  '{"case:concept:name":"c1","concept:name":"a","time:timestamp":"2025-01-01T00:00:00","lifecycle:transition":"complete","org:resource":null}';

describe("parseNdjson rejects non-scalar mandatory values (warn + skip, not corrupt)", () => {
  test("an object-valued concept:name is skipped with a warning, not turned into [object Object]", () => {
    const objActivity =
      '{"case:concept:name":"c1","concept:name":{"x":1},"time:timestamp":"2025-01-01T01:00:00","lifecycle:transition":"complete","org:resource":null}';
    const { log, warnings } = parseNdjson(`${VALID}\n${objActivity}`);

    expect(log.events.length).toBe(1); // only the valid row
    expect(warnings.length).toBe(1); // the object row warned
    for (const ev of log.events) {
      expect(ev.activity).not.toBe("[object Object]");
    }
  });

  test("an array-valued case:concept:name is skipped with a warning", () => {
    const arrCase =
      '{"case:concept:name":["c","1"],"concept:name":"a","time:timestamp":"2025-01-01T02:00:00","lifecycle:transition":"complete","org:resource":null}';
    const { log, warnings } = parseNdjson(`${VALID}\n${arrCase}`);

    expect(log.events.length).toBe(1);
    expect(warnings.length).toBe(1);
  });

  test("a numeric concept:name still coerces (scalars are fine)", () => {
    const numActivity =
      '{"case:concept:name":"c1","concept:name":42,"time:timestamp":"2025-01-01T03:00:00","lifecycle:transition":"complete","org:resource":null}';
    const { log, warnings } = parseNdjson(`${VALID}\n${numActivity}`);

    expect(warnings.length).toBe(0);
    expect(log.events.length).toBe(2);
    expect(log.events.some((e) => e.activity === "42")).toBe(true);
  });
});
