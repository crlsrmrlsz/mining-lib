/**
 * NDJSON input support (Phase 31). The NDJSON parser, the content-based
 * format detector, and (TG4) the auto-detecting `parseLog` dispatcher.
 * The NDJSON layout is fixed by LOG_FORMAT_SPEC §"JSON Format Details" +
 * Known Limitation #2: one JSON object per line (not a JSON array),
 * keys matching the CSV column names. Everything that builds an
 * `EventLog` is delegated to the shared core in {@link ./logRecords.js},
 * so CSV and NDJSON stay output-identical for the same data.
 */

import {
  buildLogFromRecords,
  type CellReader,
  type ColumnType,
  MANDATORY_COLUMNS,
  type RawRecord,
  type SourceRecord,
  stripBom,
} from "./logRecords.js";
import { parseCsv } from "./parseCsv.js";
import type { AttributeValue, ParseResult, ParseWarning } from "./types.js";

const MANDATORY_SET = new Set<string>(MANDATORY_COLUMNS);

/**
 * Detect a log's format from its content (Decision D1 — the API
 * boundary is a raw string, so there is no file extension or MIME to
 * read). Returns `"ndjson"` iff the first non-whitespace character is
 * `{`; otherwise `"csv"`. Unambiguous for this contract: a
 * spec-compliant CSV begins with the header token `case:concept:name`,
 * an NDJSON line begins with `{`. A leading `[` (a JSON array) is `"csv"`
 * so a top-level array is never routed into the NDJSON parser.
 */
export function detectLogFormat(text: string): "csv" | "ndjson" {
  return text.trimStart()[0] === "{" ? "ndjson" : "csv";
}

/**
 * Parse a LOG_FORMAT_SPEC v1.1 NDJSON log (one JSON object per line)
 * into an `EventLog`. Resilient like `parseCsv` (Decision D4): blank
 * lines are skipped silently, a line that fails `JSON.parse` (or isn't a
 * JSON object) becomes a warning carrying its 1-based line number and is
 * skipped, and only a missing mandatory column throws. A top-level JSON
 * array is rejected outright (the spec guarantees NDJSON, not an array).
 *
 * Column discovery is the union of keys across the valid records, with
 * custom attributes sorted alphabetically (Decision D5) so the schema
 * matches `parseCsv`'s on spec-compliant data. Values arrive natively
 * typed from `JSON.parse`, so column types come from `typeof` rather
 * than string inference (Decision D6).
 */
export function parseNdjson(text: string): ParseResult {
  const src = stripBom(text);
  if (src.trimStart().startsWith("[")) {
    throw new Error("parseNdjson: expected NDJSON (one object per line), got a JSON array");
  }

  const records: SourceRecord[] = [];
  const lineWarnings: ParseWarning[] = [];
  const keys = new Set<string>();

  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? "";
    if (line === "") continue; // blank / whitespace-only line — skip silently
    const row = i + 1;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      lineWarnings.push({ row, reason: "malformed JSON line" });
      continue;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      lineWarnings.push({ row, reason: "expected a JSON object per line" });
      continue;
    }

    const raw = parsed as RawRecord;
    for (const k of Object.keys(raw)) keys.add(k);
    records.push({ raw, row });
  }

  const customColumns = [...keys].filter((k) => !MANDATORY_SET.has(k)).sort();
  const columns = [...MANDATORY_COLUMNS.filter((c) => keys.has(c)), ...customColumns];

  const columnTypes: Record<string, ColumnType> = {};
  for (const col of customColumns) {
    columnTypes[col] = inferNdjsonColumnType(records, col);
  }

  const readCell: CellReader = (raw, col) => coerceNative(raw[col], columnTypes[col] ?? "string");

  const { log, warnings: coreWarnings } = buildLogFromRecords(
    records,
    columns,
    columnTypes,
    readCell,
    "parseNdjson",
  );

  const warnings = [...lineWarnings, ...coreWarnings].sort((a, b) => a.row - b.row);
  return { log, warnings };
}

/**
 * Parse a log of either format, auto-detecting via {@link detectLogFormat}
 * (Decision D2). The synchronous, cache-free counterpart to `loadLog` —
 * the one call for an embedder who doesn't care whether they hold CSV or
 * NDJSON. `loadLog` wraps this with the Phase-30 IndexedDB cache.
 */
export function parseLog(text: string): ParseResult {
  return detectLogFormat(text) === "ndjson" ? parseNdjson(text) : parseCsv(text);
}

/**
 * Infer a custom column's type from its native JSON values: all-number
 * → `"number"`, all-boolean → `"boolean"`, otherwise `"string"`; an
 * all-null/absent column defaults to `"string"` (mirrors `parseCsv`).
 */
function inferNdjsonColumnType(records: readonly SourceRecord[], col: string): ColumnType {
  let anyNonNull = false;
  let allNumber = true;
  let allBoolean = true;
  for (const { raw } of records) {
    const v = raw[col];
    if (v === undefined || v === null) continue;
    anyNonNull = true;
    if (typeof v !== "number") allNumber = false;
    if (typeof v !== "boolean") allBoolean = false;
    if (!allNumber && !allBoolean) break;
  }
  if (!anyNonNull) return "string";
  if (allNumber) return "number";
  if (allBoolean) return "boolean";
  return "string";
}

/** Coerce a native JSON value to the column's resolved type; null/absent → null. */
function coerceNative(v: unknown, type: ColumnType): AttributeValue {
  if (v === undefined || v === null) return null;
  if (type === "number") {
    if (typeof v === "number") return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : String(v);
  }
  if (type === "boolean") {
    if (typeof v === "boolean") return v;
    return String(v).toLowerCase() === "true";
  }
  return typeof v === "string" ? v : String(v);
}
