import { describe, expect, test } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import { buildDfg } from "./buildDfg.js";
import { layoutDfg } from "./layoutDfg.js";
import { parseCsv } from "./parseCsv.js";
import { renderDfg } from "./renderDfg.js";
import { resolveTheme } from "./theme.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const { log } = parseCsv(n5Csv);
const dfg = buildDfg(log);
const layout = layoutDfg(dfg);

function freshSvg(): SVGSVGElement {
  return document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
}

describe("renderDfg — DOM shape on n5 layout", () => {
  test("produces 9 nodes, 10 edges, and one shared arrow marker", () => {
    const svg = freshSvg();
    renderDfg(svg, layout);
    expect(svg.querySelectorAll("g.mining-lib-node")).toHaveLength(9);
    expect(svg.querySelectorAll("path.mining-lib-edge")).toHaveLength(10);
    expect(svg.querySelectorAll("marker#mining-lib-arrow")).toHaveLength(1);
  });

  test("emits one edge-label group per edge with the frequency as its text", () => {
    const svg = freshSvg();
    renderDfg(svg, layout);
    const labels = svg.querySelectorAll("g.mining-lib-edge-label");
    expect(labels).toHaveLength(10);
    const labelTexts = [...labels].map(
      (g) => g.querySelector("text.mining-lib-edge-label-text")?.textContent?.trim() ?? "",
    );
    const expected = layout.edges.map((e) => String(e.absoluteFrequency));
    for (const value of expected) {
      expect(labelTexts).toContain(value);
    }
  });

  test("does not set the SVG viewBox (Phase 13 — host-pixel-space viewBox owned by mountDiagram)", () => {
    const svg = freshSvg();
    const before = svg.getAttribute("viewBox");
    renderDfg(svg, layout);
    expect(svg.getAttribute("viewBox")).toBe(before);
  });
});

describe("renderDfg — data attributes and stable identity", () => {
  test("every node carries a data-activity attribute matching a Dfg activity", () => {
    const svg = freshSvg();
    renderDfg(svg, layout);
    const activities = new Set(dfg.nodes.keys());
    const nodes = svg.querySelectorAll("g.mining-lib-node");
    for (const g of nodes) {
      const activity = g.getAttribute("data-activity");
      expect(activity).not.toBeNull();
      expect(activities.has(activity as string)).toBe(true);
    }
  });

  test("every edge carries data-from and data-to attributes matching a Dfg edge", () => {
    const svg = freshSvg();
    renderDfg(svg, layout);
    const pairs = new Set([...dfg.edges.values()].map((e) => `${e.from}->${e.to}`));
    const edges = svg.querySelectorAll("path.mining-lib-edge");
    for (const p of edges) {
      const from = p.getAttribute("data-from");
      const to = p.getAttribute("data-to");
      expect(from).not.toBeNull();
      expect(to).not.toBeNull();
      expect(pairs.has(`${from}->${to}`)).toBe(true);
    }
  });

  test("single marker#mining-lib-arrow survives when there are zero edges", () => {
    const svg = freshSvg();
    const edgelessLayout = { ...layout, edges: [] };
    renderDfg(svg, edgelessLayout);
    expect(svg.querySelectorAll("marker#mining-lib-arrow")).toHaveLength(1);
    expect(svg.querySelectorAll("path.mining-lib-edge")).toHaveLength(0);
  });
});

describe("renderDfg — count-mode labelling", () => {
  test("default layout renders data-count-mode 'absolute' on the svg", () => {
    const svg = freshSvg();
    renderDfg(svg, layout);
    expect(svg.getAttribute("data-count-mode")).toBe("absolute");
  });

  test("case-mode layout labels review_in_progress as '4' and submitted as '5'", () => {
    const caseLayout = layoutDfg(dfg, { countMode: "case" });
    const svg = freshSvg();
    renderDfg(svg, caseLayout);
    expect(svg.getAttribute("data-count-mode")).toBe("case");
    const reviewCount = svg.querySelector(
      'g.mining-lib-node[data-activity="review_in_progress"] .mining-lib-node-count',
    );
    const submittedCount = svg.querySelector(
      'g.mining-lib-node[data-activity="submitted"] .mining-lib-node-count',
    );
    expect(reviewCount?.textContent?.trim()).toBe("4");
    expect(submittedCount?.textContent?.trim()).toBe("5");
  });

  test("meanRepetitions renders '1.8' for review_in_progress and '1' for integer-mean activities", () => {
    const meanLayout = layoutDfg(dfg, { countMode: "meanRepetitions" });
    const svg = freshSvg();
    renderDfg(svg, meanLayout);
    const reviewCount = svg.querySelector(
      'g.mining-lib-node[data-activity="review_in_progress"] .mining-lib-node-count',
    );
    const submittedCount = svg.querySelector(
      'g.mining-lib-node[data-activity="submitted"] .mining-lib-node-count',
    );
    expect(reviewCount?.textContent?.trim()).toBe("1.8");
    expect(submittedCount?.textContent?.trim()).toBe("1");
  });

  test("maxRepetitions labels the rework-back edge as '3' and review_in_progress as '4'", () => {
    const maxLayout = layoutDfg(dfg, { countMode: "maxRepetitions" });
    const svg = freshSvg();
    renderDfg(svg, maxLayout);
    const reviewCount = svg.querySelector(
      'g.mining-lib-node[data-activity="review_in_progress"] .mining-lib-node-count',
    );
    const reworkEdgeLabel = svg.querySelector(
      'g.mining-lib-edge-label[data-from="review_in_progress"][data-to="request_additional_info"] text.mining-lib-edge-label-text',
    );
    expect(reviewCount?.textContent?.trim()).toBe("4");
    expect(reworkEdgeLabel?.textContent?.trim()).toBe("3");
  });
});

