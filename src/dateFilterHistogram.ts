/**
 * Date-filter histogram brush (Phase 26).
 *
 * SVG mini-histogram of event volume with two draggable handles
 * and a selection overlay. Lives inside the date-filter section's
 * `<details>` body (`dateFilterSection.ts`).
 *
 * Interaction model:
 * - Drag handles: live SVG geometry update on drag, commit on
 *   release (matches Phase 8 edge-bend-drag idiom, Decision D8).
 * - Drag inside selection: translates both bounds, clamped to
 *   the log range, commits on release.
 * - Click on background outside selection: snaps the nearest
 *   handle to the click position and commits immediately.
 *
 * The histogram is a pure function of `(log, bounds)` — re-renders
 * via `update()` don't need to track in-flight drag state because
 * drags commit on release.
 */
import { type D3DragEvent, drag as d3drag, type SubjectPosition } from "d3-drag";
import { scaleLinear } from "d3-scale";
import { select } from "d3-selection";
import type { DateAnchor } from "./dateFilter.js";
import {
  bucketCasesByAnchor,
  type EventVolumeBucket,
  formatHistogramBucketTooltip,
  logDateRange,
  msToIsoDate,
  parseDateBound,
} from "./dateFilter.js";
import type { EventLog } from "./types.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export type DateFilterHistogramHooks = {
  /** Called once when a drag releases or a snap-click fires. */
  onCommit(from: string | null, to: string | null): void;
  /**
   * Called on every drag tick with the in-flight bounds — purely
   * visual (no clause push, no diagram re-render). Lets the section
   * sync the `<input type="date">` values to the moving handles so
   * the user sees the bounds they're about to commit. Optional;
   * `onCommit` alone is enough for the picker to work.
   */
  onDragPreview?(from: string | null, to: string | null): void;
};

export type DateFilterHistogramOptions = {
  log: EventLog;
  bucketCount: number;
  /**
   * Anchor drives both the bucket counts (cases per bucket per
   * anchor — see `bucketCasesByAnchor`) and the verb in each
   * bar's hover tooltip. The histogram thus visually mirrors the
   * filter that would result from selecting that bucket alone.
   */
  anchor: DateAnchor;
  hooks: DateFilterHistogramHooks;
  width?: number;
  height?: number;
  inset?: number;
};

export type DateFilterHistogramInstance = {
  element: SVGSVGElement;
  /** Re-position handles + overlay + bar dimming for new bounds. */
  update(from: string | null, to: string | null): void;
  destroy(): void;
};

const DEFAULT_WIDTH = 220;
const DEFAULT_HEIGHT = 48;
const DEFAULT_INSET = 8;

