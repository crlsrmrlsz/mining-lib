import { describe, expect, test } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import n5Json from "../data/input/runs/n5-fixture/events.json?raw";
import n1000Csv from "../data/input/runs/n1000-realistic/events.csv?raw";
import n1000Json from "../data/input/runs/n1000-realistic/events.json?raw";
import { parseCsv } from "./parseCsv.js";
import { detectLogFormat, parseLog, parseNdjson } from "./parseNdjson.js";

describe("detectLogFormat", () => {
  test("a leading '{' is ndjson", () => {
    expect(detectLogFormat('{"case:concept:name":"c1"}')).toBe("ndjson");
  });

  test("the real n5 NDJSON fixture is ndjson", () => {
    expect(detectLogFormat(n5Json)).toBe("ndjson");
  });

  test("the n5 CSV header (leading 'case:concept:name') is csv", () => {
    expect(detectLogFormat(n5Csv)).toBe("csv");
  });

  test("leading blank lines and spaces before '{' are skipped", () => {
    expect(detectLogFormat('\n\n  \t{"a":1}')).toBe("ndjson");
  });

  test("a leading '[' (JSON array) is csv, not ndjson", () => {
    expect(detectLogFormat('[{"a":1}]')).toBe("csv");
  });

  test("an empty string is csv", () => {
    expect(detectLogFormat("")).toBe("csv");
  });

  test("a whitespace-only string is csv", () => {
    expect(detectLogFormat("   \n  ")).toBe("csv");
  });
});

describe("parseNdjson — n5 fixture (LOG_FORMAT_SPEC.md v1.1)", () => {
  test("parses into 5 cases and 36 events with zero warnings", () => {
    const { log, warnings } = parseNdjson(n5Json);
    expect(warnings).toEqual([]);
    expect(log.cases.size).toBe(5);
    expect(log.events.length).toBe(36);
  });

  test("partitions case:* attrs onto Case; no case:* leaks into Event.attributes", () => {
    const { log } = parseNdjson(n5Json);
    const c1 = log.cases.get("case_0001");
    expect(c1?.attributes["case:priority"]).toBe("normal");
    expect(c1?.attributes["case:applicant_type"]).toBe("new_business");

    for (const ev of log.events) {
      expect(Object.hasOwn(ev.attributes, "case:priority")).toBe(false);
      expect(Object.hasOwn(ev.attributes, "case:applicant_type")).toBe(false);
    }
  });

  test("keeps cost:amount as a number (native JSON), submitted cost is 0", () => {
    const { log } = parseNdjson(n5Json);
    for (const ev of log.events) {
      expect(typeof ev.attributes["cost:amount"]).toBe("number");
    }
    const submitted = log.events.find((e) => e.activity === "submitted");
    expect(submitted?.attributes["cost:amount"]).toBe(0);
  });

  test("treats null org:resource as null on automatic events", () => {
    const { log } = parseNdjson(n5Json);
    const submitted = log.events.find((e) => e.activity === "submitted");
    expect(submitted?.resource).toBeNull();
    const intake = log.events.find((e) => e.activity === "intake_validation");
    expect(typeof intake?.resource).toBe("string");
    expect(intake?.resource).not.toBe("");
  });

  test("records schema with custom attrs alphabetical + columnTypes", () => {
    const { log } = parseNdjson(n5Json);
    expect(log.schema.caseAttributes).toEqual(["case:applicant_type", "case:priority"]);
    expect(log.schema.eventAttributes).toEqual(["cost:amount"]);
    expect(log.schema.columnTypes["cost:amount"]).toBe("number");
  });

  test("sorts per-case events by timestamp ascending", () => {
    const { log } = parseNdjson(n5Json);
    for (const c of log.cases.values()) {
      for (let i = 1; i < c.events.length; i++) {
        const prev = c.events[i - 1]?.timestamp.getTime() ?? 0;
        const curr = c.events[i]?.timestamp.getTime() ?? 0;
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    }
  });

  test("parses timestamps without NaN", () => {
    const { log } = parseNdjson(n5Json);
    for (const ev of log.events) {
      expect(Number.isNaN(ev.timestamp.getTime())).toBe(false);
    }
  });
});

describe("parseNdjson — n1000 fixture (spot-check)", () => {
  test("1000 cases / 7347 events / zero warnings", () => {
    const { log, warnings } = parseNdjson(n1000Json);
    expect(warnings).toEqual([]);
    expect(log.cases.size).toBe(1000);
    expect(log.events.length).toBe(7347);
  });

  test("every case starts at submitted; terminal set is small and excludes submitted", () => {
    const { log } = parseNdjson(n1000Json);
    const lastActivities = new Set<string>();
    for (const c of log.cases.values()) {
      expect(c.events[0]?.activity).toBe("submitted");
      lastActivities.add(c.events[c.events.length - 1]?.activity ?? "");
    }
    expect(lastActivities.has("submitted")).toBe(false);
    expect(lastActivities.size).toBeLessThanOrEqual(5);
  });

  test("event count equals the CSV parse of the same fixture (counts are precision-independent)", () => {
    expect(parseNdjson(n1000Json).log.events.length).toBe(parseCsv(n1000Csv).log.events.length);
  });
});

describe("parseNdjson — resilient parsing", () => {
  const good1 =
    '{"case:concept:name":"c1","concept:name":"a","time:timestamp":"2024-01-01T00:00:00Z","org:resource":null,"lifecycle:transition":"complete"}';
  const good2 =
    '{"case:concept:name":"c1","concept:name":"b","time:timestamp":"2024-01-01T01:00:00Z","org:resource":null,"lifecycle:transition":"complete"}';

  test("skips a blank line silently and warns once on a malformed line", () => {
    const malformed = '{"case:concept:name":"c2","concept:name": ';
    const text = [good1, "", malformed, good2].join("\n");
    const { log, warnings } = parseNdjson(text);
    expect(log.events.length).toBe(2);
    expect(log.cases.size).toBe(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.row).toBe(3);
    expect(warnings[0]?.reason).toMatch(/malformed JSON/);
  });

  test("tolerates a trailing newline / CRLF line endings", () => {
    const text = `${good1}\r\n${good2}\r\n`;
    const { log, warnings } = parseNdjson(text);
    expect(warnings).toEqual([]);
    expect(log.events.length).toBe(2);
  });

  test("warns and skips a line that is valid JSON but not an object (a bare scalar)", () => {
    // `42` parses cleanly via JSON.parse but is not a JSON object, so it takes
    // the `typeof parsed !== "object"` arm: warn with its 1-based line, then skip.
    const text = [good1, "42", good2].join("\n");
    const { log, warnings } = parseNdjson(text);
    expect(log.events.length).toBe(2);
    expect(log.cases.size).toBe(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.row).toBe(2);
    expect(warnings[0]?.reason).toBe("expected a JSON object per line");
  });

  test("warns and skips a line that is itself a JSON array (Array.isArray arm)", () => {
    // The whole text starts with `{`, so the top-level-array guard never fires;
    // an inner line holding an array still must be rejected per-line.
    const text = [good1, "[1,2,3]", good2].join("\n");
    const { log, warnings } = parseNdjson(text);
    expect(log.events.length).toBe(2);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.row).toBe(2);
    expect(warnings[0]?.reason).toBe("expected a JSON object per line");
  });
});

