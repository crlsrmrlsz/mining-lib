import { type D3DragEvent, drag as d3drag, type SubjectPosition } from "d3-drag";
import { select } from "d3-selection";
import type { ZoomTransform } from "d3-zoom";
import {
  type DfgLayout,
  type EdgeLayout,
  edgeLabelPosition,
  type NodeLayout,
} from "./layoutDfg.js";
import { clampDragPoint } from "./panConstraint.js";
import { collapsedPolyline, edgePath, handleAnchor, LABEL_OFFSET } from "./renderDfg.js";

/**
 * What the node/edge-bend drag behaviours need from the diagram coordinator:
 * the SVG, the live zoom transform (for screen↔world clamping), and the
 * override Maps to record dropped positions into (shared by reference).
 * Near-pure d3-drag wiring — extracted from the coordinator (Phase 38-II E4)
 * without touching the retained camera/draw core.
 */
export interface DragContext {
  svg: SVGSVGElement;
  getCurrentTransform: () => ZoomTransform;
  nodeOverrides: Map<string, { x: number; y: number }>;
  edgeOverrides: Map<string, { x: number; y: number }[]>;
}

export interface DiagramDrag {
  /** Make every rendered node draggable; incident edges follow live. */
  attachNodeDrag(layout: DfgLayout): void;
  /** Make every bend handle draggable; the edge reshapes live. */
  attachBendDrag(layout: DfgLayout): void;
}

type BendDragDatum = {
  from: string;
  to: string;
  index: number;
  edge: EdgeLayout;
  x: number;
  y: number;
};

