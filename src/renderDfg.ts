import { select } from "d3-selection";
import type { TerminalNodeDuration } from "./caseDuration.js";
import { interpolateRamp } from "./colorRamp.js";
import { formatDuration } from "./formatDuration.js";
import {
  type DfgLayout,
  type EdgeLayout,
  edgeLabelPosition,
  endpointOnNode,
  type NodeLayout,
  pickCount,
} from "./layoutDfg.js";
import { LIGHT_DEFAULTS } from "./theme.js";
import type { CountMode } from "./types.js";

function isDurationMode(mode: CountMode): boolean {
  return mode === "meanDuration" || mode === "medianDuration";
}

/**
 * Read a CSS custom property from the SVG's resolved style, falling
 * back to the supplied default when the host environment (e.g.
 * jsdom) does not surface custom-property inheritance.
 */
function readCssVar(svg: SVGSVGElement, cssName: string, fallback: string): string {
  try {
    const view = svg.ownerDocument?.defaultView;
    if (!view) return fallback;
    const value = view.getComputedStyle(svg).getPropertyValue(cssName).trim();
    return value || fallback;
  } catch {
    return fallback;
  }
}

function readRampVar(svg: SVGSVGElement, name: "low" | "high"): string {
  return name === "low"
    ? readCssVar(svg, "--mining-time-ramp-low", LIGHT_DEFAULTS.timeRampLow)
    : readCssVar(svg, "--mining-time-ramp-high", LIGHT_DEFAULTS.timeRampHigh);
}

function rampPosition(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return (value - min) / (max - min);
}

export const ARROW_CLEARANCE = 10;
export const HANDLE_HIT_RADIUS = 10;
export const HANDLE_VISIBLE_RADIUS = 4;
export const LABEL_OFFSET = 12;
export const CHIP_RADIUS = 3;
const CHIP_PADDING_X = 4;
const CHIP_PADDING_Y = 2;
const CHIP_FALLBACK_WIDTH = 24;
const CHIP_FALLBACK_HEIGHT = 14;

