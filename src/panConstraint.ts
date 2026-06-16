/**
 * Node/bend drag clamping — keeps a *dragged element* (node or edge bend)
 * inside the visible canvas so it can't be dropped off-screen. This governs
 * element drags only: the camera pan itself is unbounded (free pan — see the
 * zoom behaviour in `createDiagram`), so there is no longer a pan clamp here.
 */
function clampWithin(value: number, lo: number, hi: number): number {
  // A node wider/taller than the viewport can't satisfy both edges — centre it.
  if (lo > hi) return (lo + hi) / 2;
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Phase 32 follow-up — keep a dragged node/edge inside the visible canvas
 * ("can't drag outside the canvas"). Given a drag point in content
 * coordinates, the node's half-extent, the visible viewport size (SVG
 * pixels), and the current pan/zoom transform, returns the point clamped
 * so the element stays fully within the on-screen drawing area.
 *
 * The visible window is mapped into content space through the transform
 * (`(screen - translate) / scale`), so the clamp tracks the embedder's
 * canvas size and the live zoom/pan with no assumed dimensions. A
 * zero-size viewport (jsdom / detached host) returns the point unchanged
 * so headless drags are not pinned.
 */
export function clampDragPoint(
  point: { x: number; y: number },
  half: { x: number; y: number },
  viewport: { width: number; height: number },
  transform: { x: number; y: number; k: number },
): { x: number; y: number } {
  if (viewport.width <= 0 || viewport.height <= 0) {
    return { x: point.x, y: point.y };
  }
  const minX = (0 - transform.x) / transform.k;
  const maxX = (viewport.width - transform.x) / transform.k;
  const minY = (0 - transform.y) / transform.k;
  const maxY = (viewport.height - transform.y) / transform.k;
  return {
    x: clampWithin(point.x, minX + half.x, maxX - half.x),
    y: clampWithin(point.y, minY + half.y, maxY - half.y),
  };
}
