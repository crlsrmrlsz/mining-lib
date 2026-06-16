import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IconName } from "./icons.js";

describe("setIcon", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  async function loadModule() {
    return await import("./icons.js");
  }

  it("every IconName produces an <svg> with children when set", async () => {
    const { ICONS, setIcon } = await loadModule();
    for (const name of Object.keys(ICONS) as IconName[]) {
      const el = document.createElement("button");
      setIcon(el, name);
      const svg = el.querySelector("svg");
      if (svg === null) {
        throw new Error(`icon "${name}" did not produce an <svg>`);
      }
      expect(svg.children.length, `icon "${name}" produced an empty <svg>`).toBeGreaterThan(0);
    }
  });

  it("setIcon writes the data-icon attribute", async () => {
    const { setIcon } = await loadModule();
    const el = document.createElement("button");
    setIcon(el, "clock");
    expect(el.dataset.icon).toBe("clock");
  });

  it("setting the same icon on two different elements parses the SVG once (cache hit)", async () => {
    const createSpy = vi.spyOn(document, "createElement");
    const { setIcon } = await loadModule();
    const btnA = document.createElement("button");
    const btnB = document.createElement("button");
    createSpy.mockClear();
    setIcon(btnA, "sigma");
    setIcon(btnB, "sigma");
    const templateCreations = createSpy.mock.calls.filter(([tag]) => tag === "template");
    expect(
      templateCreations,
      "expected exactly one createElement('template') across two same-icon sets",
    ).toHaveLength(1);
  });

  it("setting a different icon constructs a new template", async () => {
    const createSpy = vi.spyOn(document, "createElement");
    const { setIcon } = await loadModule();
    const btn = document.createElement("button");
    createSpy.mockClear();
    setIcon(btn, "sigma");
    setIcon(btn, "clock");
    const templateCreations = createSpy.mock.calls.filter(([tag]) => tag === "template");
    expect(templateCreations).toHaveLength(2);
  });

  it("changing icons on the same element replaces children atomically", async () => {
    const { setIcon } = await loadModule();
    const el = document.createElement("button");
    setIcon(el, "sigma");
    const firstSvg = el.querySelector("svg");
    expect(firstSvg).not.toBeNull();
    setIcon(el, "clock");
    expect(el.dataset.icon).toBe("clock");
    expect(el.children).toHaveLength(1);
    expect(el.querySelector("svg")).not.toBe(firstSvg);
  });

  it("distinct elements receive distinct cloned subtrees", async () => {
    const { setIcon } = await loadModule();
    const btnA = document.createElement("button");
    const btnB = document.createElement("button");
    setIcon(btnA, "sigma");
    setIcon(btnB, "sigma");
    const svgA = btnA.querySelector("svg");
    const svgB = btnB.querySelector("svg");
    if (svgA === null || svgB === null) {
      throw new Error("expected both buttons to hold an <svg> child");
    }
    expect(svgA).not.toBe(svgB);
    svgA.setAttribute("data-test", "mutated");
    expect(svgB.getAttribute("data-test")).toBeNull();
  });
});