export function renderDfg(svg: SVGSVGElement, layout: DfgLayout): void {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  svg.setAttribute("class", "mining-lib-svg");
  // Phase 13: viewBox is now host-pixel-space, owned by mountDiagram's
  // syncViewBox(). renderDfg no longer touches it — that prevents the
  // dagre-empty-graph -Infinity viewBox bug and decouples layout from
  // viewport sizing.
  svg.setAttribute("data-count-mode", layout.countMode);
  svg.setAttribute("tabindex", "0");
  // Accessibility (Phase 38-II B3): give the canvas a screen-reader label that
  // reflects the current (filtered) graph, so it announces as more than an
  // unlabelled focusable region. Node-level keyboard operability is a later
  // a11y phase.
  svg.setAttribute("role", "img");
  const nodeCount = layout.nodes.length;
  const edgeCount = layout.edges.length;
  svg.setAttribute(
    "aria-label",
    `Process directly-follows graph: ${nodeCount} ${nodeCount === 1 ? "activity" : "activities"}, ${edgeCount} ${edgeCount === 1 ? "transition" : "transitions"}`,
  );

  const s = select(svg);

  s.append("defs")
    .append("marker")
    .attr("id", "mining-lib-arrow")
    .attr("viewBox", "0 0 10 10")
    .attr("refX", 0)
    .attr("refY", 5)
    .attr("markerWidth", 10)
    .attr("markerHeight", 10)
    .attr("markerUnits", "userSpaceOnUse")
    .attr("orient", "auto-start-reverse")
    .append("path")
    .attr("d", "M 0 0 L 10 5 L 0 10 z")
    .attr("fill", "currentColor");

  const viewport = s.append("g").attr("class", "mining-lib-viewport");

  const edgesGroup = viewport.append("g").attr("class", "mining-lib-edges");

  const nodesByActivity = new Map(layout.nodes.map((n) => [n.activity, n]));

  const durationMode = isDurationMode(layout.countMode);
  const rampLow = durationMode ? readRampVar(svg, "low") : "";
  const rampHigh = durationMode ? readRampVar(svg, "high") : "";
  const edgeMin = durationMode ? Math.min(0, ...layout.edges.map((e) => e.metricValue)) : 0;
  const edgeMax = durationMode ? Math.max(0, ...layout.edges.map((e) => e.metricValue)) : 0;

  const edgeColor = (e: EdgeLayout): string =>
    interpolateRamp(rampPosition(e.metricValue, edgeMin, edgeMax), rampLow, rampHigh);
  const nodeColor = (n: NodeLayout): string =>
    interpolateRamp(rampPosition(n.metricValue, edgeMin, edgeMax), rampLow, rampHigh);

  // Phase 24 — happy-path overlay. `.mining-lib-faded` lands on
  // off-path elements (opacity via CSS); `.mining-lib-happy` lands
  // on on-path elements. Off-path = in the fadedEdges/fadedNodes
  // set; on-path = overlay exists AND element is NOT in the set
  // (so when no pin is active, neither class lands anywhere).
  // Colour for `.mining-lib-happy` comes entirely from CSS rules
  // with higher specificity than the default `.mining-lib-edge` /
  // `.mining-lib-node rect` rules — inline presentation attrs lose
  // to CSS in the SVG cascade, so a class is the only reliable
  // way to override the default stroke/fill.
  const overlay = layout.overlay;
  const isFadedEdge = (e: EdgeLayout): boolean =>
    overlay?.fadedEdges.has(`${e.from}\t${e.to}`) ?? false;
  const isFadedNode = (n: NodeLayout): boolean => overlay?.fadedNodes.has(n.activity) ?? false;
  const isHappyEdge = (e: EdgeLayout): boolean =>
    overlay !== undefined && !overlay.fadedEdges.has(`${e.from}\t${e.to}`);
  const isHappyNode = (n: NodeLayout): boolean =>
    overlay !== undefined && !overlay.fadedNodes.has(n.activity);

  const edgeSelection = edgesGroup
    .selectAll<SVGPathElement, EdgeLayout>("path.mining-lib-edge")
    .data(layout.edges)
    .join("path")
    .attr("class", "mining-lib-edge")
    .classed("mining-lib-faded", isFadedEdge)
    .classed("mining-lib-happy", isHappyEdge)
    .attr("d", (e) => edgePath(e, nodesByActivity.get(e.from), nodesByActivity.get(e.to)))
    .attr("stroke-width", (e) => e.strokeWidth)
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round")
    .attr("marker-end", "url(#mining-lib-arrow)")
    .attr("data-from", (e) => e.from)
    .attr("data-to", (e) => e.to);

  if (durationMode) {
    edgeSelection.attr("stroke", edgeColor).attr("color", edgeColor);
  }

  const handlesGroup = viewport.append("g").attr("class", "mining-lib-bend-handles");

  type BendHandleDatum = {
    from: string;
    to: string;
    index: number;
    x: number;
    y: number;
  };

  const handleData: BendHandleDatum[] = [];
  for (const edge of layout.edges) {
    const anchor = handleAnchor(edge.points);
    if (!anchor) continue;
    handleData.push({
      from: edge.from,
      to: edge.to,
      index: anchor.index,
      x: anchor.point.x,
      y: anchor.point.y,
    });
  }

  handlesGroup
    .selectAll<SVGCircleElement, BendHandleDatum>("circle.mining-lib-bend-handle-hit")
    .data(handleData, (d) => `${d.from}→${d.to}#${d.index}`)
    .join("circle")
    .attr("class", "mining-lib-bend-handle-hit")
    .attr("cx", (d) => d.x)
    .attr("cy", (d) => d.y)
    .attr("r", HANDLE_HIT_RADIUS)
    .attr("data-from", (d) => d.from)
    .attr("data-to", (d) => d.to)
    .attr("data-index", (d) => d.index);

  handlesGroup
    .selectAll<SVGCircleElement, BendHandleDatum>("circle.mining-lib-bend-handle")
    .data(handleData, (d) => `${d.from}→${d.to}#${d.index}`)
    .join("circle")
    .attr("class", "mining-lib-bend-handle")
    .attr("cx", (d) => d.x)
    .attr("cy", (d) => d.y)
    .attr("r", HANDLE_VISIBLE_RADIUS)
    .attr("data-from", (d) => d.from)
    .attr("data-to", (d) => d.to)
    .attr("data-index", (d) => d.index);

  const labelsGroup = viewport.append("g").attr("class", "mining-lib-edge-labels");

  const labelGroups = labelsGroup
    .selectAll<SVGGElement, EdgeLayout>("g.mining-lib-edge-label")
    .data(layout.edges)
    .join("g")
    .attr("class", "mining-lib-edge-label")
    .classed("mining-lib-faded", isFadedEdge)
    .attr("data-from", (e) => e.from)
    .attr("data-to", (e) => e.to)
    .attr("data-self-loop", (e) => (e.from === e.to ? "true" : null))
    .attr("transform", (e) => {
      if (e.from === e.to) {
        const node = nodesByActivity.get(e.from);
        if (node) {
          const p = selfLoopLabelPos(e, node);
          return `translate(${p.x}, ${p.y})`;
        }
      }
      const p = edgeLabelPosition(collapsedPolyline(e.points), LABEL_OFFSET);
      return `translate(${p.x}, ${p.y})`;
    });

  labelGroups
    .append("rect")
    .attr("class", "mining-lib-edge-label-chip")
    .attr("rx", CHIP_RADIUS)
    .attr("ry", CHIP_RADIUS);

  labelGroups
    .append("text")
    .attr("class", "mining-lib-edge-label-text")
    .attr("x", 0)
    .attr("y", 0)
    .text((e) =>
      durationMode
        ? formatDuration(e.metricValue)
        : formatCount(pickCount(layout.countMode, e), layout.countMode),
    );

  // Size each chip from its measured text BBox so dynamic counts
  // (e.g. "1" vs "99,999") get a snug background. Headless DOMs
  // that return a zero-sized BBox fall back to fixed dimensions
  // so the rect still has a visible footprint.
  labelGroups.each(function () {
    const text = this.querySelector<SVGTextElement>("text.mining-lib-edge-label-text");
    const chip = this.querySelector<SVGRectElement>("rect.mining-lib-edge-label-chip");
    if (!text || !chip) return;
    let bbox: { x: number; y: number; width: number; height: number };
    try {
      bbox = text.getBBox();
    } catch {
      bbox = { x: 0, y: 0, width: 0, height: 0 };
    }
    const width = bbox.width > 0 ? bbox.width + CHIP_PADDING_X * 2 : CHIP_FALLBACK_WIDTH;
    const height = bbox.height > 0 ? bbox.height + CHIP_PADDING_Y * 2 : CHIP_FALLBACK_HEIGHT;
    chip.setAttribute("x", String(-width / 2));
    chip.setAttribute("y", String(-height / 2));
    chip.setAttribute("width", String(width));
    chip.setAttribute("height", String(height));
  });

  const nodesGroup = viewport.append("g").attr("class", "mining-lib-nodes");

  const nodeRadius = layout.theme?.nodeRadius ?? LIGHT_DEFAULTS.nodeRadius;

  const nodeSelection = nodesGroup
    .selectAll<SVGGElement, NodeLayout>("g.mining-lib-node")
    .data(layout.nodes)
    .join("g")
    .attr("class", "mining-lib-node")
    .classed("mining-lib-faded", isFadedNode)
    .classed("mining-lib-happy", isHappyNode)
    .attr("data-activity", (n) => n.activity)
    .attr("transform", (n) => `translate(${n.x - n.width / 2}, ${n.y - n.height / 2})`);

  const nodeRectSelection = nodeSelection
    .append("rect")
    .attr("width", (n) => n.width)
    .attr("height", (n) => n.height)
    .attr("rx", nodeRadius)
    .attr("ry", nodeRadius);

  if (durationMode) {
    nodeRectSelection.attr("fill", nodeColor);
  }

  nodeSelection
    .append("text")
    .attr("class", "mining-lib-node-label")
    .attr("x", (n) => n.width / 2)
    .attr("y", (n) => n.height / 2 - 6)
    .text((n) => n.activity);

  // Node count labels stay frequency-based even in duration mode.
  // Time labels are restricted to edges per the Phase 17 design;
  // showing a derived per-node duration here would be a 0 for every
  // terminal node and would surprise readers. Falling back to
  // absoluteFrequency keeps the in-rect number stable across modes.
  nodeSelection
    .append("text")
    .attr("class", "mining-lib-node-count")
    .attr("x", (n) => n.width / 2)
    .attr("y", (n) => n.height / 2 + 10)
    .text((n) =>
      durationMode
        ? String(n.absoluteFrequency)
        : formatCount(pickCount(layout.countMode, n), layout.countMode),
    );

  // Phase 23: terminal-node secondary label — mean / median total
  // case duration for cases ending at this activity. The ramp range
  // is computed across terminal durations (not edge durations) so
  // slow outcomes read amber even when their inbound edges are fast.
  const terminals = layout.terminalDurations;
  if (durationMode && terminals && terminals.size > 0) {
    const metricOf = (a: TerminalNodeDuration): number =>
      layout.countMode === "meanDuration" ? a.mean : a.median;
    const terminalValues = [...terminals.values()].map(metricOf);
    const terminalMin = Math.min(...terminalValues);
    const terminalMax = Math.max(...terminalValues);

    nodeSelection.each(function (n) {
      const agg = terminals.get(n.activity);
      if (!agg) return;
      const value = metricOf(agg);
      const color = interpolateRamp(
        rampPosition(value, terminalMin, terminalMax),
        rampLow,
        rampHigh,
      );

      const g = select(this)
        .append("g")
        .attr("class", "mining-lib-node-terminal")
        .attr("transform", `translate(${n.width / 2}, ${n.height / 2 + 26})`)
        .attr("color", color);

      // Inline bullseye — geometry mirrors ICONS.target. The SVG
      // element is built with D3's selection API (not HTML
      // `<template>` cloning) because it lives inside the diagram
      // SVG, not the chrome's HTML tree; the two creation paths stay
      // separate. currentColor + the parent <g>'s `color` attr
      // cascade the per-terminal ramp colour through stroke/fill.
      // The icon's x is set after the text BBox is measured so the
      // two never overlap, regardless of formatted-duration width.
      const icon = g
        .append("svg")
        .attr("class", "mining-lib-node-terminal-icon")
        .attr("width", 11)
        .attr("height", 11)
        .attr("viewBox", "0 0 24 24")
        .attr("fill", "none")
        .attr("stroke", "currentColor")
        .attr("stroke-width", 2)
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round")
        .attr("y", -5.5);
      icon.append("circle").attr("cx", 12).attr("cy", 12).attr("r", 10);
      icon.append("circle").attr("cx", 12).attr("cy", 12).attr("r", 6);
      icon.append("circle").attr("cx", 12).attr("cy", 12).attr("r", 2);

      const textSel = g
        .append("text")
        .attr("class", "mining-lib-node-terminal-text")
        .attr("x", 0)
        .attr("y", 0)
        .text(formatDuration(value));

      // Mirror the edge-label chip pattern: measure the rendered text
      // and lay the icon to its left with a 2 px gap. Headless DOMs
      // (jsdom) raise / return 0 — keep a sensible fallback so the
      // layout still places the icon to the left in unit tests.
      let textWidth = 24;
      try {
        const w = (textSel.node() as SVGTextElement).getBBox().width;
        if (w > 0) textWidth = w;
      } catch {
        // jsdom — fall back to the default textWidth.
      }
      icon.attr("x", -textWidth / 2 - 13);
    });
  }
}

