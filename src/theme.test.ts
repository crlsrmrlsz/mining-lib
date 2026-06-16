import { describe, expect, it } from "vitest";
import {
  DARK_DEFAULTS,
  LIGHT_DEFAULTS,
  mergeTheme,
  type ResolvedTheme,
  resolveTheme,
} from "./theme.js";

describe("resolveTheme", () => {
  it("returns LIGHT_DEFAULTS when called with no argument", () => {
    const result = resolveTheme();
    expect(result).toEqual(LIGHT_DEFAULTS);
    expect(result).not.toBe(LIGHT_DEFAULTS);
  });

  it("returns DARK_DEFAULTS when called with { dark: true }", () => {
    const result = resolveTheme({ dark: true });
    expect(result).toEqual(DARK_DEFAULTS);
    expect(result).not.toBe(DARK_DEFAULTS);
  });

  it("merges a partial light override per field", () => {
    const result = resolveTheme({ nodeRadius: 12 });
    expect(result.nodeRadius).toBe(12);
    expect(result.nodeFill).toBe(LIGHT_DEFAULTS.nodeFill);
    expect(result.edgeStroke).toBe(LIGHT_DEFAULTS.edgeStroke);
    expect(result.dark).toBe(false);
  });

  it("merges a partial dark override per field", () => {
    const result = resolveTheme({ dark: true, nodeFill: "#111111" });
    expect(result.nodeFill).toBe("#111111");
    expect(result.nodeStroke).toBe(DARK_DEFAULTS.nodeStroke);
    expect(result.edgeStroke).toBe(DARK_DEFAULTS.edgeStroke);
    expect(result.dark).toBe(true);
  });

  it("accepts a numeric fontSize unchanged", () => {
    const result = resolveTheme({ fontSize: 14 });
    expect(result.fontSize).toBe(14);
  });

  it("exposes the Phase 14 token surface fields with light defaults", () => {
    const result = resolveTheme();
    expect(result.accent).toBe(LIGHT_DEFAULTS.accent);
    expect(result.accentForeground).toBe(LIGHT_DEFAULTS.accentForeground);
    expect(result.borderRadius).toBe(LIGHT_DEFAULTS.borderRadius);
    expect(result.pillShadow).toBe(LIGHT_DEFAULTS.pillShadow);
    expect(result.gridDot).toBe(LIGHT_DEFAULTS.gridDot);
    expect(result.monoFontFamily).toBe(LIGHT_DEFAULTS.monoFontFamily);
  });

  it("exposes the Phase 14 token surface fields with dark defaults", () => {
    const result = resolveTheme({ dark: true });
    expect(result.accent).toBe(DARK_DEFAULTS.accent);
    expect(result.gridDot).toBe(DARK_DEFAULTS.gridDot);
    expect(result.borderRadius).toBe(DARK_DEFAULTS.borderRadius);
  });

  it("merges a partial accent override per field", () => {
    const result = resolveTheme({ accent: "#ff00aa" });
    expect(result.accent).toBe("#ff00aa");
    expect(result.accentForeground).toBe(LIGHT_DEFAULTS.accentForeground);
    expect(result.nodeFill).toBe(LIGHT_DEFAULTS.nodeFill);
    expect(result.dark).toBe(false);
  });

  it("returns an object independent of inputs and defaults", () => {
    const partial = { nodeRadius: 10 };
    const result = resolveTheme(partial);
    result.nodeRadius = 99;
    result.nodeFill = "#deadbe";
    const fresh = resolveTheme(partial);
    expect(fresh.nodeRadius).toBe(10);
    expect(fresh.nodeFill).toBe(LIGHT_DEFAULTS.nodeFill);
    // Mutation must not have leaked into the frozen defaults.
    expect(LIGHT_DEFAULTS.nodeFill).toBe("#f8fafc");
    expect(LIGHT_DEFAULTS.nodeRadius).toBe(6);
  });
});

describe("mergeTheme", () => {
  it("switching dark with no customisations picks up the new baseline", () => {
    const current: ResolvedTheme = { ...LIGHT_DEFAULTS };
    const next = mergeTheme(LIGHT_DEFAULTS, DARK_DEFAULTS, current, { dark: true });
    expect(next).toEqual(DARK_DEFAULTS);
  });

  it("switching dark preserves user-customised geometry fields", () => {
    const current: ResolvedTheme = { ...LIGHT_DEFAULTS, nodeRadius: 12 };
    const next = mergeTheme(LIGHT_DEFAULTS, DARK_DEFAULTS, current, { dark: true });
    expect(next.nodeRadius).toBe(12);
    expect(next.nodeFill).toBe(DARK_DEFAULTS.nodeFill);
    expect(next.edgeStroke).toBe(DARK_DEFAULTS.edgeStroke);
    expect(next.dark).toBe(true);
  });

  it("explicit field in partial wins over both customisation and baseline", () => {
    const current: ResolvedTheme = { ...LIGHT_DEFAULTS, nodeRadius: 12 };
    const next = mergeTheme(LIGHT_DEFAULTS, DARK_DEFAULTS, current, {
      dark: true,
      nodeRadius: 8,
    });
    expect(next.nodeRadius).toBe(8);
    expect(next.nodeFill).toBe(DARK_DEFAULTS.nodeFill);
    expect(next.dark).toBe(true);
  });

  it("preserves a custom accent across a dark flip", () => {
    const current: ResolvedTheme = { ...LIGHT_DEFAULTS, accent: "#ec4899" };
    const next = mergeTheme(LIGHT_DEFAULTS, DARK_DEFAULTS, current, { dark: true });
    expect(next.accent).toBe("#ec4899");
    expect(next.gridDot).toBe(DARK_DEFAULTS.gridDot);
    expect(next.dark).toBe(true);
  });

  it("preserves a custom borderRadius across a dark flip", () => {
    const current: ResolvedTheme = { ...LIGHT_DEFAULTS, borderRadius: 12 };
    const next = mergeTheme(LIGHT_DEFAULTS, DARK_DEFAULTS, current, { dark: true });
    expect(next.borderRadius).toBe(12);
    expect(next.pillShadow).toBe(DARK_DEFAULTS.pillShadow);
  });
});

