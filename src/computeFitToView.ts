export type FitTransform = { k: number; x: number; y: number };

const IDENTITY: FitTransform = { k: 1, x: 0, y: 0 };

export function computeFitToView(
  layout: { width: number; height: number; minX?: number; minY?: number },
  viewport: { width: number; height: number },
  padding: number,
): FitTransform {
  // Padding is library-controlled — strict.
  if (!Number.isFinite(padding) || padding < 0) {
    throw new TypeError("computeFitToView: padding must be a finite, non-negative number");
  }
  // Layout comes from dagre (may be -Infinity for empty graphs); viewport
  // comes from getBoundingClientRect (always finite, but may be 0 when the
  // host is detached). Both degenerate to identity rather than throwing —
  // an empty diagram is a normal state, not a programmer error.
  if (
    !Number.isFinite(layout.width) ||
    !Number.isFinite(layout.height) ||
    layout.width <= 0 ||
    layout.height <= 0
  ) {
    return { ...IDENTITY };
  }
  if (
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return { ...IDENTITY };
  }

  const availW = viewport.width - 2 * padding;
  const availH = viewport.height - 2 * padding;
  if (availW <= 0 || availH <= 0) return { ...IDENTITY };

  const k = Math.min(availW / layout.width, availH / layout.height, 1);
  // Centre the box. When the content box has a non-(0,0) origin (content
  // dragged outside the dagre layout box), shift by -origin*k so the box's
  // own centre — not the coordinate origin — lands at the viewport centre.
  const minX = layout.minX ?? 0;
  const minY = layout.minY ?? 0;
  const x = (viewport.width - layout.width * k) / 2 - minX * k;
  const y = (viewport.height - layout.height * k) / 2 - minY * k;
  return { k, x, y };
}