describe("renderDfg — pan/zoom structural scaffolding", () => {
  test("exactly one viewport <g> wraps both edges and nodes groups", () => {
    const svg = freshSvg();
    renderDfg(svg, layout);
    const viewports = svg.querySelectorAll("g.mining-lib-viewport");
    expect(viewports).toHaveLength(1);
    const viewport = viewports[0];
    const edges = svg.querySelector("g.mining-lib-edges");
    const nodes = svg.querySelector("g.mining-lib-nodes");
    expect(edges?.parentElement).toBe(viewport);
    expect(nodes?.parentElement).toBe(viewport);
  });

  test("<defs> is a direct child of <svg>, not of the viewport group", () => {
    const svg = freshSvg();
    renderDfg(svg, layout);
    const defs = svg.querySelector("defs");
    expect(defs).not.toBeNull();
    expect(defs?.parentElement).toBe(svg);
  });

  test("the svg is focusable via tabindex='0' so keyboard shortcuts can reach it", () => {
    const svg = freshSvg();
    renderDfg(svg, layout);
    expect(svg.getAttribute("tabindex")).toBe("0");
  });
});

describe("renderDfg — bend handles", () => {
  test("each edge renders exactly one bend handle (visible + hit ring)", () => {
    const svg = freshSvg();
    renderDfg(svg, layout);
    expect(svg.querySelectorAll("circle.mining-lib-bend-handle")).toHaveLength(layout.edges.length);
    expect(svg.querySelectorAll("circle.mining-lib-bend-handle-hit")).toHaveLength(
      layout.edges.length,
    );
    for (const edge of layout.edges) {
      const visible = svg.querySelectorAll(
        `circle.mining-lib-bend-handle[data-from="${edge.from}"][data-to="${edge.to}"]`,
      );
      const hit = svg.querySelectorAll(
        `circle.mining-lib-bend-handle-hit[data-from="${edge.from}"][data-to="${edge.to}"]`,
      );
      expect(visible).toHaveLength(1);
      expect(hit).toHaveLength(1);
    }
  });

  test("each rendered handle has a matching transparent hit ring at the same waypoint", () => {
    const svg = freshSvg();
    renderDfg(svg, layout);
    const handles = svg.querySelectorAll<SVGCircleElement>("circle.mining-lib-bend-handle");
    expect(handles.length).toBeGreaterThan(0);
    for (const visible of handles) {
      const from = visible.getAttribute("data-from");
      const to = visible.getAttribute("data-to");
      const index = visible.getAttribute("data-index");
      const hit = svg.querySelector<SVGCircleElement>(
        `circle.mining-lib-bend-handle-hit[data-from="${from}"][data-to="${to}"][data-index="${index}"]`,
      );
      expect(hit).not.toBeNull();
      expect(Number(hit?.getAttribute("cx"))).toBeCloseTo(Number(visible.getAttribute("cx")), 3);
      expect(Number(hit?.getAttribute("cy"))).toBeCloseTo(Number(visible.getAttribute("cy")), 3);
      expect(Number(hit?.getAttribute("r"))).toBeGreaterThan(Number(visible.getAttribute("r")));
    }
  });

  test("multi-point edges anchor the handle at points[Math.floor(length/2)]", () => {
    const svg = freshSvg();
    renderDfg(svg, layout);
    const handles = svg.querySelectorAll<SVGCircleElement>("circle.mining-lib-bend-handle");
    for (const handle of handles) {
      const from = handle.getAttribute("data-from") ?? "";
      const to = handle.getAttribute("data-to") ?? "";
      const edge = layout.edges.find((e) => e.from === from && e.to === to);
      if (!edge || edge.points.length < 3) continue;
      const expected = edge.points[Math.floor(edge.points.length / 2)];
      expect(expected).toBeDefined();
      if (!expected) continue;
      expect(Number(handle.getAttribute("cx"))).toBeCloseTo(expected.x, 3);
      expect(Number(handle.getAttribute("cy"))).toBeCloseTo(expected.y, 3);
    }
  });

  test("edge labels sit off the polyline midpoint when the edge has a real tangent", () => {
    const svg = freshSvg();
    renderDfg(svg, layout);
    const labels = svg.querySelectorAll<SVGGElement>("g.mining-lib-edge-label");
    let offCount = 0;
    for (const label of labels) {
      const from = label.getAttribute("data-from") ?? "";
      const to = label.getAttribute("data-to") ?? "";
      const edge = layout.edges.find((e) => e.from === from && e.to === to);
      if (!edge) continue;
      const mid = edge.points[Math.floor(edge.points.length / 2)];
      if (!mid) continue;
      const transform = label.getAttribute("transform") ?? "";
      const match = transform.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
      if (!match) continue;
      const lx = Number(match[1]);
      const ly = Number(match[2]);
      const distance = Math.hypot(lx - mid.x, ly - mid.y);
      if (distance > 5) offCount++;
    }
    expect(offCount).toBeGreaterThan(0);
  });

  test("two-point straight edges render one handle at the geometric midpoint", () => {
    const svg = freshSvg();
    const twoPointLayout = {
      ...layout,
      edges: [
        {
          ...(layout.edges[0] as (typeof layout.edges)[number]),
          points: [
            { x: 10, y: 10 },
            { x: 30, y: 50 },
          ],
        },
      ],
    };
    renderDfg(svg, twoPointLayout);
    const handles = svg.querySelectorAll<SVGCircleElement>("circle.mining-lib-bend-handle");
    expect(handles).toHaveLength(1);
    const handle = handles[0] as SVGCircleElement;
    expect(Number(handle.getAttribute("cx"))).toBeCloseTo(20, 3);
    expect(Number(handle.getAttribute("cy"))).toBeCloseTo(30, 3);
    expect(svg.querySelectorAll("circle.mining-lib-bend-handle-hit")).toHaveLength(1);
  });

  test("handles render in their own group between edges and nodes in DOM order", () => {
    const svg = freshSvg();
    renderDfg(svg, layout);
    const viewport = svg.querySelector("g.mining-lib-viewport");
    expect(viewport).not.toBeNull();
    const children = [...(viewport?.children ?? [])];
    const edgesIdx = children.findIndex((c) => c.classList.contains("mining-lib-edges"));
    const handlesIdx = children.findIndex((c) => c.classList.contains("mining-lib-bend-handles"));
    const nodesIdx = children.findIndex((c) => c.classList.contains("mining-lib-nodes"));
    expect(edgesIdx).toBeGreaterThanOrEqual(0);
    expect(handlesIdx).toBeGreaterThan(edgesIdx);
    expect(nodesIdx).toBeGreaterThan(handlesIdx);
  });
});

