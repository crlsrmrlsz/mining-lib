import { describe, expect, test } from "vitest";
import { computeFitToView } from "./computeFitToView.js";

describe("computeFitToView — downscale-only invariant", () => {
  test("layout fits naturally → k=1, centered", () => {
    const fit = computeFitToView({ width: 600, height: 300 }, { width: 1920, height: 720 }, 16);
    expect(fit.k).toBe(1);
    expect(fit.x).toBe((1920 - 600) / 2);
    expect(fit.y).toBe((720 - 300) / 2);
  });

  test("does not upscale a small graph even when both axes have huge slack", () => {
    const fit = computeFitToView({ width: 100, height: 100 }, { width: 1920, height: 1080 }, 16);
    expect(fit.k).toBe(1);
  });
});

describe("computeFitToView — content-box origin (minX/minY)", () => {
  test("a non-zero origin shifts the centred box by -origin*k", () => {
    // Box fits (k=1): centre of [100..700]×[50..350] lands at viewport centre.
    const fit = computeFitToView(
      { minX: 100, minY: 50, width: 600, height: 300 },
      { width: 1920, height: 720 },
      0,
    );
    expect(fit.k).toBe(1);
    expect(fit.x).toBe((1920 - 600) / 2 - 100);
    expect(fit.y).toBe((720 - 300) / 2 - 50);
  });

  test("a negative origin (content dragged left/up) is framed too", () => {
    const fit = computeFitToView(
      { minX: -200, minY: 0, width: 600, height: 300 },
      { width: 1920, height: 720 },
      0,
    );
    expect(fit.k).toBe(1);
    expect(fit.x).toBe((1920 - 600) / 2 + 200);
  });

  test("omitting minX/minY is identical to a (0,0) origin (back-compat)", () => {
    const withZero = computeFitToView(
      { minX: 0, minY: 0, width: 800, height: 400 },
      { width: 1000, height: 600 },
      16,
    );
    const without = computeFitToView({ width: 800, height: 400 }, { width: 1000, height: 600 }, 16);
    expect(withZero).toEqual(without);
  });
});

describe("computeFitToView — downscaling", () => {
  test("scales by the more constraining axis (height-bound)", () => {
    const fit = computeFitToView({ width: 2000, height: 1200 }, { width: 800, height: 600 }, 16);
    // availW = 768, availH = 568
    // k = min(768/2000, 568/1200, 1) = min(0.384, 0.473, 1) = 0.384
    expect(fit.k).toBeCloseTo(0.384, 5);
    expect(fit.x).toBeCloseTo((800 - 2000 * 0.384) / 2, 5);
    expect(fit.y).toBeCloseTo((600 - 1200 * 0.384) / 2, 5);
  });

  test("scales by the more constraining axis (width-bound)", () => {
    const fit = computeFitToView({ width: 400, height: 800 }, { width: 800, height: 600 }, 0);
    // k = min(800/400, 600/800, 1) = min(2, 0.75, 1) = 0.75
    expect(fit.k).toBe(0.75);
    expect(fit.x).toBe((800 - 400 * 0.75) / 2);
    expect(fit.y).toBe((600 - 800 * 0.75) / 2);
  });

  test("padding 0 lets layout meet host edges", () => {
    const fit = computeFitToView({ width: 800, height: 400 }, { width: 800, height: 400 }, 0);
    expect(fit.k).toBe(1);
    expect(fit.x).toBe(0);
    expect(fit.y).toBe(0);
  });

  test("padding subtracts equally from both sides", () => {
    const fit = computeFitToView({ width: 1000, height: 500 }, { width: 1000, height: 500 }, 50);
    // availW=900, availH=400 → k=min(0.9, 0.8, 1) = 0.8
    expect(fit.k).toBe(0.8);
    expect(fit.x).toBe((1000 - 1000 * 0.8) / 2);
    expect(fit.y).toBe((500 - 500 * 0.8) / 2);
  });
});

describe("computeFitToView — degenerate inputs", () => {
  test("zero-width layout returns identity-like default", () => {
    expect(computeFitToView({ width: 0, height: 100 }, { width: 800, height: 600 }, 16)).toEqual({
      k: 1,
      x: 0,
      y: 0,
    });
  });

  test("zero-height layout returns identity-like default", () => {
    expect(computeFitToView({ width: 100, height: 0 }, { width: 800, height: 600 }, 16)).toEqual({
      k: 1,
      x: 0,
      y: 0,
    });
  });

  test("zero-size viewport returns identity-like default", () => {
    expect(computeFitToView({ width: 100, height: 100 }, { width: 0, height: 0 }, 16)).toEqual({
      k: 1,
      x: 0,
      y: 0,
    });
  });

  test("padding larger than viewport returns identity-like default", () => {
    expect(computeFitToView({ width: 100, height: 100 }, { width: 20, height: 20 }, 50)).toEqual({
      k: 1,
      x: 0,
      y: 0,
    });
  });
});

describe("computeFitToView — input validation", () => {
  test("non-finite layout dims fall back to identity (dagre empty-graph case)", () => {
    expect(
      computeFitToView(
        { width: Number.NEGATIVE_INFINITY, height: Number.NEGATIVE_INFINITY },
        { width: 800, height: 600 },
        16,
      ),
    ).toEqual({ k: 1, x: 0, y: 0 });
    expect(
      computeFitToView({ width: Number.NaN, height: 100 }, { width: 800, height: 600 }, 16),
    ).toEqual({ k: 1, x: 0, y: 0 });
  });

  test("non-finite viewport dims fall back to identity", () => {
    expect(
      computeFitToView({ width: 100, height: 100 }, { width: Number.NaN, height: 600 }, 16),
    ).toEqual({ k: 1, x: 0, y: 0 });
  });

  test("negative layout dims fall back to identity", () => {
    expect(computeFitToView({ width: -100, height: 100 }, { width: 800, height: 600 }, 16)).toEqual(
      { k: 1, x: 0, y: 0 },
    );
  });

  test("non-finite padding throws TypeError", () => {
    expect(() =>
      computeFitToView({ width: 100, height: 100 }, { width: 800, height: 600 }, Number.NaN),
    ).toThrow(TypeError);
    expect(() =>
      computeFitToView(
        { width: 100, height: 100 },
        { width: 800, height: 600 },
        Number.POSITIVE_INFINITY,
      ),
    ).toThrow(TypeError);
  });

  test("negative padding throws TypeError", () => {
    expect(() =>
      computeFitToView({ width: 100, height: 100 }, { width: 800, height: 600 }, -1),
    ).toThrow(TypeError);
  });
});

describe("computeFitToView — return shape", () => {
  test("always returns finite numbers for valid inputs", () => {
    const fit = computeFitToView(
      { width: 1234.5, height: 678.9 },
      { width: 1920, height: 1080 },
      16,
    );
    expect(Number.isFinite(fit.k)).toBe(true);
    expect(Number.isFinite(fit.x)).toBe(true);
    expect(Number.isFinite(fit.y)).toBe(true);
  });
});
