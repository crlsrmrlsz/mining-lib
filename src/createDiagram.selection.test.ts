import { afterEach, describe, expect, it, vi } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import { buildDfg } from "./buildDfg.js";
import { createDiagram, type SelectionTarget } from "./index.js";
import { parseCsv } from "./parseCsv.js";

const n5Parse = parseCsv(n5Csv);
const n5Dfg = buildDfg(n5Parse.log);

function makeHost(): HTMLDivElement {
  const host = document.createElement("div");
  host.style.width = "1200px";
  host.style.height = "720px";
  document.body.appendChild(host);
  return host;
}

afterEach(() => {
  for (const el of document.querySelectorAll("mining-lib-diagram")) el.remove();
  for (const el of document.querySelectorAll("div")) el.remove();
});

describe("DiagramHandle selection", () => {
  it("starts with no selection", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Parse.log);
    expect(handle.getSelected()).toBeNull();
    handle.destroy();
  });

  it("select / getSelected round-trip on a node", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Parse.log);
    handle.select({ kind: "node", id: "submitted" });
    expect(handle.getSelected()).toEqual({ kind: "node", id: "submitted" });
    handle.destroy();
  });

  it("select(null) clears", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Parse.log);
    handle.select({ kind: "node", id: "submitted" });
    handle.select(null);
    expect(handle.getSelected()).toBeNull();
    handle.destroy();
  });

  it("dispatches a composed `select` CustomEvent on every change", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Parse.log);
    const el = host.querySelector("mining-lib-diagram") as HTMLElement;
    const events: (SelectionTarget | null)[] = [];
    el.addEventListener("select", (ev) => {
      events.push((ev as CustomEvent<SelectionTarget | null>).detail);
    });
    handle.select({ kind: "edge", id: "submitted→reviewed" });
    handle.select(null);
    expect(events).toEqual([{ kind: "edge", id: "submitted→reviewed" }, null]);
    handle.destroy();
  });

  it("does not dispatch when the same target is selected twice in a row", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Parse.log);
    const el = host.querySelector("mining-lib-diagram") as HTMLElement;
    const spy = vi.fn();
    el.addEventListener("select", spy);
    handle.select({ kind: "node", id: "submitted" });
    handle.select({ kind: "node", id: "submitted" });
    expect(spy).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it("rejects invalid targets with TypeError", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Parse.log);
    expect(() => handle.select({ kind: "edge", id: 42 } as unknown as SelectionTarget)).toThrow(
      TypeError,
    );
    expect(() => handle.select({ kind: "weird", id: "x" } as unknown as SelectionTarget)).toThrow(
      TypeError,
    );
    handle.destroy();
  });

  it("clears selection when a fresh DFG is rendered", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Parse.log);
    handle.select({ kind: "node", id: "submitted" });
    const otherDfg = buildDfg(parseCsv(n5Csv).log);
    handle.render(otherDfg, n5Parse.log);
    expect(handle.getSelected()).toBeNull();
    handle.destroy();
  });

  it("applies .mining-lib-selected to the matching SVG element", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Parse.log);
    handle.select({ kind: "node", id: "submitted" });
    const el = host.querySelector("mining-lib-diagram") as HTMLElement;
    const shadow = el.shadowRoot as ShadowRoot;
    const selected = shadow.querySelectorAll(".mining-lib-selected");
    expect(selected.length).toBe(1);
    expect(selected[0]?.getAttribute("data-activity")).toBe("submitted");
    handle.select(null);
    expect(shadow.querySelectorAll(".mining-lib-selected").length).toBe(0);
    handle.destroy();
  });

  it("re-applies selection class after a count-mode-driven redraw", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Parse.log);
    handle.select({ kind: "node", id: "submitted" });
    handle.setCountMode("case");
    const el = host.querySelector("mining-lib-diagram") as HTMLElement;
    const shadow = el.shadowRoot as ShadowRoot;
    const selected = shadow.querySelector(".mining-lib-selected");
    expect(selected?.getAttribute("data-activity")).toBe("submitted");
    handle.destroy();
  });
});