describe("renderDfg — theme-driven painting", () => {
  test("node rectangles carry rx and ry matching the resolved theme's nodeRadius", () => {
    const svg = freshSvg();
    const themed = layoutDfg(dfg, { theme: resolveTheme() });
    renderDfg(svg, themed);
    const rects = svg.querySelectorAll<SVGRectElement>("g.mining-lib-node > rect");
    expect(rects.length).toBeGreaterThan(0);
    for (const rect of rects) {
      expect(rect.getAttribute("rx")).toBe("6");
      expect(rect.getAttribute("ry")).toBe("6");
    }
  });

  test("a custom theme.nodeRadius lands on every node rect", () => {
    const svg = freshSvg();
    const themed = layoutDfg(dfg, { theme: resolveTheme({ nodeRadius: 12 }) });
    renderDfg(svg, themed);
    const rects = svg.querySelectorAll<SVGRectElement>("g.mining-lib-node > rect");
    for (const rect of rects) {
      expect(rect.getAttribute("rx")).toBe("12");
      expect(rect.getAttribute("ry")).toBe("12");
    }
  });

  test("edge labels render as a g containing a chip rect (rx=3) and a count text", () => {
    const svg = freshSvg();
    renderDfg(svg, layout);
    const groups = svg.querySelectorAll<SVGGElement>("g.mining-lib-edge-label");
    expect(groups.length).toBe(layout.edges.length);
    for (const group of groups) {
      const chip = group.querySelector<SVGRectElement>("rect.mining-lib-edge-label-chip");
      const text = group.querySelector<SVGTextElement>("text.mining-lib-edge-label-text");
      expect(chip).not.toBeNull();
      expect(text).not.toBeNull();
      expect(chip?.getAttribute("rx")).toBe("3");
      expect(chip?.getAttribute("ry")).toBe("3");
    }
  });

  test("edge paths carry stroke-linecap and stroke-linejoin set to round", () => {
    const svg = freshSvg();
    renderDfg(svg, layout);
    const paths = svg.querySelectorAll<SVGPathElement>("path.mining-lib-edge");
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path.getAttribute("stroke-linecap")).toBe("round");
      expect(path.getAttribute("stroke-linejoin")).toBe("round");
    }
  });

  test("arrow marker path uses currentColor so it tracks the edge stroke", () => {
    const svg = freshSvg();
    renderDfg(svg, layout);
    const markerPath = svg.querySelector<SVGPathElement>("marker#mining-lib-arrow path");
    expect(markerPath).not.toBeNull();
    expect(markerPath?.getAttribute("fill")).toBe("currentColor");
  });
});

