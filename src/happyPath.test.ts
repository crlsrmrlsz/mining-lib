import { describe, expect, test } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import { buildDfg } from "./buildDfg.js";
import { computeHappyPathOverlay, happyPathEdgeKey } from "./happyPath.js";
import { parseCsv } from "./parseCsv.js";
import type { Case, Dfg, Event, EventLog } from "./types.js";

function makeLog(cases: { id: string; activities: string[] }[]): EventLog {
  const eventList: Event[] = [];
  const caseMap = new Map<string, Case>();
  for (const c of cases) {
    const events: Event[] = c.activities.map((activity, i) => ({
      caseId: c.id,
      activity,
      timestamp: new Date(2024, 0, 1, 0, i),
      resource: null,
      lifecycle: "complete",
      attributes: {},
    }));
    eventList.push(...events);
    caseMap.set(c.id, { id: c.id, events, attributes: {} });
  }
  return {
    cases: caseMap,
    events: eventList,
    schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
  };
}

function emptyDfg(): Dfg {
  return { nodes: new Map(), edges: new Map() };
}

describe("computeHappyPathOverlay — degenerate inputs", () => {
  test("empty Dfg, empty sequence → empty sets", () => {
    const { fadedNodes, fadedEdges } = computeHappyPathOverlay(emptyDfg(), []);
    expect(fadedNodes.size).toBe(0);
    expect(fadedEdges.size).toBe(0);
  });

  test("empty sequence over non-empty Dfg → every node and edge faded", () => {
    const dfg = buildDfg(makeLog([{ id: "c1", activities: ["a", "b", "c"] }]));
    const { fadedNodes, fadedEdges } = computeHappyPathOverlay(dfg, []);
    expect(fadedNodes).toEqual(new Set(["a", "b", "c"]));
    expect(fadedEdges).toEqual(new Set([happyPathEdgeKey("a", "b"), happyPathEdgeKey("b", "c")]));
  });

  test("sequence with no DFG overlap → every node and edge faded", () => {
    const dfg = buildDfg(makeLog([{ id: "c1", activities: ["a", "b", "c"] }]));
    const { fadedNodes, fadedEdges } = computeHappyPathOverlay(dfg, ["x", "y"]);
    expect(fadedNodes).toEqual(new Set(["a", "b", "c"]));
    expect(fadedEdges).toEqual(new Set([happyPathEdgeKey("a", "b"), happyPathEdgeKey("b", "c")]));
  });

  test("single-node sequence excludes that node, fades every edge", () => {
    const dfg = buildDfg(
      makeLog([
        { id: "c1", activities: ["a", "b", "c"] },
        { id: "c2", activities: ["a", "c"] },
      ]),
    );
    const { fadedNodes, fadedEdges } = computeHappyPathOverlay(dfg, ["a"]);
    expect(fadedNodes).toEqual(new Set(["b", "c"]));
    expect(fadedEdges).toEqual(
      new Set([happyPathEdgeKey("a", "b"), happyPathEdgeKey("b", "c"), happyPathEdgeKey("a", "c")]),
    );
  });

  test("duplicate consecutive activities mark the self-loop edge as on-path", () => {
    const dfg = buildDfg(makeLog([{ id: "c1", activities: ["a", "a", "b"] }]));
    const { fadedNodes, fadedEdges } = computeHappyPathOverlay(dfg, ["a", "a", "b"]);
    expect(fadedNodes.size).toBe(0);
    expect(fadedEdges.size).toBe(0);
  });

  test("a hole in the sequence yields no malformed edge key (no `undefined` leg)", () => {
    // `noUncheckedIndexedAccess` types `sequence[i]` as `string | undefined`,
    // so the helper guards each pair before keying. A sparse array is the
    // legitimate runtime value that satisfies `readonly string[]` yet reads
    // `undefined` at an in-bounds slot. The guard must skip such a pair so
    // it never emits a bogus key like "a\tundefined" / "undefined\tc" that
    // could never match a real DFG edge.
    const sparse: string[] = ["a", "b", "c"];
    delete sparse[1]; // hole at index 1; length stays 3
    const dfg = buildDfg(makeLog([{ id: "c1", activities: ["a", "b", "c"] }]));
    const { fadedNodes, fadedEdges } = computeHappyPathOverlay(dfg, sparse);

    // "a" and "c" are present in the sequence (so kept), "b" is a hole → faded.
    expect(fadedNodes).toEqual(new Set(["b"]));

    // No on-path edge survives: both candidate pairs touched the hole and
    // were skipped, so the real edges a→b and b→c both fade — and no key
    // mentioning `undefined` was ever produced.
    expect(fadedEdges).toEqual(new Set([happyPathEdgeKey("a", "b"), happyPathEdgeKey("b", "c")]));
    for (const key of fadedEdges) {
      expect(key).not.toContain("undefined");
    }
  });
});

