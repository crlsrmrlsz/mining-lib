import { describe, expect, it } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import { buildDfg } from "./buildDfg.js";
import {
  caseIdExists,
  computeCaseTraceOverlay,
  getCaseSummary,
  getCaseTraceEvents,
  pickAdjacentCaseId,
} from "./caseTrace.js";
import { happyPathEdgeKey } from "./happyPath.js";
import { parseCsv } from "./parseCsv.js";
import type { EventLog } from "./types.js";

const { log: n5Log } = parseCsv(n5Csv);
const n5Dfg = buildDfg(n5Log);

const EMPTY_LOG: EventLog = {
  cases: new Map(),
  events: [],
  schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
};

describe("caseIdExists", () => {
  it("returns true for an existing case", () => {
    expect(caseIdExists(n5Log, "case_0001")).toBe(true);
  });

  it("returns false for a non-existent case", () => {
    expect(caseIdExists(n5Log, "case_99999")).toBe(false);
  });

  it("returns false on an empty log", () => {
    expect(caseIdExists(EMPTY_LOG, "case_0001")).toBe(false);
  });
});

describe("getCaseSummary", () => {
  it("returns null for a non-existent case", () => {
    expect(getCaseSummary(n5Log, "case_99999")).toBeNull();
  });

  it("returns id, eventCount, variantSequence, durationMs for an existing case", () => {
    const summary = getCaseSummary(n5Log, "case_0001");
    expect(summary).not.toBeNull();
    if (!summary) return;
    expect(summary.id).toBe("case_0001");
    expect(summary.eventCount).toBeGreaterThan(0);
    expect(summary.variantSequence).toEqual(["submitted", "intake_validation", "rejected"]);
    expect(summary.durationMs).toBeGreaterThan(0);
  });

  it("durationMs = last.timestamp - first.timestamp", () => {
    const summary = getCaseSummary(n5Log, "case_0001");
    if (!summary) throw new Error("expected case_0001");
    const c = n5Log.cases.get("case_0001");
    if (!c) throw new Error("expected case_0001 in log");
    const first = c.events[0];
    const last = c.events[c.events.length - 1];
    if (!first || !last) throw new Error("expected events");
    expect(summary.durationMs).toBe(last.timestamp.getTime() - first.timestamp.getTime());
  });

  it("variantSequence preserves event order (rework loop duplicates included)", () => {
    // case_0005 is the rework case in n5 (three request_additional_info events).
    const summary = getCaseSummary(n5Log, "case_0005");
    if (!summary) throw new Error("expected case_0005");
    const count = summary.variantSequence.filter((a) => a === "request_additional_info").length;
    expect(count).toBe(3);
  });
});

describe("getCaseTraceEvents", () => {
  it("returns [] for a non-existent case", () => {
    expect(getCaseTraceEvents(n5Log, "case_99999")).toEqual([]);
  });

  it("first event has deltaMs === 0", () => {
    const rows = getCaseTraceEvents(n5Log, "case_0001");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.deltaMs).toBe(0);
  });

  it("subsequent events have deltaMs = ev[i].timestamp - ev[i-1].timestamp", () => {
    const rows = getCaseTraceEvents(n5Log, "case_0001");
    const c = n5Log.cases.get("case_0001");
    if (!c) throw new Error("expected case_0001");
    for (let i = 1; i < rows.length; i += 1) {
      const curr = c.events[i];
      const prev = c.events[i - 1];
      if (!curr || !prev) throw new Error("expected event pair");
      expect(rows[i]?.deltaMs).toBe(curr.timestamp.getTime() - prev.timestamp.getTime());
    }
  });

  it("row.idx is the array index", () => {
    const rows = getCaseTraceEvents(n5Log, "case_0001");
    for (let i = 0; i < rows.length; i += 1) {
      expect(rows[i]?.idx).toBe(i);
    }
  });

  it("row.resource mirrors event.resource (null preserved)", () => {
    const rows = getCaseTraceEvents(n5Log, "case_0001");
    const c = n5Log.cases.get("case_0001");
    if (!c) throw new Error("expected case_0001");
    for (let i = 0; i < rows.length; i += 1) {
      const ev = c.events[i];
      if (!ev) throw new Error("expected event");
      expect(rows[i]?.resource).toBe(ev.resource);
    }
  });
});

