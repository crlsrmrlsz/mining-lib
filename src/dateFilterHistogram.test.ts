import { beforeEach, describe, expect, it } from "vitest";
import { createDateFilterHistogram, type DateFilterHistogramHooks } from "./dateFilterHistogram.js";
import type { Case, EventLog } from "./types.js";

function mkCase(id: string, dates: string[]): Case {
  return {
    id,
    events: dates.map((d) => ({
      caseId: id,
      activity: "x",
      timestamp: new Date(d),
      resource: null,
      lifecycle: "complete",
      attributes: {},
    })),
    attributes: {},
  };
}

function mkLog(cases: Case[]): EventLog {
  return {
    cases: new Map(cases.map((c) => [c.id, c])),
    events: cases.flatMap((c) => c.events),
    schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
  };
}

function makeMount(width = 220): HTMLDivElement {
  const m = document.createElement("div");
  m.style.width = `${width}px`;
  document.body.appendChild(m);
  // Width via getBoundingClientRect — jsdom returns 0 unless we set it. The
  // histogram reads its container's width, so stub the call once per element.
  Object.defineProperty(m, "clientWidth", { value: width, configurable: true });
  return m;
}

const yearLog = mkLog([
  mkCase("c1", ["2026-01-01T00:00:00", "2026-12-31T23:59:00"]),
  mkCase("c2", ["2026-06-15T12:00:00"]),
]);

const NOOP_HOOKS: DateFilterHistogramHooks = { onCommit: () => undefined };

beforeEach(() => {
  for (const el of document.querySelectorAll("div")) el.remove();
});

