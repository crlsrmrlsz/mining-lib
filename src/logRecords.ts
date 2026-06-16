/**
 * Format-independent record-processing core shared by `parseCsv` and
 * `parseNdjson` (Phase 31). The two parsers differ only in how they
 * turn bytes into records (d3-dsv vs line-by-line `JSON.parse`), how
 * they discover columns (CSV header vs key-union), and how they read a
 * cell (string coercion vs native JSON type). Everything that builds an
 * `EventLog` — mandatory-column validation, per-record checks, dedup,
 * case grouping, chronological sort, schema assembly — lives here, so
 * the two formats cannot drift: they produce identical output for the
 * same data because they run the same code.
 */

import type {
  AttributeValue,
  Case,
  Event,
  EventLog,
  LogSchema,
  ParseResult,
  ParseWarning,
} from "./types.js";

/** The five mandatory XES columns, in canonical order (LOG_FORMAT_SPEC v1.1). */
export const MANDATORY_COLUMNS = [
  "case:concept:name",
  "concept:name",
  "time:timestamp",
  "org:resource",
  "lifecycle:transition",
] as const;

const MANDATORY_SET = new Set<string>(MANDATORY_COLUMNS);

export type ColumnType = "string" | "number" | "boolean";

/** A raw source record: a column-keyed bag of not-yet-validated values. */
export type RawRecord = Record<string, unknown>;

/** A source record plus its 1-based locator (CSV row / NDJSON line) for warnings. */
export type SourceRecord = { raw: RawRecord; row: number };

/** Reads a custom-attribute cell, coerced to its column type. Format-specific. */
export type CellReader = (raw: RawRecord, column: string) => AttributeValue;

/**
 * Strip a leading UTF-8 BOM (U+FEFF). Excel "Save as CSV UTF-8" and
 * PowerShell prepend it; it would otherwise glue to the first CSV header
 * (a hard "missing mandatory column" crash) or the first NDJSON line.
 */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Split discovered columns into case-level (`case:*`) and event-level
 * custom attributes, skipping the five mandatory columns. Shared so both
 * parsers partition their schema identically.
 */
export function partitionColumns(columns: readonly string[]): {
  caseAttributes: string[];
  eventAttributes: string[];
} {
  const caseAttributes: string[] = [];
  const eventAttributes: string[] = [];
  for (const col of columns) {
    if (MANDATORY_SET.has(col)) continue;
    if (col.startsWith("case:")) caseAttributes.push(col);
    else eventAttributes.push(col);
  }
  return { caseAttributes, eventAttributes };
}

/**
 * Parse a LOG_FORMAT_SPEC timestamp (space- or `T`-separated, optional
 * sub-second + tz offset) to a `Date`, or `null` when unparseable.
 * Microseconds are clipped to milliseconds. The string format is
 * identical across CSV and NDJSON, so both reuse this verbatim.
 */
export function parseTimestamp(raw: string): Date | null {
  const normalized = raw.replace(" ", "T").replace(/(\.\d{3})\d+/, "$1");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Coerce a raw value to a non-empty string, or `undefined` for null/empty/absent. */
function asText(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string") return v;
  // A non-scalar (object / array) value in a mandatory column would `String(v)`
  // into a corrupt "[object Object]" / comma-joined node with no warning.
  // Return undefined so the caller's missing-mandatory warn+skip path fires.
  // Numbers / booleans are scalar and coerce as before.
  if (typeof v === "object") return undefined;
  return String(v);
}

/**
 * Build an `EventLog` from already-tokenised records. Throws (prefixed
 * with `source`) when a mandatory column is absent from `columns`;
 * otherwise it never throws — bad records become `warnings` and are
 * skipped, mirroring the per-row resilience CSV has always had. Each
 * record carries its own 1-based `row` so NDJSON line numbers survive
 * the blank/malformed lines the shim dropped before calling here.
 */
export function buildLogFromRecords(
  records: readonly SourceRecord[],
  columns: readonly string[],
  columnTypes: Record<string, ColumnType>,
  readCell: CellReader,
  source: string,
): ParseResult {
  const missing = MANDATORY_COLUMNS.filter((c) => !columns.includes(c));
  if (missing.length > 0) {
    throw new Error(`${source}: missing mandatory column(s): ${missing.join(", ")}`);
  }

  const { caseAttributes, eventAttributes } = partitionColumns(columns);

  const warnings: ParseWarning[] = [];
  const cases = new Map<string, Case>();
  const events: Event[] = [];
  const seen = new Set<string>();

  for (const { raw, row } of records) {
    const caseId = asText(raw["case:concept:name"]);
    const activity = asText(raw["concept:name"]);
    const timestampStr = asText(raw["time:timestamp"]);
    const lifecycle = asText(raw["lifecycle:transition"]);

    if (caseId === undefined || caseId.trim() === "") {
      warnings.push({ row, reason: "missing case:concept:name" });
      continue;
    }
    if (activity === undefined || activity.trim() === "") {
      warnings.push({ row, reason: "missing or empty concept:name" });
      continue;
    }
    if (timestampStr === undefined || timestampStr.trim() === "") {
      warnings.push({ row, reason: "missing time:timestamp" });
      continue;
    }
    if (lifecycle === undefined) {
      warnings.push({ row, reason: "missing lifecycle:transition" });
      continue;
    }

    const timestamp = parseTimestamp(timestampStr);
    if (timestamp === null) {
      warnings.push({
        row,
        reason: `unparseable time:timestamp ${JSON.stringify(timestampStr)}`,
      });
      continue;
    }

    const dedupKey = `${caseId}${timestampStr}${activity}`;
    if (seen.has(dedupKey)) {
      warnings.push({
        row,
        reason: "duplicate (case:concept:name, time:timestamp, concept:name) triple",
      });
      continue;
    }
    seen.add(dedupKey);

    const resourceRaw = raw["org:resource"];
    const resource = typeof resourceRaw === "string" && resourceRaw !== "" ? resourceRaw : null;

    const eventAttrBag: Record<string, AttributeValue> = {};
    for (const col of eventAttributes) {
      eventAttrBag[col] = readCell(raw, col);
    }

    const event: Event = {
      caseId,
      activity,
      timestamp,
      resource,
      lifecycle,
      attributes: eventAttrBag,
    };

    let caseObj = cases.get(caseId);
    if (!caseObj) {
      const caseAttrBag: Record<string, AttributeValue> = {};
      for (const col of caseAttributes) {
        caseAttrBag[col] = readCell(raw, col);
      }
      caseObj = { id: caseId, events: [], attributes: caseAttrBag };
      cases.set(caseId, caseObj);
    }
    caseObj.events.push(event);
    events.push(event);
  }

  for (const c of cases.values()) {
    c.events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
  events.sort((a, b) => {
    const byCase = a.caseId.localeCompare(b.caseId);
    if (byCase !== 0) return byCase;
    return a.timestamp.getTime() - b.timestamp.getTime();
  });

  const schema: LogSchema = { caseAttributes, eventAttributes, columnTypes };
  const log: EventLog = { cases, events, schema };
  return { log, warnings };
}
