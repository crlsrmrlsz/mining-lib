import { afterEach, describe, expect, it } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import { buildDfg } from "./buildDfg.js";
import type { FilterClause } from "./filterClauses.js";
import { createDiagram } from "./index.js";
import { parseCsv } from "./parseCsv.js";

const { log: n5Log } = parseCsv(n5Csv);
const n5Dfg = buildDfg(n5Log);

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

describe("DiagramHandle.setTraceCase / getTraceCase — basics", () => {
  it("round-trips a string through set/get", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    handle.setTraceCase("case_0001");
    expect(handle.getTraceCase()).toBe("case_0001");
    handle.destroy();
  });

  it("null clears the pin", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    handle.setTraceCase("case_0001");
    handle.setTraceCase(null);
    expect(handle.getTraceCase()).toBeNull();
    handle.destroy();
  });

  it("throws TypeError on non-string non-null input", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    expect(() => handle.setTraceCase(42 as unknown as string)).toThrow(TypeError);
    expect(() => handle.setTraceCase("" as unknown as string)).toThrow(TypeError);
    handle.destroy();
  });

  it("default before any call is null", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    expect(handle.getTraceCase()).toBeNull();
    handle.destroy();
  });
});

describe("DiagramHandle.setTraceCase — trace wins over happy-path (D1)", () => {
  it("setting a trace case clears any pinned happy-path variant", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    handle.setHappyPathVariant(["submitted", "intake_validation", "rejected"]);
    expect(handle.getHappyPathVariant()).not.toBeNull();
    handle.setTraceCase("case_0001");
    expect(handle.getHappyPathVariant()).toBeNull();
    expect(handle.getTraceCase()).toBe("case_0001");
    handle.destroy();
  });

  it("setting a happy-path variant does NOT clear an active trace case", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    handle.setTraceCase("case_0001");
    handle.setHappyPathVariant(["submitted", "intake_validation", "rejected"]);
    expect(handle.getTraceCase()).toBe("case_0001");
    handle.destroy();
  });
});

describe("DiagramHandle.setTraceCase — derived from caseId filter clause", () => {
  it("setFilters that replaces away the caseId clause clears the trace pin", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    handle.setTraceCase("case_0001");
    expect(handle.getTraceCase()).toBe("case_0001");
    // After the 2026-05-22 refold the trace pin IS the caseId clause —
    // replacing the clause list with a non-caseId clause naturally
    // clears it (no extra clearStaleTraceCase needed).
    handle.setFilters([{ kind: "node", activity: "request_additional_info" }]);
    expect(handle.getTraceCase()).toBeNull();
    handle.destroy();
  });

  it("setFilters that preserves the caseId clause keeps the trace pin", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    handle.setTraceCase("case_0001");
    // Keep the caseId clause + add a node clause via a manual replace.
    handle.setFilters([
      { kind: "caseId", caseIds: ["case_0001"] },
      { kind: "node", activity: "rejected" },
    ]);
    expect(handle.getTraceCase()).toBe("case_0001");
    handle.destroy();
  });

  it("getTraceCase returns null when the caseId clause has multiple ids", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    handle.setFilters([{ kind: "caseId", caseIds: ["case_0001", "case_0002"] }]);
    expect(handle.getTraceCase()).toBeNull();
    handle.destroy();
  });
});

describe("createDiagram({ traceCase }) — construction-time pin", () => {
  it("honors a valid traceCase config", () => {
    const host = makeHost();
    const handle = createDiagram(host, { traceCase: "case_0001" });
    handle.render(n5Dfg, n5Log);
    expect(handle.getTraceCase()).toBe("case_0001");
    handle.destroy();
  });

  it("auto-clears a traceCase that isn't in the rendered log", () => {
    const host = makeHost();
    const handle = createDiagram(host, { traceCase: "case_99999" });
    handle.render(n5Dfg, n5Log);
    expect(handle.getTraceCase()).toBeNull();
    handle.destroy();
  });
});

describe("Trace panel + Case popover wiring", () => {
  function shadowOf(host: HTMLDivElement): ShadowRoot {
    const el = host.querySelector("mining-lib-diagram") as
      | (HTMLElement & { shadowRoot: ShadowRoot | null })
      | null;
    const shadow = el?.shadowRoot;
    if (!shadow) throw new Error("shadow root not found");
    return shadow;
  }

  it("Trace panel is absent from the DOM when no case is pinned", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    expect(shadowOf(host).querySelector(".mining-lib-trace-panel")).toBeNull();
    handle.destroy();
  });

  it("Trace panel appears in the shadow DOM when a case is pinned", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    handle.setTraceCase("case_0001");
    expect(shadowOf(host).querySelector(".mining-lib-trace-panel")).not.toBeNull();
    handle.destroy();
  });

  it("Trace panel × button clears the pin", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    handle.setTraceCase("case_0001");
    const closeBtn = shadowOf(host).querySelector(".mining-lib-trace-close") as HTMLButtonElement;
    closeBtn.click();
    expect(handle.getTraceCase()).toBeNull();
    handle.destroy();
  });

  it("setTraceCase pushes the caseId clause through setFilters (no separate `Filter to this case` button — case = filter)", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    handle.setTraceCase("case_0001");
    // The trace panel no longer has a Filter-to-this-case button —
    // picking a case IS the filter (Phase 27 2026-05-22 refold).
    expect(shadowOf(host).querySelector(".mining-lib-trace-filter-button")).toBeNull();
    // setTraceCase itself drove the caseId clause through setFilters.
    const filters = handle.getFilters();
    const clause = filters.find((c) => c.kind === "caseId") as
      | Extract<FilterClause, { kind: "caseId" }>
      | undefined;
    expect(clause?.caseIds).toEqual(["case_0001"]);
    handle.destroy();
  });
});
