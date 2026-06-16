import { describe, expect, it } from "vitest";
import { createDiagram } from "./index.js";
import { PRESETS, type PresetName } from "./presets.js";

function makeHost(): HTMLElement {
  const host = document.createElement("div");
  host.style.width = "800px";
  host.style.height = "600px";
  document.body.appendChild(host);
  return host;
}

describe("PRESETS registry", () => {
  it("ships exactly three named presets", () => {
    const names: PresetName[] = ["default", "linear", "paper"];
    for (const name of names) {
      expect(PRESETS[name]).toBeDefined();
      expect(PRESETS[name].light).toBeDefined();
      expect(PRESETS[name].dark).toBeDefined();
    }
  });

  it("freezes every preset object so embedders cannot mutate the registry", () => {
    expect(Object.isFrozen(PRESETS)).toBe(true);
    expect(Object.isFrozen(PRESETS.default)).toBe(true);
    expect(Object.isFrozen(PRESETS.default.light)).toBe(true);
    expect(Object.isFrozen(PRESETS.linear.dark)).toBe(true);
    expect(Object.isFrozen(PRESETS.paper.light)).toBe(true);
  });

  it("paper preset disables the canvas grid dot", () => {
    expect(PRESETS.paper.light.gridDot).toBe("transparent");
    expect(PRESETS.paper.dark.gridDot).toBe("transparent");
  });
});

describe("preset resolution", () => {
  it("baseline → preset → user partial wins in that order", () => {
    const host = makeHost();
    const handle = createDiagram(host, {
      preset: "linear",
      theme: { accent: "#ec4899" },
    });
    const theme = handle.getTheme();
    expect(theme.accent).toBe("#ec4899");
    expect(theme.background).toBe(PRESETS.linear.light.background);
    handle.destroy();
    host.remove();
  });

  it("setPreset swaps the baseline without clobbering user-supplied accent", () => {
    const host = makeHost();
    const handle = createDiagram(host, {
      preset: "default",
      theme: { accent: "#ec4899" },
    });
    handle.setPreset("paper");
    const theme = handle.getTheme();
    expect(theme.accent).toBe("#ec4899");
    expect(theme.background).toBe(PRESETS.paper.light.background);
    expect(handle.getPreset()).toBe("paper");
    handle.destroy();
    host.remove();
  });

  it("setTheme overlays radius on top without resetting preset or accent", () => {
    const host = makeHost();
    const handle = createDiagram(host, {
      preset: "linear",
      theme: { accent: "#ec4899" },
    });
    handle.setTheme({ borderRadius: 12 });
    const theme = handle.getTheme();
    expect(theme.borderRadius).toBe(12);
    expect(theme.accent).toBe("#ec4899");
    expect(theme.background).toBe(PRESETS.linear.light.background);
    expect(handle.getPreset()).toBe("linear");
    handle.destroy();
    host.remove();
  });

  it("getPreset returns 'default' when no preset configured", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    expect(handle.getPreset()).toBe("default");
    handle.destroy();
    host.remove();
  });

  it("setPreset rejects unknown names with TypeError", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    expect(() => handle.setPreset("nonexistent" as PresetName)).toThrow(TypeError);
    handle.destroy();
    host.remove();
  });

  it("data-preset attribute on host reflects active preset", () => {
    const host = makeHost();
    const handle = createDiagram(host, { preset: "paper" });
    const el = host.querySelector("mining-lib-diagram") as HTMLElement;
    expect(el.getAttribute("data-preset")).toBe("paper");
    handle.setPreset("linear");
    expect(el.getAttribute("data-preset")).toBe("linear");
    handle.destroy();
    host.remove();
  });
});
