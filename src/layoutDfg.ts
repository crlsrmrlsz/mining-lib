import * as dagre from "@dagrejs/dagre";
import { scaleLinear } from "d3-scale";
import type { TerminalNodeDuration } from "./caseDuration.js";
import type { ResolvedTheme } from "./theme.js";
import type { CountMode, Dfg, EdgeStats, NodeStats } from "./types.js";

export type LayoutOptions = {
  rankdir?: "LR" | "TB";
  nodesep?: number;
  ranksep?: number;
  nodePadding?: number;
  fontSizePx?: number;
  minNodeHeight?: number;
  maxNodeHeight?: number;
  minEdgeStroke?: number;
  maxEdgeStroke?: number;
  countMode?: CountMode;
  theme?: ResolvedTheme;
  terminalDurations?: Map<string, TerminalNodeDuration>;
  /**
   * Phase 24 / 27 — fade mask sets. When set, the renderer adds
   * `.mining-lib-faded` to every `g.mining-lib-node` /
   * `g.mining-lib-edge-label` whose id / edge-key is in the
   * corresponding set, and the same class to the underlying
   * `path.mining-lib-edge` so its stroke fades in lockstep.
   * Edge-key form: `${from}\t${to}` (see src/happyPath.ts).
   *
   * Single slot — populated by either the happy-path overlay
   * (Phase 24) or the case-trace overlay (Phase 27). Trace wins
   * at the createDiagram boundary; layoutDfg only sees one input.
   */
  overlay?: { fadedNodes: Set<string>; fadedEdges: Set<string> };
};