describe("renderDfg — Phase 17 time mode", () => {
  function buildDurationLayout(opts?: { allZero?: boolean }) {
    const nodes = new Map([
      [
        "start",
        {
          activity: "start",
          absoluteFrequency: 7,
          caseFrequency: 7,
          maxRepetitions: 1,
          meanRepetitions: 1,
        },
      ],
      [
        "mid",
        {
          activity: "mid",
          absoluteFrequency: 4,
          caseFrequency: 4,
          maxRepetitions: 1,
          meanRepetitions: 1,
        },
      ],
      [
        "end",
        {
          activity: "end",
          absoluteFrequency: 6,
          caseFrequency: 6,
          maxRepetitions: 1,
          meanRepetitions: 1,
        },
      ],
    ]);
    const slow = opts?.allZero ? 0 : 90_000_000; // 90M ms = 1.0 d
    const fast = opts?.allZero ? 0 : 1000;
    const edges = new Map([
      [
        "start->mid",
        {
          from: "start",
          to: "mid",
          absoluteFrequency: 1,
          caseFrequency: 1,
          maxRepetitions: 1,
          meanRepetitions: 1,
          durationMs: { mean: fast, median: fast, min: fast, max: fast },
        },
      ],
      [
        "mid->end",
        {
          from: "mid",
          to: "end",
          absoluteFrequency: 1,
          caseFrequency: 1,
          maxRepetitions: 1,
          meanRepetitions: 1,
          durationMs: { mean: slow, median: slow, min: slow, max: slow },
        },
      ],
    ]);
    return layoutDfg({ nodes, edges }, { countMode: "meanDuration" });
  }

  test("slowest edge stroke interpolates to the high-end ramp colour", () => {
    const dur = buildDurationLayout();
    const svg = freshSvg();
    renderDfg(svg, dur);
    const slowEdge = svg.querySelector('path.mining-lib-edge[data-from="mid"][data-to="end"]');
    expect(slowEdge?.getAttribute("stroke")).toBe("rgb(217, 119, 6)");
  });

  test("fastest edge stroke interpolates to the low-end ramp colour", () => {
    const dur = buildDurationLayout();
    const svg = freshSvg();
    renderDfg(svg, dur);
    const fastEdge = svg.querySelector('path.mining-lib-edge[data-from="start"][data-to="mid"]');
    expect(fastEdge?.getAttribute("stroke")).toBe("rgb(148, 163, 184)");
  });

  test("node fills interpolate against the same per-Dfg ramp", () => {
    const dur = buildDurationLayout();
    const svg = freshSvg();
    renderDfg(svg, dur);
    // 'mid' has one outgoing edge of duration 90M → derived metricValue = 90M (max), so fill = high.
    const midRect = svg.querySelector('g.mining-lib-node[data-activity="mid"] rect');
    expect(midRect?.getAttribute("fill")).toBe("rgb(217, 119, 6)");
    // 'end' is terminal → derived metricValue = 0 (min), so fill = low.
    const endRect = svg.querySelector('g.mining-lib-node[data-activity="end"] rect');
    expect(endRect?.getAttribute("fill")).toBe("rgb(148, 163, 184)");
  });

  test("edge labels switch to formatDuration in mean-duration mode", () => {
    const dur = buildDurationLayout();
    const svg = freshSvg();
    renderDfg(svg, dur);
    const slowLabel = svg.querySelector(
      'g.mining-lib-edge-label[data-from="mid"][data-to="end"] text.mining-lib-edge-label-text',
    );
    expect(slowLabel?.textContent?.trim()).toBe("1.0 d");
    const fastLabel = svg.querySelector(
      'g.mining-lib-edge-label[data-from="start"][data-to="mid"] text.mining-lib-edge-label-text',
    );
    expect(fastLabel?.textContent?.trim()).toBe("1.0 s");
  });

  test("node count labels stay frequency-based even in duration mode", () => {
    const dur = buildDurationLayout();
    const svg = freshSvg();
    renderDfg(svg, dur);
    // Per the design doc, time labels are restricted to edges; the
    // node count label keeps its frequency reading so node labels
    // stay stable across modes.
    const startCount = svg.querySelector(
      'g.mining-lib-node[data-activity="start"] .mining-lib-node-count',
    );
    expect(startCount?.textContent?.trim()).toBe("7");
  });

  test("frequency mode leaves stroke and fill attributes unset (CSS variables win)", () => {
    const svg = freshSvg();
    renderDfg(svg, layout); // default 'absolute' layout
    const anyEdge = svg.querySelector("path.mining-lib-edge");
    expect(anyEdge?.getAttribute("stroke")).toBeNull();
    const anyNodeRect = svg.querySelector("g.mining-lib-node rect");
    expect(anyNodeRect?.getAttribute("fill")).toBeNull();
  });

  test("all-zero-duration Dfg renders with no NaN attribute, every stroke + fill at ramp-low", () => {
    const dur = buildDurationLayout({ allZero: true });
    const svg = freshSvg();
    renderDfg(svg, dur);
    const allEdges = svg.querySelectorAll("path.mining-lib-edge");
    for (const edge of allEdges) {
      expect(edge.getAttribute("stroke")).toBe("rgb(148, 163, 184)");
    }
    const allNodeRects = svg.querySelectorAll("g.mining-lib-node rect");
    for (const rect of allNodeRects) {
      expect(rect.getAttribute("fill")).toBe("rgb(148, 163, 184)");
    }
    // Confirm no NaN leaked into any attribute on any element.
    const allElements = svg.querySelectorAll("*");
    for (const el of allElements) {
      for (const attr of el.attributes) {
        expect(attr.value).not.toMatch(/NaN/i);
      }
    }
  });
});