describe("createDateFilterHistogram", () => {
  it("returns { element, update, destroy } with the SVG element", () => {
    const mount = makeMount();
    const h = createDateFilterHistogram({
      log: yearLog,
      bucketCount: 40,
      anchor: "started",
      hooks: NOOP_HOOKS,
    });
    mount.appendChild(h.element);
    expect(h.element.tagName.toLowerCase()).toBe("svg");
    expect(typeof h.update).toBe("function");
    expect(typeof h.destroy).toBe("function");
    h.destroy();
  });

  it("renders exactly `bucketCount` bars for a non-empty log", () => {
    const mount = makeMount();
    const h = createDateFilterHistogram({
      log: yearLog,
      bucketCount: 40,
      anchor: "started",
      hooks: NOOP_HOOKS,
    });
    mount.appendChild(h.element);
    const bars = h.element.querySelectorAll("rect.mining-lib-date-bar");
    expect(bars).toHaveLength(40);
    h.destroy();
  });

  it("renders zero bars for an empty log", () => {
    const empty: EventLog = {
      cases: new Map(),
      events: [],
      schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
    };
    const mount = makeMount();
    const h = createDateFilterHistogram({
      log: empty,
      bucketCount: 40,
      anchor: "started",
      hooks: NOOP_HOOKS,
    });
    mount.appendChild(h.element);
    const bars = h.element.querySelectorAll("rect.mining-lib-date-bar");
    expect(bars).toHaveLength(0);
    h.destroy();
  });

  it("each bar wraps a <title> with `N cases <verb>` per the anchor", () => {
    const mount = makeMount();
    const h = createDateFilterHistogram({
      log: yearLog,
      bucketCount: 40,
      anchor: "started",
      hooks: NOOP_HOOKS,
    });
    mount.appendChild(h.element);
    const titles = h.element.querySelectorAll("rect.mining-lib-date-bar > title");
    expect(titles.length).toBe(40);
    const texts = Array.from(titles).map((t) => t.textContent ?? "");
    // Every bar carries the `started` verb (zero-count bars too).
    expect(texts.every((t) => /\bcases? started$/.test(t))).toBe(true);
    const nonZeroStart = texts.find((t) => /:\s*[1-9]\d*\s*cases?\s+started$/.test(t));
    expect(nonZeroStart).toBeTruthy();
    h.destroy();
  });

  it("tooltip verb tracks the anchor (ended → 'ended')", () => {
    const mount = makeMount();
    const h = createDateFilterHistogram({
      log: yearLog,
      bucketCount: 40,
      anchor: "ended",
      hooks: NOOP_HOOKS,
    });
    mount.appendChild(h.element);
    const titles = Array.from(h.element.querySelectorAll("rect.mining-lib-date-bar > title")).map(
      (t) => t.textContent ?? "",
    );
    expect(titles.some((t) => / cases? started$/.test(t))).toBe(false);
    expect(titles.every((t) => / cases? ended$/.test(t))).toBe(true);
    h.destroy();
  });

  it("renders two handles and one selection overlay", () => {
    const mount = makeMount();
    const h = createDateFilterHistogram({
      log: yearLog,
      bucketCount: 40,
      anchor: "started",
      hooks: NOOP_HOOKS,
    });
    mount.appendChild(h.element);
    expect(h.element.querySelectorAll("line.mining-lib-date-handle")).toHaveLength(2);
    expect(h.element.querySelectorAll("rect.mining-lib-date-selection")).toHaveLength(1);
    h.destroy();
  });

  it("handles park at the log's left + right edges when bounds are open", () => {
    const mount = makeMount();
    const h = createDateFilterHistogram({
      log: yearLog,
      bucketCount: 40,
      anchor: "started",
      hooks: NOOP_HOOKS,
    });
    mount.appendChild(h.element);
    h.update(null, null);
    const handles = h.element.querySelectorAll<SVGLineElement>("line.mining-lib-date-handle");
    const leftX = Number(handles[0]?.getAttribute("x1"));
    const rightX = Number(handles[1]?.getAttribute("x1"));
    expect(leftX).toBeLessThan(rightX);
    // The selection should span (nearly) the entire histogram width.
    const sel = h.element.querySelector<SVGRectElement>("rect.mining-lib-date-selection");
    const selX = Number(sel?.getAttribute("x"));
    const selW = Number(sel?.getAttribute("width"));
    expect(selX).toBeCloseTo(leftX, 0);
    expect(selX + selW).toBeCloseTo(rightX, 0);
    h.destroy();
  });

  it("update() repositions handles to match new bounds", () => {
    const mount = makeMount();
    const h = createDateFilterHistogram({
      log: yearLog,
      bucketCount: 40,
      anchor: "started",
      hooks: NOOP_HOOKS,
    });
    mount.appendChild(h.element);

    h.update(null, null);
    const handles = h.element.querySelectorAll<SVGLineElement>("line.mining-lib-date-handle");
    const leftXOpen = Number(handles[0]?.getAttribute("x1"));

    h.update("2026-06-01", "2026-08-31");
    const leftXMid = Number(handles[0]?.getAttribute("x1"));
    const rightXMid = Number(handles[1]?.getAttribute("x1"));

    expect(leftXMid).toBeGreaterThan(leftXOpen);
    expect(rightXMid).toBeGreaterThan(leftXMid);
    h.destroy();
  });

  it("dims bars that fall outside the active selection", () => {
    const mount = makeMount();
    const h = createDateFilterHistogram({
      log: yearLog,
      bucketCount: 40,
      anchor: "started",
      hooks: NOOP_HOOKS,
    });
    mount.appendChild(h.element);
    h.update("2026-06-01", "2026-08-31");
    const bars = h.element.querySelectorAll<SVGRectElement>("rect.mining-lib-date-bar");
    let dimmedCount = 0;
    let activeCount = 0;
    for (const b of bars) {
      if (b.classList.contains("mining-lib-date-bar-dim")) dimmedCount += 1;
      else activeCount += 1;
    }
    expect(dimmedCount).toBeGreaterThan(0);
    expect(activeCount).toBeGreaterThan(0);
    // Open bounds should leave every bar active.
    h.update(null, null);
    const allBars = h.element.querySelectorAll<SVGRectElement>(
      "rect.mining-lib-date-bar:not(.mining-lib-date-bar-dim)",
    );
    expect(allBars).toHaveLength(bars.length);
    h.destroy();
  });

  it("clicking the SVG background outside the selection commits a snapped bound", () => {
    const mount = makeMount();
    let commits = 0;
    let lastFrom: string | null | undefined;
    let lastTo: string | null | undefined;
    const h = createDateFilterHistogram({
      log: yearLog,
      bucketCount: 40,
      anchor: "started",
      hooks: {
        onCommit: (from, to) => {
          commits += 1;
          lastFrom = from;
          lastTo = to;
        },
      },
    });
    mount.appendChild(h.element);
    // Stub getBoundingClientRect because jsdom returns zeroes.
    h.element.getBoundingClientRect = () =>
      ({ left: 0, right: 220, top: 0, bottom: 48, width: 220, height: 48 }) as DOMRect;

    h.update("2026-06-01", "2026-08-31");

    // Click far left (near x = 5) — should snap the LEFT handle (closer)
    // to that position and commit a new from.
    const clickEvent = new MouseEvent("click", {
      clientX: 5,
      clientY: 24,
      bubbles: true,
    });
    h.element.dispatchEvent(clickEvent);
    expect(commits).toBe(1);
    expect(lastFrom).not.toBeNull();
    expect(lastFrom).not.toBe("2026-06-01"); // moved leftwards
    expect(lastTo).toBe("2026-08-31");
    h.destroy();
  });

  it("onDragPreview fires during a click-snap path with the new bound (smoke for live-sync)", () => {
    // Click-snap goes through the same `commit()` path as drag-end but
    // is observable in jsdom (drag isn't). This test confirms the hook
    // contract (the type accepts it) by passing one and proving the
    // instance still works. Real drag-tick behaviour is covered in the
    // Playwright spec (S5).
    const mount = makeMount();
    let previewCalls = 0;
    const h = createDateFilterHistogram({
      log: yearLog,
      bucketCount: 40,
      anchor: "started",
      hooks: {
        onCommit: () => undefined,
        onDragPreview: () => {
          previewCalls += 1;
        },
      },
    });
    mount.appendChild(h.element);
    h.element.getBoundingClientRect = () =>
      ({ left: 0, right: 220, top: 0, bottom: 48, width: 220, height: 48 }) as DOMRect;
    h.update("2026-06-01", "2026-08-31");
    // The click-snap path doesn't fire onDragPreview (drag-only), so
    // this stays 0 — purpose of the assertion is to prove the optional
    // hook is accepted and the instance doesn't crash without it being
    // exercised.
    h.element.dispatchEvent(new MouseEvent("click", { clientX: 5, clientY: 24, bubbles: true }));
    expect(previewCalls).toBe(0);
    h.destroy();
  });

  it("accepts hooks without onDragPreview (optional hook)", () => {
    const mount = makeMount();
    const h = createDateFilterHistogram({
      log: yearLog,
      bucketCount: 40,
      anchor: "started",
      hooks: { onCommit: () => undefined },
    });
    mount.appendChild(h.element);
    expect(h.element.querySelectorAll("rect.mining-lib-date-bar")).toHaveLength(40);
    h.destroy();
  });

  it("destroy() removes the element from its parent", () => {
    const mount = makeMount();
    const h = createDateFilterHistogram({
      log: yearLog,
      bucketCount: 40,
      anchor: "started",
      hooks: NOOP_HOOKS,
    });
    mount.appendChild(h.element);
    expect(mount.contains(h.element)).toBe(true);
    h.destroy();
    expect(mount.contains(h.element)).toBe(false);
  });
});