function formatCount(value: number, mode: CountMode): string {
  if (mode === "meanRepetitions" && !Number.isInteger(value)) {
    return value.toFixed(1);
  }
  return String(value);
}

export function edgePath(edge: EdgeLayout, fromNode?: NodeLayout, toNode?: NodeLayout): string {
  return catmullRomPath(effectivePoints(edge, fromNode, toNode));
}

export function edgeMidpoint(edge: EdgeLayout): { x: number; y: number } {
  return edge.points[Math.floor(edge.points.length / 2)] ?? { x: 0, y: 0 };
}

/**
 * Phase 24 — label position for a self-loop edge. Dagre routes
 * self-loops as a bowed path whose midpoint sits inside the source
 * node's bounding box, so the default `edgeLabelPosition` lays the
 * chip on top of the node. Pushing the label outward along the
 * vector from the node centre to the bow apex by
 * `node.height/2 + 8 px` clears the rectangle.
 *
 * The 8 px gap is a renderer constant (matches the gap between the
 * count label and the terminal-node duration label from Phase 23,
 * `node.height/2 + 26` reduced for the smaller chip).
 *
 * Fallback direction `(0, -1)` (above the node) catches the
 * pathological case where the apex coincides with the node centre.
 */
const SELF_LOOP_LABEL_GAP_PX = 8;
function selfLoopLabelPos(edge: EdgeLayout, node: NodeLayout): { x: number; y: number } {
  const apex = edge.points[Math.floor(edge.points.length / 2)] ?? { x: node.x, y: node.y };
  const vx = apex.x - node.x;
  const vy = apex.y - node.y;
  const len = Math.hypot(vx, vy);
  const ux = len > 0 ? vx / len : 0;
  const uy = len > 0 ? vy / len : -1;
  const offset = node.height / 2 + SELF_LOOP_LABEL_GAP_PX;
  return { x: apex.x + ux * offset, y: apex.y + uy * offset };
}

