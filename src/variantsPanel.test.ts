import { afterEach, describe, expect, it } from "vitest";
import { createVariantsPanel } from "./variantsPanel.js";

function makeHost(): HTMLDivElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return host;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("createVariantsPanel — scaffold", () => {
  it("mounts a <div> with class `mining-lib-variants-panel` and no inner heading", () => {
    const host = makeHost();
    createVariantsPanel(host);
    const div = host.querySelector<HTMLDivElement>("div.mining-lib-variants-panel");
    expect(div).not.toBeNull();
    expect(div?.tagName.toLowerCase()).toBe("div");
    // The popover trigger already says "Variants"; repeating it
    // inside the popover (the old `<summary>Variants</summary>`)
    // was visual noise and got removed.
    expect(div?.querySelector("summary")).toBeNull();
    expect(div?.textContent).not.toContain("Variants");
  });

  it("exposes a `variantHost` div with class `mining-lib-filters-variants-host`", () => {
    const host = makeHost();
    const panel = createVariantsPanel(host);
    expect(panel.variantHost.tagName.toLowerCase()).toBe("div");
    expect(panel.variantHost.classList.contains("mining-lib-filters-variants-host")).toBe(true);
    expect(panel.variantHost.children.length).toBe(0);
  });

  it("sets `part='variants-panel'` for embedder CSS targeting", () => {
    const host = makeHost();
    const panel = createVariantsPanel(host);
    expect(panel.element.getAttribute("part")).toBe("variants-panel");
  });

  it("the variantHost is a descendant of the panel element", () => {
    const host = makeHost();
    const panel = createVariantsPanel(host);
    expect(panel.element.contains(panel.variantHost)).toBe(true);
  });
});

describe("createVariantsPanel — lifecycle", () => {
  it("setHost re-parents the panel without rebuilding it", () => {
    const a = makeHost();
    const b = makeHost();
    const panel = createVariantsPanel(a);
    const ref = panel.element;
    const variantHostRef = panel.variantHost;
    panel.setHost(b);
    expect(b.contains(ref)).toBe(true);
    expect(a.contains(ref)).toBe(false);
    expect(panel.element).toBe(ref);
    expect(panel.variantHost).toBe(variantHostRef);
  });

  it("setHost preserves children mounted into variantHost (variant panel survives the move)", () => {
    const a = makeHost();
    const b = makeHost();
    const panel = createVariantsPanel(a);
    const fakeVariantList = document.createElement("ul");
    fakeVariantList.id = "mock-variant-list";
    panel.variantHost.appendChild(fakeVariantList);
    panel.setHost(b);
    expect(panel.variantHost.contains(fakeVariantList)).toBe(true);
    expect(b.contains(fakeVariantList)).toBe(true);
  });

  it("destroy removes the panel element from the DOM", () => {
    const host = makeHost();
    const panel = createVariantsPanel(host);
    panel.destroy();
    expect(host.querySelector(".mining-lib-variants-panel")).toBeNull();
  });
});
