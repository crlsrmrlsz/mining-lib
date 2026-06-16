import { describe, expect, test } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import n5Json from "../data/input/runs/n5-fixture/events.json?raw";
import { parseCsv } from "./parseCsv.js";
import { detectLogFormat, parseLog, parseNdjson } from "./parseNdjson.js";

// Excel "Save as CSV UTF-8" and PowerShell prepend a UTF-8 BOM (U+FEFF). It
// glues to the first header / first JSON line — the single most common
// real-world CSV source — and must not corrupt parsing.
const BOM = "﻿";

describe("parsers strip a leading UTF-8 BOM", () => {
  test("parseCsv: a BOM-prefixed CSV parses identically (was a hard crash)", () => {
    const clean = parseCsv(n5Csv);
    const bommed = parseCsv(BOM + n5Csv);
    expect(bommed.warnings).toEqual([]);
    expect(bommed.log.cases.size).toBe(clean.log.cases.size);
    expect(bommed.log.events.length).toBe(clean.log.events.length);
  });

  test("parseNdjson: a BOM-prefixed NDJSON keeps its first event (was a silent skip)", () => {
    const clean = parseNdjson(n5Json);
    const bommed = parseNdjson(BOM + n5Json);
    expect(bommed.warnings).toEqual([]);
    expect(bommed.log.events.length).toBe(clean.log.events.length);
  });

  test("detectLogFormat + parseLog route a BOM-prefixed log correctly", () => {
    expect(detectLogFormat(BOM + n5Csv)).toBe("csv");
    expect(detectLogFormat(BOM + n5Json)).toBe("ndjson");
    expect(parseLog(BOM + n5Csv).log.events.length).toBe(parseCsv(n5Csv).log.events.length);
    expect(parseLog(BOM + n5Json).log.events.length).toBe(parseNdjson(n5Json).log.events.length);
  });
});