export function createDateFilterHistogram(
  opts: DateFilterHistogramOptions,
): DateFilterHistogramInstance {
  const width = opts.width ?? DEFAULT_WIDTH;
  const height = opts.height ?? DEFAULT_HEIGHT;
  const inset = opts.inset ?? DEFAULT_INSET;
  const hooks = opts.hooks;

  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.classList.add("mining-lib-date-histogram");

  const range = logDateRange(opts.log);
  const buckets: EventVolumeBucket[] =
    range === null ? [] : bucketCasesByAnchor(opts.log, opts.bucketCount, opts.anchor);

  // Empty log → render nothing; instance still exposes update/destroy
  // so callers can swap logs without recreating the wrapper.
  if (range === null) {
    return {
      element: svg,
      update: () => undefined,
      destroy: () => {
        svg.remove();
      },
    };
  }

  const xScale = scaleLinear()
    .domain([range.min.getTime(), range.max.getTime()])
    .range([inset, width - inset]);

  // Bars. Each bar wraps a <title> child for browser-native hover
  // tooltip — `formatHistogramBucketTooltip` describes the bucket in
  // the same vocabulary the brush filter uses ("N cases started" /
  // "N cases active" / etc.) so the bar's meaning matches the
  // current anchor.
  const maxCount = buckets.reduce((m, b) => (b.count > m ? b.count : m), 1);
  const bars: SVGRectElement[] = [];
  const usableHeight = height - 4;
  for (const bucket of buckets) {
    const rect = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
    rect.classList.add("mining-lib-date-bar");
    const x = xScale(bucket.x0);
    const next = xScale(bucket.x1);
    const w = Math.max(0, next - x - 1);
    const h = bucket.count === 0 ? 1 : (bucket.count / maxCount) * usableHeight;
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(height - 2 - h));
    rect.setAttribute("width", String(w));
    rect.setAttribute("height", String(h));
    rect.dataset.x0 = String(bucket.x0);
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = formatHistogramBucketTooltip(
      bucket.x0,
      bucket.x1,
      bucket.count,
      opts.anchor,
    );
    rect.appendChild(title);
    svg.appendChild(rect);
    bars.push(rect);
  }

  // Selection overlay.
  const selection = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
  selection.classList.add("mining-lib-date-selection");
  selection.setAttribute("y", "0");
  selection.setAttribute("height", String(height));
  svg.appendChild(selection);

  // Handles.
  const leftHandle = createHandle();
  const rightHandle = createHandle();
  svg.appendChild(leftHandle);
  svg.appendChild(rightHandle);

  // Working state — pixel positions of the two handles. update() is the
  // single writer; drag handlers read and write during drag.
  let leftX = inset;
  let rightX = width - inset;
  let currentFrom: string | null = null;
  let currentTo: string | null = null;
  // Browser fires a `click` after every drag mouseup. Suppress the next
  // one so the background-click snap doesn't fire alongside a drag commit.
  let suppressNextClick = false;

  function paint(): void {
    leftHandle.setAttribute("x1", String(leftX));
    leftHandle.setAttribute("x2", String(leftX));
    rightHandle.setAttribute("x1", String(rightX));
    rightHandle.setAttribute("x2", String(rightX));
    selection.setAttribute("x", String(leftX));
    selection.setAttribute("width", String(Math.max(0, rightX - leftX)));
    for (const bar of bars) {
      const x0 = Number(bar.dataset.x0);
      const barX = xScale(x0);
      const inRange = barX >= leftX && barX <= rightX;
      bar.classList.toggle("mining-lib-date-bar-dim", !inRange);
    }
  }

  function update(from: string | null, to: string | null): void {
    currentFrom = from;
    currentTo = to;
    leftX =
      from === null ? inset : clamp(xScale(parseDateBound(from, "from")), inset, width - inset);
    rightX =
      to === null ? width - inset : clamp(xScale(parseDateBound(to, "to")), inset, width - inset);
    if (rightX < leftX) {
      // Defensive: if a programmatic call sent inverted bounds, mirror the
      // matcher's auto-swap in the visual.
      const t = leftX;
      leftX = rightX;
      rightX = t;
    }
    paint();
  }

  function xToIso(x: number): string {
    const clamped = clamp(x, inset, width - inset);
    return msToIsoDate(xScale.invert(clamped));
  }

  function commit(newFrom: string | null, newTo: string | null): void {
    // Internal state advances to the committed values so the next
    // click-snap reads the post-commit bound for the unmoved side.
    currentFrom = newFrom;
    currentTo = newTo;
    hooks.onCommit(newFrom, newTo);
  }

  // d3-drag — left handle / right handle / overlay.
  attachHandleDrag(leftHandle, "left");
  attachHandleDrag(rightHandle, "right");
  attachSelectionDrag(selection);

  // Click on background snaps the nearest handle. Only the moved side's
  // bound updates; the other side keeps its prior null-or-concrete value.
  svg.addEventListener("click", (e) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    const target = e.target as Element | null;
    if (target?.classList.contains("mining-lib-date-handle")) return;
    if (target?.classList.contains("mining-lib-date-selection")) return;
    const rect = svg.getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, inset, width - inset);
    if (x >= leftX && x <= rightX) return; // inside selection — ignore
    if (Math.abs(x - leftX) <= Math.abs(x - rightX)) {
      leftX = x;
      paint();
      commit(xToIso(leftX), currentTo);
    } else {
      rightX = x;
      paint();
      commit(currentFrom, xToIso(rightX));
    }
  });

  return {
    element: svg,
    update,
    destroy: () => {
      svg.remove();
    },
  };

  // --- helpers (closure-scoped so they see leftX/rightX/etc.) ---

  function createHandle(): SVGLineElement {
    const line = document.createElementNS(SVG_NS, "line") as SVGLineElement;
    line.classList.add("mining-lib-date-handle");
    line.setAttribute("y1", "0");
    line.setAttribute("y2", String(height));
    return line;
  }

  function attachHandleDrag(handle: SVGLineElement, which: "left" | "right"): void {
    const behavior = d3drag<SVGLineElement, unknown, SubjectPosition>()
      .container(svg)
      .subject(() => ({ x: which === "left" ? leftX : rightX, y: 0 }))
      .on("start", (event: D3DragEvent<SVGLineElement, unknown, SubjectPosition>) => {
        event.sourceEvent.stopPropagation();
      })
      .on("drag", (event: D3DragEvent<SVGLineElement, unknown, SubjectPosition>) => {
        const x = clamp(event.x, inset, width - inset);
        if (which === "left") {
          leftX = Math.min(x, rightX);
        } else {
          rightX = Math.max(x, leftX);
        }
        paint();
        if (hooks.onDragPreview) {
          if (which === "left") hooks.onDragPreview(xToIso(leftX), currentTo);
          else hooks.onDragPreview(currentFrom, xToIso(rightX));
        }
      })
      .on("end", () => {
        suppressNextClick = true;
        if (which === "left") commit(xToIso(leftX), currentTo);
        else commit(currentFrom, xToIso(rightX));
      });
    select(handle).call(behavior);
  }

  function attachSelectionDrag(overlay: SVGRectElement): void {
    let startX = 0;
    let startLeft = 0;
    let startRight = 0;
    const behavior = d3drag<SVGRectElement, unknown, SubjectPosition>()
      .container(svg)
      .subject(() => ({ x: leftX, y: 0 }))
      .on("start", (event) => {
        event.sourceEvent.stopPropagation();
        startX = event.x;
        startLeft = leftX;
        startRight = rightX;
      })
      .on("drag", (event) => {
        const dx = event.x - startX;
        const span = startRight - startLeft;
        let newLeft = startLeft + dx;
        let newRight = startRight + dx;
        if (newLeft < inset) {
          newLeft = inset;
          newRight = inset + span;
        }
        if (newRight > width - inset) {
          newRight = width - inset;
          newLeft = newRight - span;
        }
        leftX = newLeft;
        rightX = newRight;
        paint();
        if (hooks.onDragPreview) {
          hooks.onDragPreview(xToIso(leftX), xToIso(rightX));
        }
      })
      .on("end", () => {
        suppressNextClick = true;
        commit(xToIso(leftX), xToIso(rightX));
      });
    select(overlay).call(behavior);
  }
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
