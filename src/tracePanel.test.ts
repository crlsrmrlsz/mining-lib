import { describe, expect, it } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import { parseCsv } from "./parseCsv.js";
import { createTracePanel, type TracePanelHooks } from "./tracePanel.js";

const { log: n5Log } = parseCsv(n5Csv);

function mountFixture(opts: { caseId: string | null }): {
  root: HTMLDivElement;
  hooks: TracePanelHooks;
  events: {
    closeCalls: number;
    rowHoverCalls: Array<number | null>;
  };
  setCaseId(id: string | null): void;
  getCaseIdRef(): { current: string | null };
} {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const caseIdRef: { current: string | null } = { current: opts.caseId };
  const events = {
    closeCalls: 0,
    rowHoverCalls: [] as Array<number | null>,
  };
  const hooks: TracePanelHooks = {
    getCaseId: () => caseIdRef.current,
    getLog: () => n5Log,
    onClose: () => {
      events.closeCalls += 1;
    },
    onRowHover: (idx) => {
      events.rowHoverCalls.push(idx);
    },
  };
  return {
    root,
    hooks,
    events,
    setCaseId(id) {
      caseIdRef.current = id;
    },
    getCaseIdRef: () => caseIdRef,
  };
}

describe("createTracePanel — construction + lifecycle", () => {
  it("constructs an element with the trace-panel class", () => {
    const fx = mountFixture({ caseId: null });
    const panel = createTracePanel({ root: fx.root, hooks: fx.hooks });
    expect(panel.element).toBeInstanceOf(HTMLElement);
    expect(panel.element.classList.contains("mining-lib-trace-panel")).toBe(true);
    panel.destroy();
  });

  it("element is not in the DOM when getCaseId() === null after update()", () => {
    const fx = mountFixture({ caseId: null });
    const panel = createTracePanel({ root: fx.root, hooks: fx.hooks });
    panel.update();
    expect(fx.root.contains(panel.element)).toBe(false);
    panel.destroy();
  });

  it("element mounts into root when getCaseId() returns a valid id", () => {
    const fx = mountFixture({ caseId: "case_0001" });
    const panel = createTracePanel({ root: fx.root, hooks: fx.hooks });
    panel.update();
    expect(fx.root.contains(panel.element)).toBe(true);
    panel.destroy();
  });

  it("destroy() removes the element from the DOM", () => {
    const fx = mountFixture({ caseId: "case_0001" });
    const panel = createTracePanel({ root: fx.root, hooks: fx.hooks });
    panel.update();
    panel.destroy();
    expect(fx.root.contains(panel.element)).toBe(false);
  });
});

describe("createTracePanel — header", () => {
  it("renders case ID, total duration, event count, variant signature", () => {
    const fx = mountFixture({ caseId: "case_0001" });
    const panel = createTracePanel({ root: fx.root, hooks: fx.hooks });
    panel.update();
    const header = panel.element.querySelector(".mining-lib-trace-header");
    expect(header).not.toBeNull();
    const caseIdSpan = panel.element.querySelector(".mining-lib-trace-case-id");
    expect(caseIdSpan?.textContent).toBe("case_0001");
    const meta = panel.element.querySelector(".mining-lib-trace-meta");
    expect(meta?.textContent).toContain("3 events");
    const variant = panel.element.querySelector(".mining-lib-trace-variant");
    // Activities in case_0001's sequence, joined by →
    expect(variant?.textContent).toContain("submitted");
    expect(variant?.textContent).toContain("→");
    panel.destroy();
  });

  it("Close button click fires onClose", () => {
    const fx = mountFixture({ caseId: "case_0001" });
    const panel = createTracePanel({ root: fx.root, hooks: fx.hooks });
    panel.update();
    const closeBtn = panel.element.querySelector(".mining-lib-trace-close") as HTMLButtonElement;
    closeBtn.click();
    expect(fx.events.closeCalls).toBe(1);
    panel.destroy();
  });
});