describe("parseNdjson — error policy", () => {
  test("throws naming a missing mandatory field", () => {
    const noTs =
      '{"case:concept:name":"c1","concept:name":"a","org:resource":null,"lifecycle:transition":"complete"}';
    expect(() => parseNdjson(noTs)).toThrow(/time:timestamp/);
  });

  test("rejects a top-level JSON array with a clear error", () => {
    const arr =
      '[{"case:concept:name":"c1","concept:name":"a","time:timestamp":"2024-01-01T00:00:00Z","org:resource":null,"lifecycle:transition":"complete"}]';
    expect(() => parseNdjson(arr)).toThrow(/array/i);
  });
});

describe("parseNdjson — native JSON types", () => {
  test("JSON null and empty-string org:resource both become null", () => {
    const nullRes =
      '{"case:concept:name":"c1","concept:name":"a","time:timestamp":"2024-01-01T00:00:00Z","org:resource":null,"lifecycle:transition":"complete"}';
    const emptyRes =
      '{"case:concept:name":"c1","concept:name":"b","time:timestamp":"2024-01-01T01:00:00Z","org:resource":"","lifecycle:transition":"complete"}';
    const { log } = parseNdjson([nullRes, emptyRes].join("\n"));
    const evs = log.cases.get("c1")?.events ?? [];
    expect(evs[0]?.resource).toBeNull();
    expect(evs[1]?.resource).toBeNull();
  });

  test("infers boolean column type from native true/false", () => {
    const r1 =
      '{"case:concept:name":"c1","concept:name":"a","time:timestamp":"2024-01-01T00:00:00Z","org:resource":null,"lifecycle:transition":"complete","case:expedited":true}';
    const r2 =
      '{"case:concept:name":"c2","concept:name":"a","time:timestamp":"2024-01-02T00:00:00Z","org:resource":null,"lifecycle:transition":"complete","case:expedited":false}';
    const { log } = parseNdjson([r1, r2].join("\n"));
    expect(log.schema.columnTypes["case:expedited"]).toBe("boolean");
    expect(log.cases.get("c1")?.attributes["case:expedited"]).toBe(true);
    expect(log.cases.get("c2")?.attributes["case:expedited"]).toBe(false);
  });

  test("an all-null custom column defaults to string type with null values", () => {
    const r1 =
      '{"case:concept:name":"c1","concept:name":"a","time:timestamp":"2024-01-01T00:00:00Z","org:resource":null,"lifecycle:transition":"complete","cost:amount":null}';
    const { log } = parseNdjson(r1);
    expect(log.schema.columnTypes["cost:amount"]).toBe("string");
    expect(log.cases.get("c1")?.events[0]?.attributes["cost:amount"]).toBeNull();
  });

  test("a string-typed column stringifies a non-string native value (mixed column)", () => {
    // The custom column `code` holds a string in r1 and a number in r2, so it
    // infers as "string". Reading r2's numeric value then takes coerceNative's
    // final `String(v)` arm: 42 must surface as the string "42", not the number.
    const r1 =
      '{"case:concept:name":"c1","concept:name":"a","time:timestamp":"2024-01-01T00:00:00Z","org:resource":null,"lifecycle:transition":"complete","code":"abc"}';
    const r2 =
      '{"case:concept:name":"c2","concept:name":"a","time:timestamp":"2024-01-02T00:00:00Z","org:resource":null,"lifecycle:transition":"complete","code":42}';
    const { log } = parseNdjson([r1, r2].join("\n"));
    expect(log.schema.columnTypes.code).toBe("string");
    const v1 = log.cases.get("c1")?.events[0]?.attributes.code;
    const v2 = log.cases.get("c2")?.events[0]?.attributes.code;
    expect(v1).toBe("abc");
    expect(v2).toBe("42");
    expect(typeof v2).toBe("string");
  });
});