describe("Phase 17 — time ramp tokens", () => {
  it("light defaults expose neutral low and amber high", () => {
    expect(LIGHT_DEFAULTS.timeRampLow).toBe("#94a3b8");
    expect(LIGHT_DEFAULTS.timeRampHigh).toBe("#d97706");
  });

  it("dark defaults expose darker neutral low and the same amber high", () => {
    expect(DARK_DEFAULTS.timeRampLow).toBe("#475569");
    expect(DARK_DEFAULTS.timeRampHigh).toBe("#d97706");
  });

  it("resolveTheme surfaces the new tokens with light defaults when called bare", () => {
    const result = resolveTheme();
    expect(result.timeRampLow).toBe(LIGHT_DEFAULTS.timeRampLow);
    expect(result.timeRampHigh).toBe(LIGHT_DEFAULTS.timeRampHigh);
  });

  it("resolveTheme accepts a partial timeRampHigh override on light", () => {
    const result = resolveTheme({ timeRampHigh: "#ef4444" });
    expect(result.timeRampHigh).toBe("#ef4444");
    expect(result.timeRampLow).toBe(LIGHT_DEFAULTS.timeRampLow);
    expect(result.dark).toBe(false);
  });

  it("mergeTheme preserves a custom timeRampHigh across a dark flip", () => {
    const current: ResolvedTheme = { ...LIGHT_DEFAULTS, timeRampHigh: "#ef4444" };
    const next = mergeTheme(LIGHT_DEFAULTS, DARK_DEFAULTS, current, { dark: true });
    expect(next.timeRampHigh).toBe("#ef4444");
    expect(next.timeRampLow).toBe(DARK_DEFAULTS.timeRampLow);
    expect(next.dark).toBe(true);
  });
});

describe("Phase 24 — overlay fade opacity token", () => {
  it("light defaults expose overlayFadeOpacity = '0.5'", () => {
    expect(LIGHT_DEFAULTS.overlayFadeOpacity).toBe("0.5");
  });

  it("dark defaults expose the same overlayFadeOpacity = '0.5'", () => {
    expect(DARK_DEFAULTS.overlayFadeOpacity).toBe("0.5");
  });

  it("resolveTheme surfaces the token with light defaults when called bare", () => {
    const result = resolveTheme();
    expect(result.overlayFadeOpacity).toBe(LIGHT_DEFAULTS.overlayFadeOpacity);
  });

  it("resolveTheme accepts a partial override on light", () => {
    const result = resolveTheme({ overlayFadeOpacity: "0.4" });
    expect(result.overlayFadeOpacity).toBe("0.4");
    expect(result.nodeFill).toBe(LIGHT_DEFAULTS.nodeFill);
  });

  it("mergeTheme preserves a custom overlayFadeOpacity across a dark flip", () => {
    const current: ResolvedTheme = { ...LIGHT_DEFAULTS, overlayFadeOpacity: "0.6" };
    const next = mergeTheme(LIGHT_DEFAULTS, DARK_DEFAULTS, current, { dark: true });
    expect(next.overlayFadeOpacity).toBe("0.6");
    expect(next.dark).toBe(true);
  });
});

describe("Phase 24 (Option C) — happy-path colour tokens", () => {
  it("light defaults expose happy-stroke green + faint node tint", () => {
    expect(LIGHT_DEFAULTS.happyStroke).toBe("#16a34a");
    expect(LIGHT_DEFAULTS.happyNodeFill).toBe("#f0fdf4");
  });

  it("dark defaults expose brighter green + darker node tint", () => {
    expect(DARK_DEFAULTS.happyStroke).toBe("#22c55e");
    expect(DARK_DEFAULTS.happyNodeFill).toBe("#052e16");
  });

  it("resolveTheme surfaces both tokens", () => {
    const result = resolveTheme();
    expect(result.happyStroke).toBe(LIGHT_DEFAULTS.happyStroke);
    expect(result.happyNodeFill).toBe(LIGHT_DEFAULTS.happyNodeFill);
  });

  it("resolveTheme accepts partial overrides on both tokens", () => {
    const result = resolveTheme({ happyStroke: "#ec4899", happyNodeFill: "#fdf2f8" });
    expect(result.happyStroke).toBe("#ec4899");
    expect(result.happyNodeFill).toBe("#fdf2f8");
  });

  it("mergeTheme preserves a custom happyStroke across a dark flip", () => {
    const current: ResolvedTheme = { ...LIGHT_DEFAULTS, happyStroke: "#ec4899" };
    const next = mergeTheme(LIGHT_DEFAULTS, DARK_DEFAULTS, current, { dark: true });
    expect(next.happyStroke).toBe("#ec4899");
    expect(next.happyNodeFill).toBe(DARK_DEFAULTS.happyNodeFill);
    expect(next.dark).toBe(true);
  });
});
