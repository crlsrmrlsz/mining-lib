import { afterEach, describe, expect, it } from "vitest";
import { reparent } from "./panelHost.js";

afterEach(() => {
  document.body.replaceChildren();
});

function makeDiv(): HTMLDivElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

describe("panelHost.reparent", () => {
  it("moves a node from its current parent to the new host via appendChild", () => {
    const a = makeDiv();
    const b = makeDiv();
    const node = document.createElement("section");
    a.appendChild(node);
    expect(a.contains(node)).toBe(true);
    reparent(node, b);
    expect(a.contains(node)).toBe(false);
    expect(b.contains(node)).toBe(true);
  });

  it("returns the moved node (fluent chaining)", () => {
    const host = makeDiv();
    const node = document.createElement("span");
    expect(reparent(node, host)).toBe(node);
  });

  it("is a no-op when the node is already a child of the host (no error, still attached)", () => {
    const host = makeDiv();
    const node = document.createElement("span");
    host.appendChild(node);
    expect(() => reparent(node, host)).not.toThrow();
    expect(host.contains(node)).toBe(true);
  });

  it("preserves attributes and existing children on the moved node", () => {
    const a = makeDiv();
    const b = makeDiv();
    const node = document.createElement("section");
    node.setAttribute("data-marker", "keep");
    node.classList.add("preserved");
    const child = document.createElement("span");
    child.textContent = "inside";
    node.appendChild(child);
    a.appendChild(node);
    reparent(node, b);
    expect(node.getAttribute("data-marker")).toBe("keep");
    expect(node.classList.contains("preserved")).toBe(true);
    expect(node.contains(child)).toBe(true);
    expect(child.textContent).toBe("inside");
  });
});