export type NodeLayout = {
  activity: string;
  absoluteFrequency: number;
  caseFrequency: number;
  maxRepetitions: number;
  meanRepetitions: number;
  /** Value used by the active countMode for height + colour scales. */
  metricValue: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Point = { x: number; y: number };

export type EdgeLayout = {
  from: string;
  to: string;
  absoluteFrequency: number;
  caseFrequency: number;
  maxRepetitions: number;
  meanRepetitions: number;
  /** Value used by the active countMode for stroke + colour scales. */
  metricValue: number;
  points: Point[];
  strokeWidth: number;
};

export type DfgLayout = {
  nodes: NodeLayout[];
  edges: EdgeLayout[];
  width: number;
  height: number;
  countMode: CountMode;
  theme?: ResolvedTheme;
  terminalDurations?: Map<string, TerminalNodeDuration>;
  overlay?: { fadedNodes: Set<string>; fadedEdges: Set<string> };
};

type CountBearing = {
  absoluteFrequency: number;
  caseFrequency: number;
  maxRepetitions: number;
  meanRepetitions: number;
  durationMs?: { mean: number; median: number; min: number; max: number };
};

export function pickCount(mode: CountMode, stats: CountBearing): number {
  switch (mode) {
    case "absolute":
      return stats.absoluteFrequency;
    case "case":
      return stats.caseFrequency;
    case "maxRepetitions":
      return stats.maxRepetitions;
    case "meanRepetitions":
      return stats.meanRepetitions;
    case "meanDuration":
      return stats.durationMs?.mean ?? 0;
    case "medianDuration":
      return stats.durationMs?.median ?? 0;
  }
}

const MIN_NODE_WIDTH = 120;
const GLYPH_WIDTH_RATIO = 0.58;

function approxLabelWidth(label: string, fontSizePx: number): number {
  return label.length * fontSizePx * GLYPH_WIDTH_RATIO;
}

function scaleFor(values: number[], range: [number, number]): (value: number) => number {
  if (values.length === 0) return () => range[1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return () => range[1];
  const s = scaleLinear().domain([min, max]).range(range).clamp(true);
  return (value: number) => s(value);
}

export function layoutDfg(dfg: Dfg, options: LayoutOptions = {}): DfgLayout {
  const { theme } = options;
  const {
    rankdir = "TB",
    nodesep = 40,
    ranksep = 80,
    nodePadding = theme?.nodePadding ?? 24,
    fontSizePx = theme?.fontSize ?? 12,
    minNodeHeight = 36,
    maxNodeHeight = 64,
    minEdgeStroke = theme?.strokeWidth ?? 1,
    maxEdgeStroke = theme ? theme.strokeWidth * 2 : 6,
    countMode = "absolute",
  } = options;

  const isDurationMode = countMode === "meanDuration" || countMode === "medianDuration";
  // In duration modes, NodeStats has no durationMs; pickCount returns 0
  // for nodes. Derive each node's metric value from its outgoing edges
  // so the height + colour scales reflect real time, with terminal
  // nodes (no outgoing edges) sitting at 0.
  const derivedNodeMetric = new Map<string, number>();
  if (isDurationMode) {
    const outgoing = new Map<string, EdgeStats[]>();
    for (const node of dfg.nodes.values()) outgoing.set(node.activity, []);
    for (const edge of dfg.edges.values()) outgoing.get(edge.from)?.push(edge);
    for (const [activity, edges] of outgoing) {
      if (edges.length === 0) {
        derivedNodeMetric.set(activity, 0);
        continue;
      }
      const sum = edges.reduce((acc, e) => acc + pickCount(countMode, e), 0);
      derivedNodeMetric.set(activity, sum / edges.length);
    }
  }
  const metricFor = (node: NodeStats): number =>
    isDurationMode ? (derivedNodeMetric.get(node.activity) ?? 0) : pickCount(countMode, node);
  const nodeFreqs = [...dfg.nodes.values()].map(metricFor);
  const edgeFreqs = [...dfg.edges.values()].map((e) => pickCount(countMode, e));
  const heightFor = scaleFor(nodeFreqs, [minNodeHeight, maxNodeHeight]);
  const strokeFor = scaleFor(edgeFreqs, [minEdgeStroke, maxEdgeStroke]);

  const g = new dagre.graphlib.Graph({ directed: true });
  g.setGraph({ rankdir, nodesep, ranksep, marginx: 16, marginy: 16 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of dfg.nodes.values()) {
    const width = Math.max(
      MIN_NODE_WIDTH,
      Math.round(approxLabelWidth(node.activity, fontSizePx) + nodePadding),
    );
    const height = heightFor(metricFor(node));
    g.setNode(node.activity, { width, height });
  }

  for (const edge of dfg.edges.values()) {
    g.setEdge(edge.from, edge.to, { minlen: 1 });
  }

  dagre.layout(g);

  const nodes: NodeLayout[] = [];
  for (const node of dfg.nodes.values()) {
    const laid = g.node(node.activity);
    nodes.push({
      activity: node.activity,
      absoluteFrequency: node.absoluteFrequency,
      caseFrequency: node.caseFrequency,
      maxRepetitions: node.maxRepetitions,
      meanRepetitions: node.meanRepetitions,
      metricValue: metricFor(node),
      x: laid.x,
      y: laid.y,
      width: laid.width,
      height: laid.height,
    });
  }

  const edges: EdgeLayout[] = [];
  for (const edge of dfg.edges.values()) {
    const laid = g.edge(edge.from, edge.to);
    edges.push({
      from: edge.from,
      to: edge.to,
      absoluteFrequency: edge.absoluteFrequency,
      caseFrequency: edge.caseFrequency,
      maxRepetitions: edge.maxRepetitions,
      meanRepetitions: edge.meanRepetitions,
      metricValue: pickCount(countMode, edge),
      points: laid.points.map((p: { x: number; y: number }) => ({ x: p.x, y: p.y })),
      strokeWidth: strokeFor(pickCount(countMode, edge)),
    });
  }

  const graphLabel = g.graph();
  // dagre can report undefined / NaN dims for a degenerate (e.g. empty) graph;
  // `?? 0` misses NaN, so clamp both to a finite fallback.
  const gw = graphLabel.width;
  const gh = graphLabel.height;
  return {
    nodes,
    edges,
    width: typeof gw === "number" && Number.isFinite(gw) ? gw : 0,
    height: typeof gh === "number" && Number.isFinite(gh) ? gh : 0,
    countMode,
    theme,
    terminalDurations: options.terminalDurations,
    overlay: options.overlay,
  };
}

/**
 * Returns a point along the ray from the node's centre toward `toward`,
 * at distance `(distance-to-border + inset)` from the centre. Used by
 * the renderer to position edge endpoints:
 *
 * - `inset = 0` → the point on the node's rectangular border on the
 *   side facing `toward`.
 * - `inset > 0` → further along the ray (outward from the node),
 *   e.g. to reserve a clear gap for the arrow marker to sit in.
 *
 * Zero-length ray (toward === node centre) falls back to the centre.
 */
export function endpointOnNode(
  node: { x: number; y: number; width: number; height: number },
  toward: Point,
  inset: number,
): Point {
  const dx = toward.x - node.x;
  const dy = toward.y - node.y;
  if (dx === 0 && dy === 0) return { x: node.x, y: node.y };
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const halfW = node.width / 2;
  const halfH = node.height / 2;
  const tx = ux !== 0 ? halfW / Math.abs(ux) : Number.POSITIVE_INFINITY;
  const ty = uy !== 0 ? halfH / Math.abs(uy) : Number.POSITIVE_INFINITY;
  const dist = Math.min(tx, ty) + inset;
  return { x: node.x + ux * dist, y: node.y + uy * dist };
}

/**
 * Returns a label position for an edge polyline: the midpoint
 * waypoint shifted perpendicular to the local tangent by
 * `offset` world units. Tangent runs from the previous to the
 * next surviving polyline point. Rotated −90° so labels sit on
 * the right side of the direction of travel (Graphviz `lp`
 * convention). Zero-length tangent (degenerate edge) returns
 * the midpoint unchanged.
 */
export function edgeLabelPosition(points: Point[], offset = 12): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  const midIdx = Math.floor(points.length / 2);
  const mid = points[midIdx] ?? points[0];
  if (!mid) return { x: 0, y: 0 };
  const prev = points[midIdx - 1] ?? mid;
  const next = points[midIdx + 1] ?? mid;
  const tx = next.x - prev.x;
  const ty = next.y - prev.y;
  const len = Math.hypot(tx, ty);
  if (len === 0) return { x: mid.x, y: mid.y };
  // Rotate (tx, ty) by −90° → (ty, −tx); scale to offset units.
  return {
    x: mid.x + (ty / len) * offset,
    y: mid.y + (-tx / len) * offset,
  };
}

export function applyEdgeOverrides(layout: DfgLayout, overrides: Map<string, Point[]>): DfgLayout {
  if (overrides.size === 0) return layout;
  let anyMatch = false;
  const edges = layout.edges.map((e) => {
    const override = overrides.get(`${e.from}→${e.to}`);
    if (!override) return e;
    anyMatch = true;
    return { ...e, points: override.slice() };
  });
  if (!anyMatch) return layout;
  return { ...layout, edges };
}

export function applyPositionOverrides(
  layout: DfgLayout,
  overrides: Map<string, { x: number; y: number }>,
): DfgLayout {
  if (overrides.size === 0) return layout;
  const nodes = layout.nodes.map((n) => {
    const o = overrides.get(n.activity);
    return o ? { ...n, x: o.x, y: o.y } : n;
  });
  const byActivity = new Map(nodes.map((n) => [n.activity, n]));
  const edges = layout.edges.map((e) => {
    const fromOverridden = overrides.has(e.from);
    const toOverridden = overrides.has(e.to);
    if (!fromOverridden && !toOverridden) return e;
    const from = byActivity.get(e.from);
    const to = byActivity.get(e.to);
    if (!from || !to) return e;
    const points = e.points.slice();
    if (fromOverridden && points.length >= 1) {
      points[0] = { x: from.x, y: from.y };
    }
    if (toOverridden && points.length >= 1) {
      points[points.length - 1] = { x: to.x, y: to.y };
    }
    return { ...e, points };
  });
  return { ...layout, nodes, edges };
}
