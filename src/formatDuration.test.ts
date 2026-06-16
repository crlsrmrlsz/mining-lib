import { describe, expect, test } from "vitest";
import { formatDuration } from "./formatDuration.js";

describe("formatDuration — largest-fitting unit, one decimal place", () => {
  test("0 ms renders as '0 s' (lowest unit, no fraction)", () => {
    expect(formatDuration(0)).toBe("0 s");
  });

  test("sub-second values use seconds with one decimal", () => {
    expect(formatDuration(500)).toBe("0.5 s");
  });

  test("1500 ms renders as '1.5 s'", () => {
    expect(formatDuration(1500)).toBe("1.5 s");
  });

  test("60_000 ms (1 minute) renders as '1.0 m'", () => {
    expect(formatDuration(60_000)).toBe("1.0 m");
  });

  test("90_000 ms (1.5 minutes) renders as '1.5 m'", () => {
    expect(formatDuration(90_000)).toBe("1.5 m");
  });

  test("3_600_000 ms (1 hour) renders as '1.0 h'", () => {
    expect(formatDuration(3_600_000)).toBe("1.0 h");
  });

  test("86_400_000 ms (1 day) renders as '1.0 d'", () => {
    expect(formatDuration(86_400_000)).toBe("1.0 d");
  });

  test("233_280_000 ms (2.7 days) renders as '2.7 d'", () => {
    expect(formatDuration(233_280_000)).toBe("2.7 d");
  });

  test("negative input throws", () => {
    expect(() => formatDuration(-1)).toThrow();
  });
});
