import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ControlsConfig } from "./parseControls.js";

beforeEach(() => {
  // Reset the module so the per-session deprecation-warning de-dup
  // Set starts empty for every test.
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const ALL_ON: ControlsConfig = {
  mode: true,
  variants: true,
  filters: true,
  tr: true,
  bl: true,
  selection: true,
};

const ALL_OFF: ControlsConfig = {
  mode: false,
  variants: false,
  filters: false,
  tr: false,
  bl: false,
  selection: false,
};

async function loadParser() {
  return await import("./parseControls.js");
}

describe("parseControls", () => {
  it("returns all 6 tokens on for null / undefined / empty / 'all'", async () => {
    const { parseControls } = await loadParser();
    expect(parseControls(null)).toEqual(ALL_ON);
    expect(parseControls(undefined)).toEqual(ALL_ON);
    expect(parseControls("")).toEqual(ALL_ON);
    expect(parseControls("  ")).toEqual(ALL_ON);
    expect(parseControls("all")).toEqual(ALL_ON);
  });

  it("'none' returns all 6 tokens false", async () => {
    const { parseControls } = await loadParser();
    expect(parseControls("none")).toEqual(ALL_OFF);
  });

  it("space-separated subset turns the listed tokens on, rest off", async () => {
    const { parseControls } = await loadParser();
    expect(parseControls("mode variants tr")).toEqual({
      ...ALL_OFF,
      mode: true,
      variants: true,
      tr: true,
    });
    expect(parseControls("bl  selection")).toEqual({
      ...ALL_OFF,
      bl: true,
      selection: true,
    });
  });

  it("'primary' (deprecated) expands to mode + variants + filters and warns once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { parseControls } = await loadParser();
    expect(parseControls("primary")).toEqual({
      ...ALL_OFF,
      mode: true,
      variants: true,
      filters: true,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('"primary"');
    expect(warn.mock.calls[0]?.[0]).toMatch(/deprecated/i);
    expect(warn.mock.calls[0]?.[0]).toContain("mode variants filters");
  });

  it("'ctx' (deprecated) maps to selection and warns once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { parseControls } = await loadParser();
    expect(parseControls("ctx")).toEqual({
      ...ALL_OFF,
      selection: true,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('"ctx"');
    expect(warn.mock.calls[0]?.[0]).toContain("selection");
  });

  it("'primary ctx' fires two warns and expands both", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { parseControls } = await loadParser();
    expect(parseControls("primary ctx")).toEqual({
      ...ALL_OFF,
      mode: true,
      variants: true,
      filters: true,
      selection: true,
    });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("repeated calls with the same deprecated token warn at most once per session", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { parseControls } = await loadParser();
    parseControls("primary");
    parseControls("primary");
    parseControls("primary tr");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("warns once on unknown tokens but does not throw", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { parseControls } = await loadParser();
    const result = parseControls("mode foo bar");
    expect(result).toEqual({
      ...ALL_OFF,
      mode: true,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('unknown controls token: "foo"');
  });

  it("returns a fresh object each call (no mutation leaks)", async () => {
    const { parseControls } = await loadParser();
    const a = parseControls("all");
    a.mode = false;
    const b = parseControls("all");
    expect(b.mode).toBe(true);
  });
});

describe("serializeControls", () => {
  it("returns 'all' when every token is true", async () => {
    const { serializeControls } = await loadParser();
    expect(serializeControls(ALL_ON)).toBe("all");
  });

  it("returns 'none' when every token is false", async () => {
    const { serializeControls } = await loadParser();
    expect(serializeControls(ALL_OFF)).toBe("none");
  });

  it("emits space-separated new tokens for partial config", async () => {
    const { serializeControls } = await loadParser();
    expect(
      serializeControls({
        ...ALL_OFF,
        mode: true,
        bl: true,
      }),
    ).toBe("mode bl");
  });

  it("never re-emits the deprecated `primary` or `ctx` tokens", async () => {
    const { serializeControls } = await loadParser();
    const s = serializeControls(ALL_ON);
    expect(s).not.toContain("primary");
    expect(s).not.toContain("ctx");
  });
});

describe("DEFAULT_CONTROLS", () => {
  it("equals all-on", async () => {
    const { DEFAULT_CONTROLS } = await loadParser();
    expect(DEFAULT_CONTROLS).toEqual(ALL_ON);
  });
});
