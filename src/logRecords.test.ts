import { describe, expect, test } from "vitest";
import {
  buildLogFromRecords,
  type CellReader,
  type ColumnType,
  MANDATORY_COLUMNS,
  type SourceRecord,
} from "./logRecords.js";

// Direct unit tests of the shared record-processing core. parseCsv/parseNdjson
// both funnel into buildLogFromRecords; driving it with hand-built records lets
// us hit the mandatory-column edge paths precisely — in particular the
// lifecycle:transition guard and asText's null-vs-undefined arms, which a
// field omitted by one NDJSON object (but present on another) produces in the
// real union-of-keys flow.

// A native cell reader matching parseNdjson's: null/absent → null, else the
// raw value. Custom attributes are irrelevant to the guards under test, so the
// columns here are the five mandatory ones only.
const readCell: CellReader = (raw, col) => {
  const v = raw[col];
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v;
  return String(v);
};
const columnTypes: Record<string, ColumnType> = {};
const columns = [...MANDATORY_COLUMNS];

function build(records: SourceRecord[]) {
  return buildLogFromRecords(records, columns, columnTypes, readCell, "test");
}

// A fully-valid record the bad rows are paired with, so we can also assert the
// good row survives alongside the skipped one.
const validRaw = {
  "case:concept:name": "c1",
  "concept:name": "submitted",
  "time:timestamp": "2025-01-01T00:00:00",
  "org:resource": "alice",
  "lifecycle:transition": "complete",
};

describe("buildLogFromRecords — missing lifecycle:transition guard", () => {
  test("a record whose lifecycle:transition key is absent warns + is skipped (undefined arm)", () => {
    // case/activity/timestamp all present and valid; lifecycle key omitted.
    // asText sees `undefined`, returns undefined, so the lifecycle guard fires.
    const noLifecycle: SourceRecord = {
      raw: {
        "case:concept:name": "c2",
        "concept:name": "review",
        "time:timestamp": "2025-01-02T00:00:00",
        "org:resource": "bob",
      },
      row: 7,
    };
    const { log, warnings } = build([{ raw: validRaw, row: 2 }, noLifecycle]);

    expect(log.events.length).toBe(1); // only the valid row survived
    expect(log.cases.has("c2")).toBe(false); // the skipped row created no case
    expect(warnings).toEqual([{ row: 7, reason: "missing lifecycle:transition" }]);
  });

  test("a record whose lifecycle:transition is JSON null warns + is skipped (null arm)", () => {
    // The key is present but null — exercises asText's `v === null` branch,
    // distinct from the absent-key (`v === undefined`) branch above.
    const nullLifecycle: SourceRecord = {
      raw: {
        "case:concept:name": "c3",
        "concept:name": "approve",
        "time:timestamp": "2025-01-03T00:00:00",
        "org:resource": "carol",
        "lifecycle:transition": null,
      },
      row: 9,
    };
    const { log, warnings } = build([{ raw: validRaw, row: 2 }, nullLifecycle]);

    expect(log.events.length).toBe(1);
    expect(log.cases.has("c3")).toBe(false);
    expect(warnings).toEqual([{ row: 9, reason: "missing lifecycle:transition" }]);
  });

  test("an empty-string lifecycle:transition is NOT missing — it is kept verbatim", () => {
    // The guard is `=== undefined` only (empty string is a legal lifecycle),
    // so an explicit "" passes through and lands on the event unchanged.
    const emptyLifecycle: SourceRecord = {
      raw: {
        "case:concept:name": "c4",
        "concept:name": "submitted",
        "time:timestamp": "2025-01-04T00:00:00",
        "org:resource": "dan",
        "lifecycle:transition": "",
      },
      row: 11,
    };
    const { log, warnings } = build([emptyLifecycle]);

    expect(warnings).toEqual([]);
    expect(log.events.length).toBe(1);
    expect(log.events[0]?.lifecycle).toBe("");
  });
});