export function createDiagramDrag(ctx: DragContext): DiagramDrag {
  const { svg, nodeOverrides, edgeOverrides } = ctx;
  const svgSelection = select(svg);
  const viewportNode = (): SVGGElement => svg.querySelector("g.mining-lib-viewport") as SVGGElement;

  function attachNodeDrag(layout: DfgLayout): void {
    const nodesByActivity = new Map(layout.nodes.map((n) => [n.activity, n]));
    const behavior = d3drag<SVGGElement, NodeLayout, SubjectPosition>()
      .container(viewportNode)
      .subject((_event, d) => ({ x: d.x, y: d.y }))
      .on("start", (event: D3DragEvent<SVGGElement, NodeLayout, SubjectPosition>) => {
        event.sourceEvent.stopPropagation();
      })
      .on("drag", (event, d) => {
        // Clamp so the node stays fully inside the visible canvas — you can't
        // drag it off-screen (Phase 32 follow-up).
        const p = clampDragPoint(
          { x: event.x, y: event.y },
          { x: d.width / 2, y: d.height / 2 },
          svg.getBoundingClientRect(),
          ctx.getCurrentTransform(),
        );
        d.x = p.x;
        d.y = p.y;
        svgSelection
          .select<SVGGElement>(`g.mining-lib-node[data-activity="${d.activity}"]`)
          .attr("transform", `translate(${d.x - d.width / 2}, ${d.y - d.height / 2})`);
        for (const e of layout.edges) {
          const fromMatches = e.from === d.activity;
          const toMatches = e.to === d.activity;
          if (!fromMatches && !toMatches) continue;
          if (e.points.length === 0) continue;
          if (fromMatches) e.points[0] = { x: d.x, y: d.y };
          if (toMatches) e.points[e.points.length - 1] = { x: d.x, y: d.y };
          const fromNode = nodesByActivity.get(e.from);
          const toNode = nodesByActivity.get(e.to);
          const labelPos = edgeLabelPosition(collapsedPolyline(e.points), LABEL_OFFSET);
          svgSelection
            .select<SVGPathElement>(
              `path.mining-lib-edge[data-from="${e.from}"][data-to="${e.to}"]`,
            )
            .attr("d", edgePath(e, fromNode, toNode));
          svgSelection
            .select<SVGGElement>(
              `g.mining-lib-edge-label[data-from="${e.from}"][data-to="${e.to}"]`,
            )
            .attr("transform", `translate(${labelPos.x}, ${labelPos.y})`);
        }
      })
      .on("end", (_event, d) => {
        nodeOverrides.set(d.activity, { x: d.x, y: d.y });
      });

    svgSelection.selectAll<SVGGElement, NodeLayout>("g.mining-lib-node").call(behavior);
  }

  function attachBendDrag(layout: DfgLayout): void {
    const nodesByActivity = new Map(layout.nodes.map((n) => [n.activity, n]));
    const handleData: BendDragDatum[] = [];
    const liveHandles = svgSelection.selectAll<SVGCircleElement, unknown>(
      "circle.mining-lib-bend-handle-hit",
    );
    liveHandles.each(function () {
      const from = this.getAttribute("data-from") ?? "";
      const to = this.getAttribute("data-to") ?? "";
      const edge = layout.edges.find((e) => e.from === from && e.to === to);
      if (!edge) return;
      const anchor = handleAnchor(edge.points);
      if (!anchor) return;
      handleData.push({
        from,
        to,
        index: anchor.index,
        edge,
        x: anchor.point.x,
        y: anchor.point.y,
      });
    });

    const behavior = d3drag<SVGCircleElement, BendDragDatum, SubjectPosition>()
      .container(viewportNode)
      .subject((_event, d) => ({ x: d.x, y: d.y }))
      .on("start", (event: D3DragEvent<SVGCircleElement, BendDragDatum, SubjectPosition>, d) => {
        event.sourceEvent.stopPropagation();
        // Collapse the polyline to a clean three-point bend on grab so the
        // curve pivots around the dragged dot from the very first frame — no
        // fighting against dagre's other waypoints.
        const pts = d.edge.points;
        if (pts.length < 2) return;
        const first = pts[0];
        const last = pts[pts.length - 1];
        if (!first || !last) return;
        d.edge.points = [first, { x: d.x, y: d.y }, last];
        d.index = 1;
        svgSelection
          .selectAll<SVGCircleElement, unknown>(
            `circle.mining-lib-bend-handle[data-from="${d.from}"][data-to="${d.to}"], ` +
              `circle.mining-lib-bend-handle-hit[data-from="${d.from}"][data-to="${d.to}"]`,
          )
          .attr("data-index", "1");
      })
      .on("drag", (event, d) => {
        // Clamp the bend point to the visible canvas (Phase 32 follow-up).
        const p = clampDragPoint(
          { x: event.x, y: event.y },
          { x: 0, y: 0 },
          svg.getBoundingClientRect(),
          ctx.getCurrentTransform(),
        );
        d.x = p.x;
        d.y = p.y;
        d.edge.points[d.index] = { x: d.x, y: d.y };
        svgSelection
          .selectAll<SVGCircleElement, unknown>(
            `circle.mining-lib-bend-handle[data-from="${d.from}"][data-to="${d.to}"], ` +
              `circle.mining-lib-bend-handle-hit[data-from="${d.from}"][data-to="${d.to}"]`,
          )
          .attr("cx", d.x)
          .attr("cy", d.y);
        const fromNode = nodesByActivity.get(d.edge.from);
        const toNode = nodesByActivity.get(d.edge.to);
        const labelPos = edgeLabelPosition(d.edge.points, LABEL_OFFSET);
        svgSelection
          .select<SVGPathElement>(`path.mining-lib-edge[data-from="${d.from}"][data-to="${d.to}"]`)
          .attr("d", edgePath(d.edge, fromNode, toNode));
        svgSelection
          .select<SVGGElement>(`g.mining-lib-edge-label[data-from="${d.from}"][data-to="${d.to}"]`)
          .attr("transform", `translate(${labelPos.x}, ${labelPos.y})`);
      })
      .on("end", (_event, d) => {
        edgeOverrides.set(`${d.from}→${d.to}`, d.edge.points.slice());
      });

    liveHandles
      .data(handleData, (d) => `${(d as BendDragDatum).from}→${(d as BendDragDatum).to}`)
      .call(behavior);
  }

  return { attachNodeDrag, attachBendDrag };
}