describe("renderDfg — Phase 23 terminal-node duration label", () => {
  type TD = { mean: number; median: number; count: number };

  function buildTerminalLayout(
    mode: "absolute" | "meanDuration" | "medianDuration",
    terminalDurations?: Map<string, TD>,
  ) {
    const nodes = new Map([
      [
        "start",
        {
          activity: "start",
          absoluteFrequency: 7,
          caseFrequency: 7,
          maxRepetitions: 1,
          meanRepetitions: 1,
        },
      ],
      [
        "mid",
        {
          activity: "mid",
          absoluteFrequency: 4,
          caseFrequency: 4,
          maxRepetitions: 1,
          meanRepetitions: 1,
        },
      ],
      [
        "end",
        {
          activity: "end",
          absoluteFrequency: 6,
          caseFrequency: 6,
          maxRepetitions: 1,
          meanRepetitions: 1,
        },
      ],
    ]);
    const edges = new Map([
      [
        "start->mid",
        {
          from: "start",
          to: "mid",
          absoluteFrequency: 1,
          caseFrequency: 1,
          maxRepetitions: 1,
          meanRepetitions: 1,
          durationMs: { mean: 1000, median: 1000, min: 1000, max: 1000 },
        },
      ],
      [
        "mid->end",
        {
          from: "mid",
          to: "end",
          absoluteFrequency: 1,
          caseFrequency: 1,
          maxRepetitions: 1,
          meanRepetitions: 1,
          durationMs: { mean: 2000, median: 2000, min: 2000, max: 2000 },
        },
      ],
    ]);
    return layoutDfg({ nodes, edges }, { countMode: mode, terminalDurations });
  }

  test("meanDuration mode + terminalDurations: one g.mining-lib-node-terminal per entry", () => {
    const td = new Map<string, TD>([["end", { mean: 60_000, median: 60_000, count: 1 }]]);
    const layout = buildTerminalLayout("meanDuration", td);
    const svg = freshSvg();
    renderDfg(svg, layout);
    const groups = svg.querySelectorAll("g.mining-lib-node-terminal");
    expect(groups).toHaveLength(1);
    // The group must live inside the terminal node (`end`), not on `mid` or `start`.
    const endNode = svg.querySelector('g.mining-lib-node[data-activity="end"]');
    expect(endNode?.querySelector("g.mining-lib-node-terminal")).not.toBeNull();
  });

  test("each terminal group contains one inline <svg> icon and one <text>", () => {
    const td = new Map<string, TD>([["end", { mean: 60_000, median: 60_000, count: 1 }]]);
    const layout = buildTerminalLayout("meanDuration", td);
    const svg = freshSvg();
    renderDfg(svg, layout);
    const group = svg.querySelector("g.mining-lib-node-terminal");
    expect(group?.querySelectorAll("svg")).toHaveLength(1);
    expect(group?.querySelectorAll("text.mining-lib-node-terminal-text")).toHaveLength(1);
  });

  test("absolute mode: no terminal groups even when terminalDurations is set", () => {
    const td = new Map<string, TD>([["end", { mean: 60_000, median: 60_000, count: 1 }]]);
    const layout = buildTerminalLayout("absolute", td);
    const svg = freshSvg();
    renderDfg(svg, layout);
    expect(svg.querySelectorAll("g.mining-lib-node-terminal")).toHaveLength(0);
  });

  test("time mode without terminalDurations: no terminal groups (defensive)", () => {
    const layout = buildTerminalLayout("meanDuration", undefined);
    const svg = freshSvg();
    renderDfg(svg, layout);
    expect(svg.querySelectorAll("g.mining-lib-node-terminal")).toHaveLength(0);
  });

  test("time mode with empty Map: no terminal groups", () => {
    const layout = buildTerminalLayout("meanDuration", new Map());
    const svg = freshSvg();
    renderDfg(svg, layout);
    expect(svg.querySelectorAll("g.mining-lib-node-terminal")).toHaveLength(0);
  });

  test("text renders formatDuration of the mean value in meanDuration mode", () => {
    // 60_000 ms → "1 m"; formatDuration handles the formatting.
    const td = new Map<string, TD>([["end", { mean: 60_000, median: 30_000, count: 1 }]]);
    const layout = buildTerminalLayout("meanDuration", td);
    const svg = freshSvg();
    renderDfg(svg, layout);
    const text = svg.querySelector("text.mining-lib-node-terminal-text");
    expect(text?.textContent).toBe("1.0 m");
  });

  test("text renders formatDuration of the median value in medianDuration mode", () => {
    const td = new Map<string, TD>([["end", { mean: 60_000, median: 30_000, count: 1 }]]);
    const layout = buildTerminalLayout("medianDuration", td);
    const svg = freshSvg();
    renderDfg(svg, layout);
    const text = svg.querySelector("text.mining-lib-node-terminal-text");
    expect(text?.textContent).toBe("30.0 s");
  });

  test("slowest terminal gets the high-ramp colour; fastest gets the low-ramp colour", () => {
    // Two terminals with very different durations; ramp should hit both ends.
    const layout = layoutDfg(
      {
        nodes: new Map([
          [
            "a",
            {
              activity: "a",
              absoluteFrequency: 1,
              caseFrequency: 1,
              maxRepetitions: 1,
              meanRepetitions: 1,
            },
          ],
          [
            "b",
            {
              activity: "b",
              absoluteFrequency: 1,
              caseFrequency: 1,
              maxRepetitions: 1,
              meanRepetitions: 1,
            },
          ],
        ]),
        edges: new Map(),
      },
      {
        countMode: "meanDuration",
        terminalDurations: new Map<string, TD>([
          ["a", { mean: 1_000, median: 1_000, count: 1 }],
          ["b", { mean: 1_000_000_000, median: 1_000_000_000, count: 1 }],
        ]),
      },
    );
    const svg = freshSvg();
    renderDfg(svg, layout);
    const aGroup = svg.querySelector(
      'g.mining-lib-node[data-activity="a"] g.mining-lib-node-terminal',
    );
    const bGroup = svg.querySelector(
      'g.mining-lib-node[data-activity="b"] g.mining-lib-node-terminal',
    );
    // Phase 17 ramp endpoints: low = slate-400 rgb(148,163,184), high = amber-600 rgb(217,119,6).
    expect(aGroup?.getAttribute("color")).toBe("rgb(148, 163, 184)");
    expect(bGroup?.getAttribute("color")).toBe("rgb(217, 119, 6)");
  });

  test("single-terminal layout uses the low-ramp colour (range collapse)", () => {
    const td = new Map<string, TD>([["end", { mean: 1_000_000, median: 1_000_000, count: 1 }]]);
    const layout = buildTerminalLayout("meanDuration", td);
    const svg = freshSvg();
    renderDfg(svg, layout);
    const group = svg.querySelector("g.mining-lib-node-terminal");
    expect(group?.getAttribute("color")).toBe("rgb(148, 163, 184)");
  });

  test("position: terminal group sits at translate(width/2, height/2 + 26)", () => {
    const td = new Map<string, TD>([["end", { mean: 60_000, median: 60_000, count: 1 }]]);
    const layout = buildTerminalLayout("meanDuration", td);
    const svg = freshSvg();
    renderDfg(svg, layout);
    const endLayout = layout.nodes.find((n) => n.activity === "end");
    const group = svg.querySelector("g.mining-lib-node-terminal");
    const expected = `translate(${endLayout?.width !== undefined ? endLayout.width / 2 : 0}, ${
      endLayout?.height !== undefined ? endLayout.height / 2 + 26 : 0
    })`;
    expect(group?.getAttribute("transform")).toBe(expected);
  });

  test("mode toggle absolute → meanDuration → absolute adds then removes terminal groups", () => {
    const td = new Map<string, TD>([["end", { mean: 60_000, median: 60_000, count: 1 }]]);
    const svg = freshSvg();
    renderDfg(svg, buildTerminalLayout("absolute", td));
    expect(svg.querySelectorAll("g.mining-lib-node-terminal")).toHaveLength(0);
    renderDfg(svg, buildTerminalLayout("meanDuration", td));
    expect(svg.querySelectorAll("g.mining-lib-node-terminal")).toHaveLength(1);
    renderDfg(svg, buildTerminalLayout("absolute", td));
    expect(svg.querySelectorAll("g.mining-lib-node-terminal")).toHaveLength(0);
  });
});

