import { describe, expect, test } from "vitest";
import n1000Csv from "../data/input/runs/n1000-realistic/events.csv?raw";
import n1000Meta from "../data/input/runs/n1000-realistic/run_metadata.json";
import { getVariants } from "./getVariants.js";
import { parseCsv } from "./parseCsv.js";

const TERMINAL_ACTIVITIES = new Set(["approved", "rejected", "withdrawn"]);
const DIRECT_APPROVAL = [
  "submitted",
  "intake_validation",
  "assigned_to_reviewer",
  "review_in_progress",
  "health_inspection",
  "approved",
];

describe("getVariants — n1000 spot-check (deterministic seed-42 fixture)", () => {
  test("sum of variant counts equals num_cases", () => {
    const { log } = parseCsv(n1000Csv);
    const variants = getVariants(log);
    const total = variants.reduce((s, v) => s + v.count, 0);
    expect(total).toBe(n1000Meta.num_cases);
  });

  test("sum of variant percentages equals 100 within floating-point tolerance", () => {
    const { log } = parseCsv(n1000Csv);
    const variants = getVariants(log);
    const total = variants.reduce((s, v) => s + v.percentage, 0);
    expect(Math.abs(total - 100)).toBeLessThan(1e-9);
  });

  test("the top variant by count is the Direct Approval path", () => {
    const { log } = parseCsv(n1000Csv);
    const variants = getVariants(log);
    expect(variants[0]?.sequence).toEqual(DIRECT_APPROVAL);
  });

  test("every variant starts with 'submitted'", () => {
    const { log } = parseCsv(n1000Csv);
    const variants = getVariants(log);
    for (const variant of variants) {
      expect(variant.sequence[0]).toBe("submitted");
    }
  });

  test("every variant ends in a terminal activity (approved | rejected | withdrawn)", () => {
    const { log } = parseCsv(n1000Csv);
    const variants = getVariants(log);
    for (const variant of variants) {
      const last = variant.sequence[variant.sequence.length - 1];
      expect(TERMINAL_ACTIVITIES.has(last as string)).toBe(true);
    }
  });

  test("variants are returned in non-increasing count order", () => {
    const { log } = parseCsv(n1000Csv);
    const variants = getVariants(log);
    for (let i = 1; i < variants.length; i += 1) {
      const prev = variants[i - 1] as { count: number };
      const curr = variants[i] as { count: number };
      expect(prev.count).toBeGreaterThanOrEqual(curr.count);
    }
  });
});
