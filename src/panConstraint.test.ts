import { describe, expect, test } from "vitest";
import { clampDragPoint } from "./panConstraint.js";

describe("clampDragPoint — keep a dragged element inside the visible viewport", () => {
  const VP = { width: 800, height: 600 };
  const IDENTITY = { x: 0, y: 0, k: 1 };

  test("a point past the right/top edge is pulled back so the node stays fully inside", () => {
    // Node 40×20 (half 20×10) dragged to (790, 5) at identity zoom.
    const out = clampDragPoint({ x: 790, y: 5 }, { x: 20, y: 10 }, VP, IDENTITY);
    expect(out.x).toBe(800 - 20); // right edge minus half-width
    expect(out.y).toBe(0 + 10); // top edge plus half-height
  });

  test("a point already inside is returned unchanged", () => {
    expect(clampDragPoint({ x: 400, y: 300 }, { x: 20, y: 10 }, VP, IDENTITY)).toEqual({
      x: 400,
      y: 300,
    });
  });

  test("the visible box is computed in content coords from the zoom transform", () => {
    // k=2 → the 800px-wide viewport spans only 400 content units.
    const out = clampDragPoint({ x: 1000, y: 1000 }, { x: 0, y: 0 }, VP, { x: 0, y: 0, k: 2 });
    expect(out.x).toBe(400);
    expect(out.y).toBe(300);
  });

  test("a pan offset shifts the visible content window", () => {
    // transform.x = 100 → screen 0 maps to content -100, screen 800 → content 700.
    const out = clampDragPoint({ x: -500, y: 0 }, { x: 0, y: 0 }, VP, { x: 100, y: 0, k: 1 });
    expect(out.x).toBe(-100);
  });

  test("a node larger than the viewport centres rather than inverting", () => {
    const out = clampDragPoint({ x: 9999, y: 0 }, { x: 500, y: 0 }, VP, IDENTITY);
    // lo = 500, hi = 300 → centre (400).
    expect(out.x).toBe(400);
  });

  test("a zero-size viewport (jsdom / detached) leaves the point unclamped", () => {
    const out = clampDragPoint(
      { x: 9999, y: -9999 },
      { x: 20, y: 10 },
      { width: 0, height: 0 },
      IDENTITY,
    );
    expect(out).toEqual({ x: 9999, y: -9999 });
  });
});