describe("computeCaseTraceOverlay", () => {
  it("returns null when the case doesn't exist", () => {
    expect(computeCaseTraceOverlay(n5Dfg, n5Log, "case_99999")).toBeNull();
  });

  it("fadedNodes contains every DFG node NOT visited by the case", () => {
    const overlay = computeCaseTraceOverlay(n5Dfg, n5Log, "case_0001");
    if (!overlay) throw new Error("expected overlay");
    // case_0001's path: submitted → intake_validation → rejected.
    expect(overlay.fadedNodes.has("submitted")).toBe(false);
    expect(overlay.fadedNodes.has("intake_validation")).toBe(false);
    expect(overlay.fadedNodes.has("rejected")).toBe(false);
    // Activities not on case_0001's path should be faded.
    expect(overlay.fadedNodes.has("approved")).toBe(true);
  });

  it("fadedEdges contains every DFG edge NOT traversed by the case", () => {
    const overlay = computeCaseTraceOverlay(n5Dfg, n5Log, "case_0001");
    if (!overlay) throw new Error("expected overlay");
    expect(overlay.fadedEdges.has(happyPathEdgeKey("submitted", "intake_validation"))).toBe(false);
    expect(overlay.fadedEdges.has(happyPathEdgeKey("intake_validation", "rejected"))).toBe(false);
    // case_0001 never traverses intake_validation → assigned_to_reviewer (case_0002+ does).
    expect(
      overlay.fadedEdges.has(happyPathEdgeKey("intake_validation", "assigned_to_reviewer")),
    ).toBe(true);
  });

  it("rework-loop case keeps the loop edge un-faded", () => {
    // case_0005 has the rework loop. Edges in its sequence must NOT be faded.
    const overlay = computeCaseTraceOverlay(n5Dfg, n5Log, "case_0005");
    if (!overlay) throw new Error("expected overlay");
    const c = n5Log.cases.get("case_0005");
    if (!c) throw new Error("expected case_0005");
    for (let i = 0; i < c.events.length - 1; i += 1) {
      const a = c.events[i];
      const b = c.events[i + 1];
      if (!a || !b) throw new Error("expected event pair");
      const key = happyPathEdgeKey(a.activity, b.activity);
      expect(overlay.fadedEdges.has(key)).toBe(false);
    }
  });

  it("single-event fabricated case → empty fadedEdges contribution + on-path is just that node", () => {
    // Fabricate a single-event log + DFG so we can test the degenerate path.
    const single: EventLog = {
      cases: new Map(),
      events: [],
      schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
    };
    const ev = {
      caseId: "c1",
      activity: "a",
      timestamp: new Date(0),
      resource: null,
      lifecycle: "complete",
      attributes: {},
    };
    single.cases.set("c1", { id: "c1", events: [ev], attributes: {} });
    single.events.push(ev);
    const dfg = buildDfg(single);
    const overlay = computeCaseTraceOverlay(dfg, single, "c1");
    if (!overlay) throw new Error("expected overlay");
    expect(overlay.fadedNodes.has("a")).toBe(false);
    expect(overlay.fadedEdges.size).toBe(0);
  });
});

describe("pickAdjacentCaseId", () => {
  it("dir +1 returns the next case in lex order", () => {
    expect(pickAdjacentCaseId(n5Log, "case_0001", 1)).toBe("case_0002");
    expect(pickAdjacentCaseId(n5Log, "case_0003", 1)).toBe("case_0004");
  });

  it("dir -1 returns the previous case in lex order", () => {
    expect(pickAdjacentCaseId(n5Log, "case_0002", -1)).toBe("case_0001");
    expect(pickAdjacentCaseId(n5Log, "case_0005", -1)).toBe("case_0004");
  });

  it("wraps from last to first when dir = +1", () => {
    expect(pickAdjacentCaseId(n5Log, "case_0005", 1)).toBe("case_0001");
  });

  it("wraps from first to last when dir = -1", () => {
    expect(pickAdjacentCaseId(n5Log, "case_0001", -1)).toBe("case_0005");
  });

  it("returns null when the log has 0 cases", () => {
    expect(pickAdjacentCaseId(EMPTY_LOG, "case_0001", 1)).toBeNull();
  });

  it("returns null when the log has 1 case", () => {
    const single: EventLog = {
      cases: new Map([["only", { id: "only", events: [], attributes: {} }]]),
      events: [],
      schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
    };
    expect(pickAdjacentCaseId(single, "only", 1)).toBeNull();
  });

  it("when current ID is not in the log, returns the first case in lex order", () => {
    expect(pickAdjacentCaseId(n5Log, "case_99999", 1)).toBe("case_0001");
  });
});
