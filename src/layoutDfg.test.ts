import { describe, expect, test } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import { buildDfg } from "./buildDfg.js";
import type { TerminalNodeDuration } from "./caseDuration.js";
import {
  applyEdgeOverrides,
  applyPositionOverrides,
  type DfgLayout,
  type EdgeLayout,
  edgeLabelPosition,
  endpointOnNode,
  layoutDfg,
  type NodeLayout,
  pickCount,
} from "./layoutDfg.js";
import { parseCsv } from "./parseCsv.js";
import { LIGHT_DEFAULTS, resolveTheme } from "./theme.js";
import type { CountMode, Dfg, EdgeStats, NodeStats } from "./types.js";

const { log } = parseCsv(n5Csv);
const dfg = buildDfg(log);

describe("layoutDfg — n5 fixture happy path", () => {
  test("returns 9 nodes and 10 edges matching the Dfg", () => {
    const layout = layoutDfg(dfg);
    expect(layout.nodes).toHaveLength(9);
    expect(layout.edges).toHaveLength(10);
  });

  test("every node has width >= 120 and height in [36, 64]", () => {
    const layout = layoutDfg(dfg);
    for (const node of layout.nodes) {
      expect(node.width).toBeGreaterThanOrEqual(120);
      expect(node.height).toBeGreaterThanOrEqual(36);
      expect(node.height).toBeLessThanOrEqual(64);
    }
  });

  test("layout exposes positive width and height for the whole graph", () => {
    const layout = layoutDfg(dfg);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });

  test("every node has non-negative x and y coordinates", () => {
    const layout = layoutDfg(dfg);
    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
    }
  });

  test("every edge has at least two points", () => {
    const layout = layoutDfg(dfg);
    for (const edge of layout.edges) {
      expect(edge.points.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("layoutDfg — frequency scaling", () => {
  test("node height delta matches maxNodeHeight - minNodeHeight (28 px) across case-frequency extremes", () => {
    // Height encodes case frequency (a fixed metric) so the layout is stable
    // across count modes; the extremes span the full [36, 64] range.
    const layout = layoutDfg(dfg);
    const maxFreqNode = layout.nodes.reduce((a, b) => (a.caseFrequency >= b.caseFrequency ? a : b));
    const minFreqNode = layout.nodes.reduce((a, b) => (a.caseFrequency <= b.caseFrequency ? a : b));
    expect(maxFreqNode.height - minFreqNode.height).toBeCloseTo(64 - 36, 0);
  });

  test("edge stroke delta matches maxEdgeStroke - minEdgeStroke (5 px)", () => {
    const layout = layoutDfg(dfg);
    const maxFreqEdge = layout.edges.reduce((a, b) =>
      a.absoluteFrequency >= b.absoluteFrequency ? a : b,
    );
    const minFreqEdge = layout.edges.reduce((a, b) =>
      a.absoluteFrequency <= b.absoluteFrequency ? a : b,
    );
    expect(maxFreqEdge.strokeWidth - minFreqEdge.strokeWidth).toBeCloseTo(6 - 1, 0);
  });

  test("singleton DFG picks maxNodeHeight via the zero-width-domain short-circuit", () => {
    const singleton: Dfg = {
      nodes: new Map<string, NodeStats>([
        [
          "only",
          {
            activity: "only",
            absoluteFrequency: 1,
            caseFrequency: 1,
            maxRepetitions: 1,
            meanRepetitions: 1,
          },
        ],
      ]),
      edges: new Map<string, EdgeStats>(),
    };
    const layout = layoutDfg(singleton);
    expect(layout.nodes).toHaveLength(1);
    expect(layout.edges).toHaveLength(0);
    expect(layout.nodes[0]?.height).toBe(64);
  });
});

describe("layoutDfg — count modes", () => {
  test("default layout exposes countMode 'absolute' and projects all four aggregates per node", () => {
    const layout = layoutDfg(dfg);
    expect(layout.countMode).toBe("absolute");
    const review = layout.nodes.find((n) => n.activity === "review_in_progress");
    expect(review).toBeDefined();
    expect(review?.absoluteFrequency).toBe(7);
    expect(review?.caseFrequency).toBe(4);
    expect(review?.maxRepetitions).toBe(4);
    expect(review?.meanRepetitions).toBe(1.75);
  });

  test("passing countMode 'case' sets layout.countMode to 'case'", () => {
    const layout = layoutDfg(dfg, { countMode: "case" });
    expect(layout.countMode).toBe("case");
  });

  test("review_in_progress height is identical on 'case' and 'absolute' (geometry is mode-invariant)", () => {
    const absoluteLayout = layoutDfg(dfg, { countMode: "absolute" });
    const caseLayout = layoutDfg(dfg, { countMode: "case" });
    const reviewAbs = absoluteLayout.nodes.find((n) => n.activity === "review_in_progress");
    const reviewCase = caseLayout.nodes.find((n) => n.activity === "review_in_progress");
    expect(reviewAbs?.height).toBeDefined();
    expect(reviewCase?.height).toBeDefined();
    expect(reviewCase?.height).toBe(reviewAbs?.height);
  });

  test("rework-back edge strokeWidth on 'case' is strictly less than on 'absolute'", () => {
    const absoluteLayout = layoutDfg(dfg, { countMode: "absolute" });
    const caseLayout = layoutDfg(dfg, { countMode: "case" });
    const reworkAbs = absoluteLayout.edges.find(
      (e) => e.from === "review_in_progress" && e.to === "request_additional_info",
    );
    const reworkCase = caseLayout.edges.find(
      (e) => e.from === "review_in_progress" && e.to === "request_additional_info",
    );
    expect(reworkAbs?.strokeWidth).toBeDefined();
    expect(reworkCase?.strokeWidth).toBeDefined();
    expect(reworkCase?.strokeWidth).toBeLessThan(reworkAbs?.strokeWidth ?? 0);
  });
});

describe("layoutDfg — geometry stable across count modes", () => {
  const ALL_MODES: CountMode[] = [
    "absolute",
    "case",
    "maxRepetitions",
    "meanRepetitions",
    "meanDuration",
    "medianDuration",
  ];
  const geometry = (layout: DfgLayout) =>
    layout.nodes.map((n) => ({
      activity: n.activity,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
    }));

  test("node position and size are identical regardless of countMode", () => {
    const baseline = geometry(layoutDfg(dfg, { countMode: "absolute" }));
    for (const mode of ALL_MODES) {
      expect(geometry(layoutDfg(dfg, { countMode: mode }))).toEqual(baseline);
    }
  });

  test("overall graph width and height do not change with countMode", () => {
    const base = layoutDfg(dfg, { countMode: "absolute" });
    const timed = layoutDfg(dfg, { countMode: "meanDuration" });
    expect(timed.width).toBe(base.width);
    expect(timed.height).toBe(base.height);
  });
});

describe("layoutDfg — Phase 17 duration modes", () => {
  // Synthetic Dfg with three nodes and known durations for deterministic
  // assertions on derived per-node time.
  function makeStubNode(activity: string): NodeStats {
    return {
      activity,
      absoluteFrequency: 1,
      caseFrequency: 1,
      maxRepetitions: 1,
      meanRepetitions: 1,
    };
  }
  function makeStubEdge(from: string, to: string, mean: number, median: number): EdgeStats {
    return {
      from,
      to,
      absoluteFrequency: 1,
      caseFrequency: 1,
      maxRepetitions: 1,
      meanRepetitions: 1,
      durationMs: { mean, median, min: mean, max: mean },
    };
  }
  function makeDurationDfg(): Dfg {
    const nodes = new Map<string, NodeStats>([
      ["start", makeStubNode("start")],
      ["mid", makeStubNode("mid")],
      ["end", makeStubNode("end")],
    ]);
    // start -> mid (mean=1000), start -> end (mean=3000); mid -> end (mean=5000); end has no outgoing.
    const edges = new Map<string, EdgeStats>([
      ["start->mid", makeStubEdge("start", "mid", 1000, 800)],
      ["start->end", makeStubEdge("start", "end", 3000, 2200)],
      ["mid->end", makeStubEdge("mid", "end", 5000, 4500)],
    ]);
    return { nodes, edges };
  }

  test("countMode 'meanDuration' surfaces durationMs.mean as edge metricValue", () => {
    const dfg2 = makeDurationDfg();
    const layout = layoutDfg(dfg2, { countMode: "meanDuration" });
    expect(layout.countMode).toBe("meanDuration");
    const startMid = layout.edges.find((e) => e.from === "start" && e.to === "mid");
    expect(startMid?.metricValue).toBe(1000);
    const midEnd = layout.edges.find((e) => e.from === "mid" && e.to === "end");
    expect(midEnd?.metricValue).toBe(5000);
  });

  test("countMode 'medianDuration' surfaces durationMs.median as edge metricValue", () => {
    const dfg2 = makeDurationDfg();
    const layout = layoutDfg(dfg2, { countMode: "medianDuration" });
    const startMid = layout.edges.find((e) => e.from === "start" && e.to === "mid");
    expect(startMid?.metricValue).toBe(800);
  });

  test("derived node metricValue in 'meanDuration' = mean of outgoing-edge means", () => {
    const dfg2 = makeDurationDfg();
    const layout = layoutDfg(dfg2, { countMode: "meanDuration" });
    // start has two outgoing edges: 1000 and 3000 → mean = 2000.
    const start = layout.nodes.find((n) => n.activity === "start");
    expect(start?.metricValue).toBe(2000);
    // mid has one outgoing: 5000 → mean = 5000.
    const mid = layout.nodes.find((n) => n.activity === "mid");
    expect(mid?.metricValue).toBe(5000);
  });

  test("terminal node (no outgoing edges) gets metricValue 0 in duration mode", () => {
    const dfg2 = makeDurationDfg();
    const layout = layoutDfg(dfg2, { countMode: "meanDuration" });
    const end = layout.nodes.find((n) => n.activity === "end");
    expect(end?.metricValue).toBe(0);
  });

  test("derived node metricValue in 'medianDuration' = mean of outgoing-edge medians", () => {
    const dfg2 = makeDurationDfg();
    const layout = layoutDfg(dfg2, { countMode: "medianDuration" });
    // start outgoing medians: 800, 2200 → mean = 1500.
    const start = layout.nodes.find((n) => n.activity === "start");
    expect(start?.metricValue).toBe(1500);
  });

  test("frequency modes still populate metricValue from the matching field", () => {
    const layout = layoutDfg(dfg, { countMode: "absolute" });
    const node0 = layout.nodes[0];
    expect(node0?.metricValue).toBe(node0?.absoluteFrequency);
    const edge0 = layout.edges[0];
    expect(edge0?.metricValue).toBe(edge0?.absoluteFrequency);
  });
});

describe("layoutDfg — pickCount duration fallback", () => {
  test("'meanDuration' on a count-bearing record without durationMs falls back to 0", () => {
    const noDuration = {
      absoluteFrequency: 5,
      caseFrequency: 3,
      maxRepetitions: 2,
      meanRepetitions: 1,
    };
    expect(pickCount("meanDuration", noDuration)).toBe(0);
  });

  test("'medianDuration' on a count-bearing record without durationMs falls back to 0", () => {
    const noDuration = {
      absoluteFrequency: 5,
      caseFrequency: 3,
      maxRepetitions: 2,
      meanRepetitions: 1,
    };
    expect(pickCount("medianDuration", noDuration)).toBe(0);
  });

  test("'meanDuration'/'medianDuration' return the present durationMs fields when supplied", () => {
    const withDuration = {
      absoluteFrequency: 5,
      caseFrequency: 3,
      maxRepetitions: 2,
      meanRepetitions: 1,
      durationMs: { mean: 1200, median: 900, min: 100, max: 5000 },
    };
    expect(pickCount("meanDuration", withDuration)).toBe(1200);
    expect(pickCount("medianDuration", withDuration)).toBe(900);
  });
});

describe("layoutDfg — order preservation", () => {
  test("layout.nodes preserves Dfg.nodes Map insertion order", () => {
    const layout = layoutDfg(dfg);
    expect(layout.nodes.map((n) => n.activity)).toEqual([...dfg.nodes.keys()]);
  });

  test("layout.edges preserves Dfg.edges Map insertion order", () => {
    const layout = layoutDfg(dfg);
    const expected = [...dfg.edges.values()].map((e) => `${e.from}->${e.to}`);
    const actual = layout.edges.map((e) => `${e.from}->${e.to}`);
    expect(actual).toEqual(expected);
  });
});

function makeNode(activity: string, x: number, y: number): NodeLayout {
  return {
    activity,
    absoluteFrequency: 1,
    caseFrequency: 1,
    maxRepetitions: 1,
    meanRepetitions: 1,
    metricValue: 1,
    x,
    y,
    width: 120,
    height: 40,
  };
}

function makeEdge(from: string, to: string, points: { x: number; y: number }[]): EdgeLayout {
  return {
    from,
    to,
    absoluteFrequency: 1,
    caseFrequency: 1,
    maxRepetitions: 1,
    meanRepetitions: 1,
    metricValue: 1,
    points,
    strokeWidth: 1,
  };
}

function makeLayout(): DfgLayout {
  return {
    nodes: [makeNode("A", 100, 100), makeNode("B", 300, 100), makeNode("C", 500, 200)],
    edges: [
      makeEdge("A", "B", [
        { x: 100, y: 100 },
        { x: 200, y: 50 },
        { x: 300, y: 100 },
      ]),
      makeEdge("B", "C", [
        { x: 300, y: 100 },
        { x: 400, y: 150 },
        { x: 500, y: 200 },
      ]),
    ],
    width: 600,
    height: 300,
    countMode: "absolute",
  };
}

describe("layoutDfg — applyPositionOverrides", () => {
  test("empty overrides map returns input layout unchanged", () => {
    const layout = makeLayout();
    const result = applyPositionOverrides(layout, new Map());
    expect(result.nodes).toEqual(layout.nodes);
    expect(result.edges).toEqual(layout.edges);
    expect(result.width).toBe(layout.width);
    expect(result.height).toBe(layout.height);
    expect(result.countMode).toBe(layout.countMode);
  });

  test("single-node override shifts the node and replaces only the matching endpoint", () => {
    const layout = makeLayout();
    const originalAB = layout.edges[0]?.points;
    const originalBC = layout.edges[1]?.points;
    const result = applyPositionOverrides(layout, new Map([["A", { x: 50, y: 250 }]]));

    const a = result.nodes.find((n) => n.activity === "A");
    expect(a?.x).toBe(50);
    expect(a?.y).toBe(250);
    expect(a?.width).toBe(120);
    expect(a?.height).toBe(40);

    const b = result.nodes.find((n) => n.activity === "B");
    expect(b?.x).toBe(300);
    expect(b?.y).toBe(100);

    // A→B: points[0] replaced with new-A, middle bend + end unchanged.
    const ab = result.edges.find((e) => e.from === "A" && e.to === "B");
    expect(ab?.points).toEqual([{ x: 50, y: 250 }, originalAB?.[1], originalAB?.[2]]);

    // B→C: unchanged (A isn't an endpoint).
    const bc = result.edges.find((e) => e.from === "B" && e.to === "C");
    expect(bc?.points).toEqual(originalBC);
  });

  test("override keyed by unknown activity is silently ignored", () => {
    const layout = makeLayout();
    const result = applyPositionOverrides(layout, new Map([["Ghost", { x: 0, y: 0 }]]));
    expect(result.nodes).toEqual(layout.nodes);
    expect(result.edges).toEqual(layout.edges);
  });

  test("overrides on both endpoints replace both ends, middle bends preserved", () => {
    const layout = makeLayout();
    const originalMid = layout.edges[0]?.points[1];
    const result = applyPositionOverrides(
      layout,
      new Map([
        ["A", { x: 10, y: 20 }],
        ["B", { x: 400, y: 400 }],
      ]),
    );
    const ab = result.edges.find((e) => e.from === "A" && e.to === "B");
    expect(ab?.points).toEqual([{ x: 10, y: 20 }, originalMid, { x: 400, y: 400 }]);
  });

  test("override returns a fresh edge object; input layout is not mutated", () => {
    const layout = makeLayout();
    const originalABPoints = layout.edges[0]?.points;
    applyPositionOverrides(layout, new Map([["A", { x: 50, y: 250 }]]));
    expect(layout.edges[0]?.points).toBe(originalABPoints);
    expect(layout.edges[0]?.points[0]).toEqual({ x: 100, y: 100 });
  });

  test("edge whose endpoint has no matching node is returned untouched", () => {
    // A is a real node and is overridden, but the edge points at "Ghost",
    // which has no NodeLayout → byActivity.get('Ghost') is undefined →
    // the edge is returned as-is even though A moved.
    const layout: DfgLayout = {
      nodes: [makeNode("A", 100, 100)],
      edges: [
        makeEdge("A", "Ghost", [
          { x: 100, y: 100 },
          { x: 300, y: 100 },
        ]),
      ],
      width: 400,
      height: 200,
      countMode: "absolute",
    };
    const originalEdge = layout.edges[0];
    const result = applyPositionOverrides(layout, new Map([["A", { x: 50, y: 250 }]]));
    // Node A still moves...
    expect(result.nodes.find((n) => n.activity === "A")?.x).toBe(50);
    // ...but the dangling edge is returned by reference, points unchanged.
    expect(result.edges[0]).toBe(originalEdge);
    expect(result.edges[0]?.points).toEqual([
      { x: 100, y: 100 },
      { x: 300, y: 100 },
    ]);
  });

  test("overridden endpoint on an edge with no points leaves the (empty) points alone", () => {
    // from + to both resolve to nodes, A is overridden, but points is empty
    // so the `points.length >= 1` guards skip the endpoint rewrites.
    const layout: DfgLayout = {
      nodes: [makeNode("A", 100, 100), makeNode("B", 300, 100)],
      edges: [makeEdge("A", "B", [])],
      width: 400,
      height: 200,
      countMode: "absolute",
    };
    const result = applyPositionOverrides(layout, new Map([["A", { x: 50, y: 250 }]]));
    expect(result.nodes.find((n) => n.activity === "A")?.x).toBe(50);
    const ab = result.edges.find((e) => e.from === "A" && e.to === "B");
    expect(ab?.points).toEqual([]);
  });
});

describe("layoutDfg — applyEdgeOverrides", () => {
  test("empty overrides map returns input layout unchanged by reference", () => {
    const layout = makeLayout();
    const result = applyEdgeOverrides(layout, new Map());
    expect(result).toBe(layout);
  });

  test("single-edge override replaces that edge's points with a defensive copy", () => {
    const layout = makeLayout();
    const originalBC = layout.edges[1];
    const overridePoints = [
      { x: 110, y: 110 },
      { x: 220, y: 60 },
      { x: 310, y: 110 },
    ];
    const result = applyEdgeOverrides(layout, new Map([["A→B", overridePoints]]));

    const ab = result.edges.find((e) => e.from === "A" && e.to === "B");
    expect(ab?.points).toEqual(overridePoints);
    expect(ab?.points).not.toBe(overridePoints);

    const bc = result.edges.find((e) => e.from === "B" && e.to === "C");
    expect(bc).toBe(originalBC);

    expect(result.nodes).toBe(layout.nodes);
    expect(result.width).toBe(layout.width);
    expect(result.height).toBe(layout.height);
    expect(result.countMode).toBe(layout.countMode);
  });

  test("override keyed by an unknown edge is silently ignored", () => {
    const layout = makeLayout();
    const result = applyEdgeOverrides(layout, new Map([["Ghost→Phantom", [{ x: 0, y: 0 }]]]));
    expect(result).toBe(layout);
  });

  test("overrides on multiple edges replace all matching edges", () => {
    const layout = makeLayout();
    const overrideAB = [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ];
    const overrideBC = [
      { x: 3, y: 3 },
      { x: 4, y: 4 },
      { x: 5, y: 5 },
    ];
    const result = applyEdgeOverrides(
      layout,
      new Map([
        ["A→B", overrideAB],
        ["B→C", overrideBC],
      ]),
    );
    const ab = result.edges.find((e) => e.from === "A" && e.to === "B");
    const bc = result.edges.find((e) => e.from === "B" && e.to === "C");
    expect(ab?.points).toEqual(overrideAB);
    expect(bc?.points).toEqual(overrideBC);
  });
});

describe("layoutDfg — endpointOnNode", () => {
  const node = { x: 100, y: 100, width: 120, height: 40 };

  test("inset=0 returns the node border point toward the given direction (rightward)", () => {
    const p = endpointOnNode(node, { x: 500, y: 100 }, 0);
    // rightward: border is at x = 100 + halfW = 160; y stays at 100.
    expect(p.x).toBeCloseTo(160, 3);
    expect(p.y).toBeCloseTo(100, 3);
  });

  test("inset=0 returns the node border point toward the given direction (downward)", () => {
    const p = endpointOnNode(node, { x: 100, y: 500 }, 0);
    // downward: border is at y = 100 + halfH = 120; x stays at 100.
    expect(p.x).toBeCloseTo(100, 3);
    expect(p.y).toBeCloseTo(120, 3);
  });

  test("inset>0 pushes the point further along the ray (arrow anchor, outward)", () => {
    const p = endpointOnNode(node, { x: 500, y: 100 }, 10);
    // rightward + 10 extra: x = 100 + 60 + 10 = 170.
    expect(p.x).toBeCloseTo(170, 3);
    expect(p.y).toBeCloseTo(100, 3);
  });

  test("zero-length ray (toward === centre) returns the node centre", () => {
    const p = endpointOnNode(node, { x: 100, y: 100 }, 10);
    expect(p.x).toBe(100);
    expect(p.y).toBe(100);
  });
});

describe("layoutDfg — theme-driven defaults", () => {
  test("node sizing scales with theme.nodePadding", () => {
    const tight = layoutDfg(dfg, { theme: resolveTheme({ nodePadding: 16 }) });
    const loose = layoutDfg(dfg, { theme: resolveTheme({ nodePadding: 32 }) });
    let assertedAtLeastOne = false;
    for (const tightNode of tight.nodes) {
      const looseNode = loose.nodes.find((n) => n.activity === tightNode.activity);
      expect(looseNode).toBeDefined();
      // Only nodes that are not clamped to MIN_NODE_WIDTH (120) on the
      // tighter padding can grow further on the looser one.
      if (tightNode.width > 120) {
        expect((looseNode?.width ?? 0) - tightNode.width).toBeCloseTo(16, 0);
        assertedAtLeastOne = true;
      }
    }
    expect(assertedAtLeastOne).toBe(true);
  });

  test("edge strokeWidth scales with theme.strokeWidth base", () => {
    const baseOne = layoutDfg(dfg, { theme: resolveTheme({ strokeWidth: 1 }) });
    const baseTwo = layoutDfg(dfg, { theme: resolveTheme({ strokeWidth: 2 }) });
    expect(baseOne.edges.length).toBeGreaterThan(0);
    for (const a of baseOne.edges) {
      const b = baseTwo.edges.find((e) => e.from === a.from && e.to === a.to);
      expect(b).toBeDefined();
      expect(b?.strokeWidth ?? 0).toBeCloseTo(a.strokeWidth * 2, 5);
    }
  });

  test("default theme path uses Vercel-flavoured stroke range [1, 2]", () => {
    const layout = layoutDfg(dfg, { theme: LIGHT_DEFAULTS });
    const strokes = layout.edges.map((e) => e.strokeWidth);
    expect(Math.min(...strokes)).toBeCloseTo(1, 5);
    expect(Math.max(...strokes)).toBeCloseTo(2, 5);
  });
});

describe("layoutDfg — edgeLabelPosition", () => {
  test("perpendicular shift on a horizontal segment lands offset away in y", () => {
    const points = [
      { x: 0, y: 100 },
      { x: 50, y: 100 },
      { x: 100, y: 100 },
    ];
    const p = edgeLabelPosition(points, 12);
    expect(p.x).toBeCloseTo(50, 3);
    // tangent (1,0) rotated −90° → (0,1) → +y direction
    expect(Math.abs(p.y - 100)).toBeCloseTo(12, 3);
  });

  test("zero-length tangent falls back to the midpoint", () => {
    const points = [
      { x: 50, y: 50 },
      { x: 50, y: 50 },
      { x: 50, y: 50 },
    ];
    const p = edgeLabelPosition(points, 12);
    expect(p.x).toBe(50);
    expect(p.y).toBe(50);
  });

  test("empty polyline returns the origin", () => {
    const p = edgeLabelPosition([], 12);
    expect(p).toEqual({ x: 0, y: 0 });
  });

  test("single-point polyline returns that point (prev/next collapse onto the midpoint)", () => {
    // midIdx = 0, points[-1] and points[1] are undefined → prev and next
    // both fall back to mid → zero-length tangent → midpoint unchanged.
    const p = edgeLabelPosition([{ x: 42, y: 7 }], 12);
    expect(p).toEqual({ x: 42, y: 7 });
  });
});

describe("layoutDfg — terminalDurations pass-through (Phase 23)", () => {
  test("DfgLayout.terminalDurations is undefined when not supplied", () => {
    const layout = layoutDfg(dfg);
    expect(layout.terminalDurations).toBeUndefined();
  });

  test("undefined survives through LayoutOptions that omit the field", () => {
    const layout = layoutDfg(dfg, { countMode: "meanDuration" });
    expect(layout.terminalDurations).toBeUndefined();
  });

  test("supplied terminalDurations passes through unchanged on the output", () => {
    const td = new Map<string, TerminalNodeDuration>([
      ["approved", { mean: 1_000, median: 1_000, count: 1 }],
      ["rejected", { mean: 2_000, median: 2_000, count: 3 }],
    ]);
    const layout = layoutDfg(dfg, { terminalDurations: td });
    expect(layout.terminalDurations).toBe(td);
    expect(layout.terminalDurations?.get("approved")).toEqual({
      mean: 1_000,
      median: 1_000,
      count: 1,
    });
  });

  test("empty terminalDurations Map passes through as an empty Map (not undefined)", () => {
    const td = new Map<string, TerminalNodeDuration>();
    const layout = layoutDfg(dfg, { terminalDurations: td });
    expect(layout.terminalDurations).toBe(td);
    expect(layout.terminalDurations?.size).toBe(0);
  });
});