describe("renderDfg — idempotent redraws", () => {
  test("second render of the same layout leaves the same child counts", () => {
    const svg = freshSvg();
    renderDfg(svg, layout);
    renderDfg(svg, layout);
    expect(svg.querySelectorAll("g.mining-lib-node")).toHaveLength(9);
    expect(svg.querySelectorAll("path.mining-lib-edge")).toHaveLength(10);
    expect(svg.querySelectorAll("marker#mining-lib-arrow")).toHaveLength(1);
  });

  test("re-render with a smaller layout shrinks the svg to match", () => {
    const svg = freshSvg();
    renderDfg(svg, layout);
    const shrunk = { ...layout, nodes: layout.nodes.slice(0, 3), edges: layout.edges.slice(0, 2) };
    renderDfg(svg, shrunk);
    expect(svg.querySelectorAll("g.mining-lib-node")).toHaveLength(3);
    expect(svg.querySelectorAll("path.mining-lib-edge")).toHaveLength(2);
  });
});

describe("renderDfg — Phase 24 happy-path fade overlay", () => {
  // Direct Approval is the spine through the n5 layout; choose its
  // node + edge sets as the on-path baseline.
  const DIRECT_APPROVAL = [
    "submitted",
    "intake_validation",
    "assigned_to_reviewer",
    "review_in_progress",
    "health_inspection",
    "approved",
  ];

  function fadedSets(): {
    fadedNodes: Set<string>;
    fadedEdges: Set<string>;
  } {
    const onNodes = new Set(DIRECT_APPROVAL);
    const onEdges = new Set<string>();
    for (let i = 0; i < DIRECT_APPROVAL.length - 1; i += 1) {
      onEdges.add(`${DIRECT_APPROVAL[i]}\t${DIRECT_APPROVAL[i + 1]}`);
    }
    const fadedNodes = new Set<string>();
    for (const n of dfg.nodes.keys()) if (!onNodes.has(n)) fadedNodes.add(n);
    const fadedEdges = new Set<string>();
    for (const e of dfg.edges.values()) {
      const key = `${e.from}\t${e.to}`;
      if (!onEdges.has(key)) fadedEdges.add(key);
    }
    return { fadedNodes, fadedEdges };
  }

  test("without overlay: no element carries the mining-lib-faded class", () => {
    const svg = freshSvg();
    renderDfg(svg, layout);
    expect(svg.querySelectorAll(".mining-lib-faded")).toHaveLength(0);
  });

  test("with overlay: faded nodes have the class, on-path nodes do not", () => {
    const svg = freshSvg();
    const overlay = fadedSets();
    renderDfg(svg, { ...layout, overlay: overlay });
    for (const node of svg.querySelectorAll<SVGGElement>("g.mining-lib-node")) {
      const activity = node.getAttribute("data-activity") ?? "";
      expect(node.classList.contains("mining-lib-faded")).toBe(overlay.fadedNodes.has(activity));
    }
  });

  test("with overlay: faded edges + edge labels have the class, on-path do not", () => {
    const svg = freshSvg();
    const overlay = fadedSets();
    renderDfg(svg, { ...layout, overlay: overlay });
    for (const edge of svg.querySelectorAll<SVGPathElement>("path.mining-lib-edge")) {
      const key = `${edge.getAttribute("data-from")}\t${edge.getAttribute("data-to")}`;
      expect(edge.classList.contains("mining-lib-faded")).toBe(overlay.fadedEdges.has(key));
    }
    for (const label of svg.querySelectorAll<SVGGElement>("g.mining-lib-edge-label")) {
      const key = `${label.getAttribute("data-from")}\t${label.getAttribute("data-to")}`;
      expect(label.classList.contains("mining-lib-faded")).toBe(overlay.fadedEdges.has(key));
    }
  });

  test("clearing the overlay between renders removes every faded class", () => {
    const svg = freshSvg();
    renderDfg(svg, { ...layout, overlay: fadedSets() });
    expect(svg.querySelectorAll(".mining-lib-faded").length).toBeGreaterThan(0);
    renderDfg(svg, layout);
    expect(svg.querySelectorAll(".mining-lib-faded")).toHaveLength(0);
  });

  test("on-path nodes get .mining-lib-happy; off-path do not", () => {
    const svg = freshSvg();
    const overlay = fadedSets();
    renderDfg(svg, { ...layout, overlay: overlay });
    for (const node of svg.querySelectorAll<SVGGElement>("g.mining-lib-node")) {
      const activity = node.getAttribute("data-activity") ?? "";
      const offPath = overlay.fadedNodes.has(activity);
      expect(node.classList.contains("mining-lib-happy")).toBe(!offPath);
      expect(node.classList.contains("mining-lib-faded")).toBe(offPath);
    }
  });

  test("on-path edges get .mining-lib-happy; off-path do not", () => {
    const svg = freshSvg();
    const overlay = fadedSets();
    renderDfg(svg, { ...layout, overlay: overlay });
    for (const edge of svg.querySelectorAll<SVGPathElement>("path.mining-lib-edge")) {
      const key = `${edge.getAttribute("data-from")}\t${edge.getAttribute("data-to")}`;
      const offPath = overlay.fadedEdges.has(key);
      expect(edge.classList.contains("mining-lib-happy")).toBe(!offPath);
      expect(edge.classList.contains("mining-lib-faded")).toBe(offPath);
    }
  });

  test("no overlay → no element carries either happy or faded class", () => {
    const svg = freshSvg();
    renderDfg(svg, layout);
    expect(svg.querySelectorAll(".mining-lib-happy")).toHaveLength(0);
    expect(svg.querySelectorAll(".mining-lib-faded")).toHaveLength(0);
  });

  test("on-path elements carry .mining-lib-happy class (CSS owns colour via the token)", () => {
    const svg = freshSvg();
    const overlay = fadedSets();
    renderDfg(svg, { ...layout, overlay: overlay });
    const happyEdge = svg.querySelector("path.mining-lib-edge.mining-lib-happy");
    const happyNodeRect = svg.querySelector("g.mining-lib-node.mining-lib-happy > rect");
    // Class lands on both edge + node. The actual colour comes from
    // the `.mining-lib-edge.mining-lib-happy { stroke: var(--mining-
    // happy-stroke) }` and the corresponding node rect rule in
    // mining-lib.css. We don't assert computed style here because
    // jsdom doesn't pull the inlined stylesheet for the bare-SVG
    // test setup; the e2e suite covers the actual rendered colour.
    expect(happyEdge).not.toBeNull();
    expect(happyNodeRect).not.toBeNull();
  });

  test("on-path edges do NOT carry inline stroke / color attrs in count modes (CSS owns it)", () => {
    const svg = freshSvg();
    const overlay = fadedSets();
    renderDfg(svg, { ...layout, overlay: overlay });
    const happyEdge = svg.querySelector("path.mining-lib-edge.mining-lib-happy");
    expect(happyEdge?.getAttribute("stroke")).toBeNull();
    expect(happyEdge?.getAttribute("color")).toBeNull();
  });

  test("on-path node rects do NOT carry inline fill / stroke attrs in count modes (CSS owns it)", () => {
    const svg = freshSvg();
    const overlay = fadedSets();
    renderDfg(svg, { ...layout, overlay: overlay });
    const rect = svg.querySelector("g.mining-lib-node.mining-lib-happy > rect");
    expect(rect?.getAttribute("fill")).toBeNull();
    expect(rect?.getAttribute("stroke")).toBeNull();
  });
});

