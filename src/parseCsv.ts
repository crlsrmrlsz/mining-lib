import { csvParse } from "d3-dsv";
import {
  buildLogFromRecords,
  type CellReader,
  type ColumnType,
  partitionColumns,
  type SourceRecord,
  stripBom,
} from "./logRecords.js";
import type { AttributeValue, ParseResult } from "./types.js";

/**
 * Parse a LOG_FORMAT_SPEC v1.1 CSV into an `EventLog`. Tokenises with
 * d3-dsv, infers each custom column's type from its string values, then
 * hands the rows to the shared record-processing core
 * ({@link buildLogFromRecords}) — the single code path that builds an
 * `EventLog`, so CSV and NDJSON stay output-identical for the same data.
 */
export function parseCsv(text: string): ParseResult {
  const rows = csvParse(stripBom(text));
  const columns = rows.columns;
  const { caseAttributes, eventAttributes } = partitionColumns(columns);
  const customColumns = [...caseAttributes, ...eventAttributes];

  const columnTypes: Record<string, ColumnType> = {};
  for (const col of customColumns) {
    columnTypes[col] = inferColumnType(rows, col);
  }

  const records: SourceRecord[] = rows.map((raw, i) => ({ raw, row: i + 2 }));
  const readCell: CellReader = (raw, col) =>
    coerce(raw[col] as string | undefined, columnTypes[col] ?? "string");

  return buildLogFromRecords(records, columns, columnTypes, readCell, "parseCsv");
}

function inferColumnType(
  rows: readonly Record<string, string | undefined>[],
  col: string,
): ColumnType {
  let anyNonEmpty = false;
  let allNumeric = true;
  let allBoolean = true;
  for (const row of rows) {
    const v = row[col];
    if (v === undefined || v === "") continue;
    anyNonEmpty = true;
    if (allNumeric) {
      const n = Number(v);
      if (!Number.isFinite(n)) allNumeric = false;
    }
    if (allBoolean) {
      const lower = v.toLowerCase();
      if (lower !== "true" && lower !== "false") allBoolean = false;
    }
    if (!allNumeric && !allBoolean) break;
  }
  if (!anyNonEmpty) return "string";
  if (allNumeric) return "number";
  if (allBoolean) return "boolean";
  return "string";
}

function coerce(raw: string | undefined, type: ColumnType): AttributeValue {
  if (raw === undefined || raw === "") return null;
  if (type === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (type === "boolean") return raw.toLowerCase() === "true";
  return raw;
}