describe("createTracePanel — rows", () => {
  it("renders one row per event in chronological order", () => {
    const fx = mountFixture({ caseId: "case_0001" });
    const panel = createTracePanel({ root: fx.root, hooks: fx.hooks });
    panel.update();
    const rows = panel.element.querySelectorAll(".mining-lib-trace-row");
    expect(rows.length).toBe(3); // case_0001 has 3 events
    expect((rows[0] as HTMLElement).dataset.activity).toBe("submitted");
    expect((rows[1] as HTMLElement).dataset.activity).toBe("intake_validation");
    expect((rows[2] as HTMLElement).dataset.activity).toBe("rejected");
    panel.destroy();
  });

  it("first row has no Δ (no .mining-lib-trace-delta or empty text)", () => {
    const fx = mountFixture({ caseId: "case_0001" });
    const panel = createTracePanel({ root: fx.root, hooks: fx.hooks });
    panel.update();
    const firstRow = panel.element.querySelector(".mining-lib-trace-row");
    const delta = firstRow?.querySelector(".mining-lib-trace-delta");
    expect(delta?.textContent ?? "").toBe("");
    panel.destroy();
  });

  it("subsequent rows show Δ from previous event", () => {
    const fx = mountFixture({ caseId: "case_0001" });
    const panel = createTracePanel({ root: fx.root, hooks: fx.hooks });
    panel.update();
    const rows = panel.element.querySelectorAll(".mining-lib-trace-row");
    const secondDelta = rows[1]?.querySelector(".mining-lib-trace-delta");
    expect(secondDelta?.textContent ?? "").not.toBe("");
    panel.destroy();
  });

  it("row contains data-event-idx", () => {
    const fx = mountFixture({ caseId: "case_0001" });
    const panel = createTracePanel({ root: fx.root, hooks: fx.hooks });
    panel.update();
    const rows = panel.element.querySelectorAll(".mining-lib-trace-row");
    rows.forEach((r, i) => {
      expect((r as HTMLElement).dataset.eventIdx).toBe(String(i));
    });
    panel.destroy();
  });

  it("row shows resource suffix when event.resource !== null", () => {
    // case_0001 event 1 (intake_validation) has resource clerk_002 per the fixture.
    const fx = mountFixture({ caseId: "case_0001" });
    const panel = createTracePanel({ root: fx.root, hooks: fx.hooks });
    panel.update();
    const rows = panel.element.querySelectorAll(".mining-lib-trace-row");
    const activityCell = rows[1]?.querySelector(".mining-lib-trace-activity");
    expect(activityCell?.textContent ?? "").toContain("clerk_002");
    panel.destroy();
  });

  it("row hover fires onRowHover(idx); leave fires onRowHover(null)", () => {
    const fx = mountFixture({ caseId: "case_0001" });
    const panel = createTracePanel({ root: fx.root, hooks: fx.hooks });
    panel.update();
    const rows = panel.element.querySelectorAll(".mining-lib-trace-row");
    const row = rows[1] as HTMLElement;
    row.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    expect(fx.events.rowHoverCalls).toContain(1);
    row.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    expect(fx.events.rowHoverCalls[fx.events.rowHoverCalls.length - 1]).toBeNull();
    panel.destroy();
  });
});

describe("createTracePanel — highlight API", () => {
  it("highlightActivity(activity) adds .mining-lib-trace-row-hover to matching rows", () => {
    const fx = mountFixture({ caseId: "case_0005" }); // rework case
    const panel = createTracePanel({ root: fx.root, hooks: fx.hooks });
    panel.update();
    panel.highlightActivity("request_additional_info");
    const highlighted = panel.element.querySelectorAll(
      ".mining-lib-trace-row.mining-lib-trace-row-hover",
    );
    // case_0005 has three request_additional_info events
    expect(highlighted.length).toBe(3);
    panel.destroy();
  });

  it("highlightActivity(null) clears the highlight class from all rows", () => {
    const fx = mountFixture({ caseId: "case_0005" });
    const panel = createTracePanel({ root: fx.root, hooks: fx.hooks });
    panel.update();
    panel.highlightActivity("request_additional_info");
    panel.highlightActivity(null);
    const highlighted = panel.element.querySelectorAll(
      ".mining-lib-trace-row.mining-lib-trace-row-hover",
    );
    expect(highlighted.length).toBe(0);
    panel.destroy();
  });

  it("highlightEdge(from, to) highlights the row whose transition matches", () => {
    const fx = mountFixture({ caseId: "case_0001" });
    const panel = createTracePanel({ root: fx.root, hooks: fx.hooks });
    panel.update();
    // case_0001 = submitted → intake_validation → rejected.
    // Edge submitted → intake_validation lands on row idx=1 (the destination).
    panel.highlightEdge("submitted", "intake_validation");
    const highlighted = panel.element.querySelectorAll(
      ".mining-lib-trace-row.mining-lib-trace-row-hover",
    );
    expect(highlighted.length).toBe(1);
    expect((highlighted[0] as HTMLElement).dataset.eventIdx).toBe("1");
    panel.destroy();
  });

  it("highlightEdge(null, null) clears", () => {
    const fx = mountFixture({ caseId: "case_0001" });
    const panel = createTracePanel({ root: fx.root, hooks: fx.hooks });
    panel.update();
    panel.highlightEdge("submitted", "intake_validation");
    panel.highlightEdge(null, null);
    const highlighted = panel.element.querySelectorAll(
      ".mining-lib-trace-row.mining-lib-trace-row-hover",
    );
    expect(highlighted.length).toBe(0);
    panel.destroy();
  });
});

describe("createTracePanel — update() rebuild", () => {
  it("swapping case id rebuilds rows", () => {
    const fx = mountFixture({ caseId: "case_0001" });
    const panel = createTracePanel({ root: fx.root, hooks: fx.hooks });
    panel.update();
    expect(panel.element.querySelectorAll(".mining-lib-trace-row").length).toBe(3);
    fx.setCaseId("case_0005"); // rework case has more events
    panel.update();
    const rowsAfter = panel.element.querySelectorAll(".mining-lib-trace-row");
    expect(rowsAfter.length).toBeGreaterThan(3);
    panel.destroy();
  });

  it("setting case id to null between renders removes the element from the DOM", () => {
    const fx = mountFixture({ caseId: "case_0001" });
    const panel = createTracePanel({ root: fx.root, hooks: fx.hooks });
    panel.update();
    expect(fx.root.contains(panel.element)).toBe(true);
    fx.setCaseId(null);
    panel.update();
    expect(fx.root.contains(panel.element)).toBe(false);
    panel.destroy();
  });

  it("missing case in log: element does not mount, no error thrown", () => {
    const fx = mountFixture({ caseId: "case_99999" });
    const panel = createTracePanel({ root: fx.root, hooks: fx.hooks });
    expect(() => panel.update()).not.toThrow();
    expect(fx.root.contains(panel.element)).toBe(false);
    panel.destroy();
  });
});