describe("parseNdjson — cross-format parity", () => {
  // S3: a CSV and its EXACT NDJSON twin — same columns, same whole-second
  // timestamps, same values (org:resource empty in CSV / null in JSON). With
  // byte-identical logical input the two parsers must agree to the bit, so
  // this is a full deepEqual with zero confounds (Decision D7).
  const twinCsv = [
    "case:concept:name,concept:name,time:timestamp,org:resource,lifecycle:transition,case:region,cost:amount",
    "c1,submitted,2024-03-01T09:00:00Z,,complete,north,0",
    "c1,review,2024-03-01T10:30:00Z,alice,complete,north,12.5",
    "c2,submitted,2024-03-02T09:00:00Z,,complete,south,0",
  ].join("\n");
  const twinNdjson = [
    '{"case:concept:name":"c1","concept:name":"submitted","time:timestamp":"2024-03-01T09:00:00Z","org:resource":null,"lifecycle:transition":"complete","case:region":"north","cost:amount":0}',
    '{"case:concept:name":"c1","concept:name":"review","time:timestamp":"2024-03-01T10:30:00Z","org:resource":"alice","lifecycle:transition":"complete","case:region":"north","cost:amount":12.5}',
    '{"case:concept:name":"c2","concept:name":"submitted","time:timestamp":"2024-03-02T09:00:00Z","org:resource":null,"lifecycle:transition":"complete","case:region":"south","cost:amount":0}',
  ].join("\n");

  test("S3: exact deepEqual on byte-identical controlled input", () => {
    expect(parseNdjson(twinNdjson)).toEqual(parseCsv(twinCsv));
  });

  // S4: the n5 fixtures were regenerated from ProcessLog v1.1.0 (Phase 34),
  // whose F3 fix makes the JSON exporter preserve sub-second precision like
  // the CSV exporter. CSV and JSON therefore encode the same instants, so we
  // assert exact instant equality (via getTime()) alongside the structural
  // checks — not the old precision-tolerant comparison.
  test("S4: n5 json matches n5 csv exactly, including timestamps", () => {
    const csv = parseCsv(n5Csv).log;
    const json = parseNdjson(n5Json).log;

    expect(json.schema).toEqual(csv.schema);
    expect([...json.cases.keys()].sort()).toEqual([...csv.cases.keys()].sort());

    for (const [id, csvCase] of csv.cases) {
      const jsonCase = json.cases.get(id);
      expect(jsonCase?.attributes).toEqual(csvCase.attributes);
      expect(jsonCase?.events.map((e) => e.activity)).toEqual(
        csvCase.events.map((e) => e.activity),
      );
      expect(jsonCase?.events.map((e) => e.resource)).toEqual(
        csvCase.events.map((e) => e.resource),
      );
      expect(jsonCase?.events.map((e) => e.attributes["cost:amount"])).toEqual(
        csvCase.events.map((e) => e.attributes["cost:amount"]),
      );
      expect(jsonCase?.events.map((e) => e.timestamp.getTime())).toEqual(
        csvCase.events.map((e) => e.timestamp.getTime()),
      );
    }
  });
});

describe("parseLog — auto-detecting dispatcher", () => {
  test("S6: routes CSV text to parseCsv", () => {
    expect(parseLog(n5Csv)).toEqual(parseCsv(n5Csv));
  });

  test("S6: routes NDJSON text to parseNdjson", () => {
    expect(parseLog(n5Json)).toEqual(parseNdjson(n5Json));
  });
});