describe("computeHappyPathOverlay — n5 fixture", () => {
  const { log } = parseCsv(n5Csv);
  const dfg = buildDfg(log);

  test("pinning Direct Approval keeps on-path elements bright", () => {
    const directApproval = [
      "submitted",
      "intake_validation",
      "assigned_to_reviewer",
      "review_in_progress",
      "health_inspection",
      "approved",
    ];
    const { fadedNodes, fadedEdges } = computeHappyPathOverlay(dfg, directApproval);

    // None of the path's nodes are faded.
    for (const node of directApproval) {
      expect(fadedNodes.has(node)).toBe(false);
    }
    // Off-path activities (early rejection + request-info loop) are faded.
    expect(fadedNodes.has("rejected")).toBe(true);
    expect(fadedNodes.has("request_additional_info")).toBe(true);
    expect(fadedNodes.has("applicant_provided_info")).toBe(true);

    // None of the 5 on-path edges fade.
    const onPath: Array<[string, string]> = [
      ["submitted", "intake_validation"],
      ["intake_validation", "assigned_to_reviewer"],
      ["assigned_to_reviewer", "review_in_progress"],
      ["review_in_progress", "health_inspection"],
      ["health_inspection", "approved"],
    ];
    for (const [from, to] of onPath) {
      expect(fadedEdges.has(happyPathEdgeKey(from, to))).toBe(false);
    }

    // A few well-known off-path edges from the fixture do fade.
    expect(fadedEdges.has(happyPathEdgeKey("intake_validation", "rejected"))).toBe(true);
    expect(fadedEdges.has(happyPathEdgeKey("health_inspection", "rejected"))).toBe(true);
    expect(fadedEdges.has(happyPathEdgeKey("review_in_progress", "request_additional_info"))).toBe(
      true,
    );
  });

  test("bypass edge between two on-path nodes still fades (variant-edge precision)", () => {
    // Construct a DFG with a shortcut edge a→c alongside the on-path
    // sequence a→b→c. Pinning a→b→c keeps the spine bright but fades
    // the bypass a→c — the precision the spec calls out (D3).
    const dfg = buildDfg(
      makeLog([
        { id: "c1", activities: ["a", "b", "c"] },
        { id: "c2", activities: ["a", "c"] },
      ]),
    );
    const { fadedEdges } = computeHappyPathOverlay(dfg, ["a", "b", "c"]);
    expect(fadedEdges.has(happyPathEdgeKey("a", "b"))).toBe(false);
    expect(fadedEdges.has(happyPathEdgeKey("b", "c"))).toBe(false);
    expect(fadedEdges.has(happyPathEdgeKey("a", "c"))).toBe(true);
  });

  test("repeat calls return fresh Sets — caller can mutate without aliasing", () => {
    const a = computeHappyPathOverlay(dfg, ["submitted"]);
    const b = computeHappyPathOverlay(dfg, ["submitted"]);
    expect(a.fadedNodes).not.toBe(b.fadedNodes);
    expect(a.fadedEdges).not.toBe(b.fadedEdges);
    a.fadedNodes.clear();
    expect(b.fadedNodes.size).toBeGreaterThan(0);
  });
});

describe("happyPathEdgeKey", () => {
  test("uses a tab separator so concatenated activities cannot collide", () => {
    // Without a separator, ("ab","c") and ("a","bc") would collide; the
    // tab guarantees they do not. This is the key contract the renderer
    // relies on when checking edge membership against the fadedEdges Set.
    expect(happyPathEdgeKey("ab", "c")).not.toBe(happyPathEdgeKey("a", "bc"));
  });
});