describe("renderDfg — Phase 24 self-loop label nudge", () => {
  function selfLoopLayout(): ReturnType<typeof layoutDfg> {
    // Build a log with a self-loop: case `c1` records activity `a`
    // twice consecutively, which produces edge a→a in buildDfg.
    const events = [
      { activity: "a", t: 0 },
      { activity: "a", t: 1 },
      { activity: "b", t: 2 },
    ].map((e) => ({
      caseId: "c1",
      activity: e.activity,
      timestamp: new Date(2024, 0, 1, 0, e.t),
      resource: null,
      lifecycle: "complete" as const,
      attributes: {},
    }));
    const synthLog = {
      cases: new Map([["c1", { id: "c1", events, attributes: {} }]]),
      events,
      schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
    };
    return layoutDfg(buildDfg(synthLog), { theme: resolveTheme() });
  }

  function parseTranslate(value: string): { x: number; y: number } | null {
    const m = /translate\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)/.exec(value);
    if (!m) return null;
    return { x: Number.parseFloat(m[1] ?? "0"), y: Number.parseFloat(m[2] ?? "0") };
  }

  test("an edge with from === to renders a label group with data-self-loop='true'", () => {
    const sl = selfLoopLayout();
    const svg = freshSvg();
    renderDfg(svg, sl);
    const selfLoop = svg.querySelector("g.mining-lib-edge-label[data-self-loop='true']");
    expect(selfLoop).not.toBeNull();
    expect(selfLoop?.getAttribute("data-from")).toBe("a");
    expect(selfLoop?.getAttribute("data-to")).toBe("a");
  });

  test("the self-loop label transform lands outside the source node's bounding box", () => {
    const sl = selfLoopLayout();
    const svg = freshSvg();
    renderDfg(svg, sl);
    const selfLoop = svg.querySelector<SVGGElement>(
      "g.mining-lib-edge-label[data-self-loop='true']",
    );
    expect(selfLoop).not.toBeNull();
    const xform = parseTranslate(selfLoop?.getAttribute("transform") ?? "");
    expect(xform).not.toBeNull();
    const sourceNode = sl.nodes.find((n) => n.activity === "a");
    expect(sourceNode).not.toBeUndefined();
    if (!xform || !sourceNode) return;
    const dx = xform.x - sourceNode.x;
    const dy = xform.y - sourceNode.y;
    const outsideX = Math.abs(dx) > sourceNode.width / 2;
    const outsideY = Math.abs(dy) > sourceNode.height / 2;
    expect(outsideX || outsideY).toBe(true);
  });

  test("non-self-loop edges do NOT carry data-self-loop", () => {
    const sl = selfLoopLayout();
    const svg = freshSvg();
    renderDfg(svg, sl);
    const labels = svg.querySelectorAll<SVGGElement>("g.mining-lib-edge-label");
    for (const label of labels) {
      const from = label.getAttribute("data-from");
      const to = label.getAttribute("data-to");
      if (from === to) continue;
      expect(label.hasAttribute("data-self-loop")).toBe(false);
    }
  });
});