/**
 * Returns the single bend-handle anchor for an edge polyline,
 * or null when the edge has fewer than two points.
 *
 * - `length >= 3` → the dagre-sample midpoint
 *   `points[Math.floor(length/2)]` (matches `edgeMidpoint`).
 * - `length === 2` → the geometric midpoint between the two
 *   endpoints, with `index = 1` to mirror the post-collapse
 *   shape (the polyline becomes `[start, dragged, end]` after
 *   the first bend drag).
 */
export function handleAnchor(
  points: { x: number; y: number }[],
): { index: number; point: { x: number; y: number } } | null {
  if (points.length < 2) return null;
  if (points.length === 2) {
    const a = points[0];
    const b = points[1];
    if (!a || !b) return null;
    return { index: 1, point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }
  const i = Math.floor(points.length / 2);
  const p = points[i];
  if (!p) return null;
  return { index: i, point: { x: p.x, y: p.y } };
}

function effectivePoints(
  edge: EdgeLayout,
  fromNode: NodeLayout | undefined,
  toNode: NodeLayout | undefined,
): { x: number; y: number }[] {
  const points = collapsedPolyline(edge.points);
  if (points.length < 2) return points;
  let first = points[0];
  let last = points[points.length - 1];
  if (!first || !last) return points;
  if (fromNode) {
    const neighbour = points[1];
    if (neighbour) first = endpointOnNode(fromNode, neighbour, 0);
  }
  if (toNode) {
    const neighbour = points[points.length - 2];
    if (neighbour) last = endpointOnNode(toNode, neighbour, ARROW_CLEARANCE);
  }
  return [first, ...points.slice(1, -1), last];
}

/**
 * Returns the rendered polyline for an edge: the start, the
 * handle-anchor point, and the end. Mirrors `handleAnchor` so the
 * curve at rest already shows the same clean three-point bend the
 * user sees during drag — no shape jump on grab. The internal
 * `EdgeLayout.points` is left untouched so `applyEdgeOverrides`
 * and node-drag endpoint stamping continue to compose against
 * dagre's full polyline.
 */
export function collapsedPolyline(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 2) return points;
  const anchor = handleAnchor(points);
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || !anchor) return points;
  // Already three-point (post-drag override): keep as-is to avoid
  // re-anchoring on a stale midpoint.
  if (points.length === 3) return points;
  return [first, anchor.point, last];
}

/**
 * Renders a dagre-routed polyline as a Catmull-Rom spline expressed as a
 * chain of cubic-bezier `C` segments. Each segment's control points come
 * from the neighbouring polyline points (centripetal Catmull-Rom with
 * uniform tension 1/6), so the curve passes through every dagre bend
 * with C1 continuity. 2-point polylines render as a straight cubic
 * (indistinguishable from `L`, but using `C` keeps the `d` attribute
 * shape consistent across all edges and all drag states).
 */
function catmullRomPath(points: { x: number; y: number }[]): string {
  const n = points.length;
  const first = points[0];
  if (!first) return "";
  if (n === 1) return `M ${first.x} ${first.y}`;
  const parts: string[] = [`M ${first.x} ${first.y}`];
  for (let i = 0; i < n - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (!p1 || !p2) continue;
    const p0 = points[i - 1] ?? p1;
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    parts.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
  }
  return parts.join(" ");
}
