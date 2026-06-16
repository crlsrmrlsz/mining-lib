import { describe, expect, test } from "vitest";
import { interpolateRamp } from "./colorRamp.js";

describe("interpolateRamp — linear RGB between two CSS hex colors", () => {
  test("t=0 returns the low end exactly", () => {
    expect(interpolateRamp(0, "#94a3b8", "#d97706")).toBe("rgb(148, 163, 184)");
  });

  test("t=1 returns the high end exactly", () => {
    expect(interpolateRamp(1, "#94a3b8", "#d97706")).toBe("rgb(217, 119, 6)");
  });

  test("t=0.5 returns the channel-wise midpoint", () => {
    // R: (148 + 217) / 2 = 182.5 → 183 (rounded)
    // G: (163 + 119) / 2 = 141
    // B: (184 + 6) / 2 = 95
    expect(interpolateRamp(0.5, "#94a3b8", "#d97706")).toBe("rgb(183, 141, 95)");
  });

  test("clamps t below 0 to the low end", () => {
    expect(interpolateRamp(-0.5, "#94a3b8", "#d97706")).toBe("rgb(148, 163, 184)");
  });

  test("clamps t above 1 to the high end", () => {
    expect(interpolateRamp(1.5, "#94a3b8", "#d97706")).toBe("rgb(217, 119, 6)");
  });

  test("accepts 3-digit shorthand hex (#abc → #aabbcc)", () => {
    expect(interpolateRamp(0, "#abc", "#000000")).toBe("rgb(170, 187, 204)");
  });

  test("accepts rgb() inputs (getComputedStyle normalizes hex to rgb)", () => {
    expect(interpolateRamp(1, "rgb(148, 163, 184)", "rgb(239, 68, 68)")).toBe("rgb(239, 68, 68)");
    expect(interpolateRamp(0, "rgb(148, 163, 184)", "rgb(239, 68, 68)")).toBe("rgb(148, 163, 184)");
  });

  test("mixes hex and rgb inputs without coercion errors", () => {
    expect(interpolateRamp(1, "#94a3b8", "rgb(217, 119, 6)")).toBe("rgb(217, 119, 6)");
  });
});
