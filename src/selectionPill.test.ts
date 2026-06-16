import { afterEach, describe, expect, it } from "vitest";
import type { CaseAttributesBlockSection } from "./caseAttributesBlock.js";
import type { SelectionTarget } from "./diagramTypes.js";
import type { ResourceBreakdownRow } from "./getResourceBreakdown.js";
import {
  createSelectionPill,
  type SelectionPillBBox,
  type SelectionPillHostSize,
  type SelectionPillTransform,
} from "./selectionPill.js";
import type { AttributeValue } from "./types.js";

function makeHost(): HTMLDivElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return host;
}

afterEach(() => {
  document.body.replaceChildren();
});

type StaticHooks = {
  bbox: SelectionPillBBox | null;
  transform: SelectionPillTransform;
  hostSize: SelectionPillHostSize;
  onFilterTargets: SelectionTarget[];
  onClearCount: number;
  hasResources: boolean;
  breakdown: ResourceBreakdownRow[];
  activeResources: string[];
  toggleCalls: Array<{ activity: string; resource: string }>;
  caseAttributeBreakdown: CaseAttributesBlockSection[];
  activeCaseAttributeValues: Record<string, AttributeValue[]>;
  attributeToggleCalls: Array<{ attribute: string; value: AttributeValue }>;
};

function makeStaticHooks(initial: Partial<StaticHooks> = {}): StaticHooks {
  return {
    bbox: { x: 100, y: 200, width: 80, height: 40 },
    transform: { x: 0, y: 0, k: 1 },
    hostSize: { width: 1200, height: 720 },
    onFilterTargets: [],
    onClearCount: 0,
    hasResources: false,
    breakdown: [],
    activeResources: [],
    toggleCalls: [],
    caseAttributeBreakdown: [],
    activeCaseAttributeValues: {},
    attributeToggleCalls: [],
    ...initial,
  };
}

function bindHooks(state: StaticHooks) {
  return {
    getBBox: () => state.bbox,
    getTransform: () => state.transform,
    getHostSize: () => state.hostSize,
    onFilter: (t: SelectionTarget) => state.onFilterTargets.push(t),
    onClear: () => {
      state.onClearCount += 1;
    },
    getResourceBreakdown: () => state.breakdown,
    logHasResources: () => state.hasResources,
    getActiveResourcesAt: () => state.activeResources,
    onToggleResource: (activity: string, resource: string) => {
      state.toggleCalls.push({ activity, resource });
    },
    getCaseAttributeBreakdown: () => state.caseAttributeBreakdown,
    getActiveCaseAttributeValuesAt: (attribute: string) =>
      state.activeCaseAttributeValues[attribute] ?? [],
    onToggleCaseAttribute: (attribute: string, value: AttributeValue) => {
      state.attributeToggleCalls.push({ attribute, value });
    },
  };
}

const NODE_TARGET: SelectionTarget = { kind: "node", id: "submitted" };
const EDGE_TARGET: SelectionTarget = { kind: "edge", id: "submitted→approved" };

describe("createSelectionPill — mount + dismiss", () => {
  it("show appends an element to the host; hide removes it", () => {
    const host = makeHost();
    const state = makeStaticHooks();
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });

    expect(host.querySelector(".mining-lib-pill-selection")).toBeNull();
    pill.show(NODE_TARGET);
    expect(host.querySelector(".mining-lib-pill-selection")).not.toBeNull();
    pill.hide();
    expect(host.querySelector(".mining-lib-pill-selection")).toBeNull();
  });

  it("show is idempotent — re-showing the same target does not duplicate the element", () => {
    const host = makeHost();
    const state = makeStaticHooks();
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    pill.show(NODE_TARGET);
    expect(host.querySelectorAll(".mining-lib-pill-selection")).toHaveLength(1);
  });

  it("destroy unmounts the pill", () => {
    const host = makeHost();
    const state = makeStaticHooks();
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    pill.destroy();
    expect(host.querySelector(".mining-lib-pill-selection")).toBeNull();
  });
});

describe("createSelectionPill — content + actions", () => {
  it("node target reads `Filter to cases through this`", () => {
    const host = makeHost();
    const state = makeStaticHooks();
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    const filterBtn = host.querySelector(".mining-lib-pill-filter");
    expect(filterBtn?.textContent).toBe("Filter to cases through this");
  });

  it("edge target reads `Filter to cases through this branch`", () => {
    const host = makeHost();
    const state = makeStaticHooks();
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(EDGE_TARGET);
    const filterBtn = host.querySelector(".mining-lib-pill-filter");
    expect(filterBtn?.textContent).toBe("Filter to cases through this branch");
  });

  it("clicking the Filter button calls onFilter with the current target", () => {
    const host = makeHost();
    const state = makeStaticHooks();
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(EDGE_TARGET);
    host.querySelector<HTMLButtonElement>(".mining-lib-pill-filter")?.click();
    expect(state.onFilterTargets).toEqual([EDGE_TARGET]);
  });

  it("clicking the × button calls onClear", () => {
    const host = makeHost();
    const state = makeStaticHooks();
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    host.querySelector<HTMLButtonElement>(".mining-lib-pill-close")?.click();
    expect(state.onClearCount).toBe(1);
  });
});

describe("createSelectionPill — anchor math", () => {
  it("anchors above when there's > 56 px headroom", () => {
    const host = makeHost();
    const state = makeStaticHooks({
      bbox: { x: 100, y: 200, width: 80, height: 40 },
      transform: { x: 0, y: 0, k: 1 },
    });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    const el = host.querySelector<HTMLDivElement>(".mining-lib-pill-selection");
    expect(el?.dataset.anchor).toBe("above");
  });

  it("flips below when projected top < 56 px", () => {
    const host = makeHost();
    const state = makeStaticHooks({
      bbox: { x: 100, y: 5, width: 80, height: 40 }, // y=5 → projTop=5 < 56
      transform: { x: 0, y: 0, k: 1 },
    });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    const el = host.querySelector<HTMLDivElement>(".mining-lib-pill-selection");
    expect(el?.dataset.anchor).toBe("below");
  });

  it("transform.y shifts the projection — pan-down moves the bbox up the host", () => {
    const host = makeHost();
    const state = makeStaticHooks({
      bbox: { x: 100, y: 200, width: 80, height: 40 },
      transform: { x: 0, y: -180, k: 1 }, // bbox at projTop = 200 - 180 = 20 < 56
    });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    const el = host.querySelector<HTMLDivElement>(".mining-lib-pill-selection");
    expect(el?.dataset.anchor).toBe("below");
  });

  it("update recomputes anchor on transform change", () => {
    const host = makeHost();
    const state = makeStaticHooks({
      bbox: { x: 100, y: 200, width: 80, height: 40 },
      transform: { x: 0, y: 0, k: 1 },
    });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    const el = host.querySelector<HTMLDivElement>(".mining-lib-pill-selection");
    expect(el?.dataset.anchor).toBe("above");
    state.transform = { x: 0, y: -180, k: 1 };
    pill.update();
    expect(el?.dataset.anchor).toBe("below");
  });
});

describe("createSelectionPill — clamping + visibility", () => {
  it("clamps left into [12, host.width - pillWidth - 12]", () => {
    const host = makeHost();
    const state = makeStaticHooks({
      // Bbox sits beyond the right edge.
      bbox: { x: 1500, y: 200, width: 80, height: 40 },
      transform: { x: 0, y: 0, k: 1 },
      hostSize: { width: 1200, height: 720 },
    });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    const el = host.querySelector<HTMLDivElement>(".mining-lib-pill-selection") as HTMLDivElement;
    const leftPx = Number.parseFloat(el.style.left);
    expect(leftPx).toBeGreaterThanOrEqual(12);
    expect(leftPx).toBeLessThanOrEqual(1200 - 12);
  });

  it("max-width is host - 24 px (12 px margin per side)", () => {
    const host = makeHost();
    const state = makeStaticHooks({ hostSize: { width: 320, height: 568 } });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    const el = host.querySelector<HTMLDivElement>(".mining-lib-pill-selection") as HTMLDivElement;
    expect(el.style.maxWidth).toBe(`${320 - 24}px`);
  });

  it("hides via visibility when the bbox is fully outside the host viewport", () => {
    const host = makeHost();
    const state = makeStaticHooks({
      // Bbox far below the host's visible 720 px height.
      bbox: { x: 100, y: 5000, width: 80, height: 40 },
      transform: { x: 0, y: 0, k: 1 },
    });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    const el = host.querySelector<HTMLDivElement>(".mining-lib-pill-selection") as HTMLDivElement;
    expect(el.style.visibility).toBe("hidden");
  });

  it("getBBox returning null hides the pill (no anchor data set)", () => {
    const host = makeHost();
    const state = makeStaticHooks({ bbox: null });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    const el = host.querySelector<HTMLDivElement>(".mining-lib-pill-selection") as HTMLDivElement;
    expect(el.style.visibility).toBe("hidden");
  });
});

describe("createSelectionPill — Resources block (Phase 21)", () => {
  it("mounts a Resources block on a node target when log has resources", () => {
    const host = makeHost();
    const state = makeStaticHooks({
      hasResources: true,
      breakdown: [
        { resource: "alice", count: 4, percentage: 80 },
        { resource: "bob", count: 1, percentage: 20 },
      ],
    });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    const block = host.querySelector(".mining-lib-resource-block");
    expect(block).not.toBeNull();
    expect(block?.querySelectorAll(".mining-lib-resource-row")).toHaveLength(2);
  });

  it("omits the Resources block on an edge target even when log has resources", () => {
    const host = makeHost();
    const state = makeStaticHooks({
      hasResources: true,
      breakdown: [{ resource: "alice", count: 1, percentage: 100 }],
    });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(EDGE_TARGET);
    expect(host.querySelector(".mining-lib-resource-block")).toBeNull();
    expect(host.querySelector(".mining-lib-pill-separator")).toBeNull();
  });

  it("omits the Resources block on a node target when log has no resources", () => {
    const host = makeHost();
    const state = makeStaticHooks({ hasResources: false });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    expect(host.querySelector(".mining-lib-resource-block")).toBeNull();
    expect(host.querySelector(".mining-lib-pill-separator")).toBeNull();
  });

  it("renders a separator between the action row and the block", () => {
    const host = makeHost();
    const state = makeStaticHooks({
      hasResources: true,
      breakdown: [{ resource: "alice", count: 1, percentage: 100 }],
    });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    expect(host.querySelector(".mining-lib-pill-separator")).not.toBeNull();
  });

  it("calls getResourceBreakdown with the node target's id (activity)", () => {
    const host = makeHost();
    const calls: string[] = [];
    const state = makeStaticHooks({ hasResources: true, breakdown: [] });
    const baseHooks = bindHooks(state);
    const pill = createSelectionPill({
      root: host,
      hooks: {
        ...baseHooks,
        getResourceBreakdown: (activity: string) => {
          calls.push(activity);
          return state.breakdown;
        },
      },
    });
    pill.show({ kind: "node", id: "intake_validation" });
    expect(calls).toEqual(["intake_validation"]);
  });

  it("re-showing a different target rebuilds the block from the new activity", () => {
    const host = makeHost();
    const state = makeStaticHooks({
      hasResources: true,
      breakdown: [{ resource: "alice", count: 3, percentage: 100 }],
    });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show({ kind: "node", id: "first" });
    // Swap the breakdown the next call returns.
    state.breakdown = [
      { resource: "bob", count: 5, percentage: 50 },
      { resource: "carol", count: 5, percentage: 50 },
    ];
    pill.show({ kind: "node", id: "second" });
    const rows = host.querySelectorAll(".mining-lib-resource-row");
    expect(rows).toHaveLength(2);
  });

  it("switching from node to edge removes the block + separator", () => {
    const host = makeHost();
    const state = makeStaticHooks({
      hasResources: true,
      breakdown: [{ resource: "alice", count: 1, percentage: 100 }],
    });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    expect(host.querySelector(".mining-lib-resource-block")).not.toBeNull();
    pill.show(EDGE_TARGET);
    expect(host.querySelector(".mining-lib-resource-block")).toBeNull();
    expect(host.querySelector(".mining-lib-pill-separator")).toBeNull();
  });
});

describe("createSelectionPill — Resource toggle (2026-05-12 rework)", () => {
  it("renders breakdown rows as buttons (toggleable)", () => {
    const host = makeHost();
    const state = makeStaticHooks({
      hasResources: true,
      breakdown: [
        { resource: "alice", count: 4, percentage: 80 },
        { resource: "bob", count: 1, percentage: 20 },
      ],
    });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show({ kind: "node", id: "intake" });
    const buttons = host.querySelectorAll(".mining-lib-resource-row-btn");
    expect(buttons).toHaveLength(2);
  });

  it("clicking a row dispatches onToggleResource with (activity, resource)", () => {
    const host = makeHost();
    const state = makeStaticHooks({
      hasResources: true,
      breakdown: [
        { resource: "alice", count: 4, percentage: 80 },
        { resource: null, count: 1, percentage: 20 },
      ],
    });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show({ kind: "node", id: "intake" });
    const buttons = host.querySelectorAll<HTMLButtonElement>(".mining-lib-resource-row-btn");
    buttons[0]?.click();
    buttons[1]?.click();
    expect(state.toggleCalls).toEqual([
      { activity: "intake", resource: "alice" },
      { activity: "intake", resource: "(unassigned)" },
    ]);
  });

  it("active resources from the hook render with the -active class on rows + bar segments", () => {
    const host = makeHost();
    const state = makeStaticHooks({
      hasResources: true,
      breakdown: [
        { resource: "alice", count: 4, percentage: 80 },
        { resource: "bob", count: 1, percentage: 20 },
      ],
      activeResources: ["bob"],
    });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show({ kind: "node", id: "intake" });
    const rows = host.querySelectorAll<HTMLLIElement>(".mining-lib-resource-row");
    expect(rows[0]?.classList.contains("mining-lib-resource-row-active")).toBe(false);
    expect(rows[1]?.classList.contains("mining-lib-resource-row-active")).toBe(true);
  });
});

describe("createSelectionPill — close-button placement (Phase 22)", () => {
  it("× is a direct child of the pill element, not nested in the action row", () => {
    const host = makeHost();
    const state = makeStaticHooks();
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    const pillEl = host.querySelector<HTMLElement>(".mining-lib-pill-selection");
    const closeBtn = host.querySelector<HTMLElement>(".mining-lib-pill-close");
    expect(pillEl).not.toBeNull();
    expect(closeBtn).not.toBeNull();
    expect(closeBtn?.parentElement).toBe(pillEl);
  });

  it("action row contains exactly one child — the filter button", () => {
    const host = makeHost();
    const state = makeStaticHooks();
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    const actionRow = host.querySelector(".mining-lib-pill-action-row");
    expect(actionRow?.children).toHaveLength(1);
    expect(actionRow?.firstElementChild?.classList.contains("mining-lib-pill-filter")).toBe(true);
  });

  it("× keeps className + aria-label after the move", () => {
    const host = makeHost();
    const state = makeStaticHooks();
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(EDGE_TARGET);
    const closeBtn = host.querySelector<HTMLElement>(".mining-lib-pill-close");
    expect(closeBtn?.classList.contains("mining-lib-pill-close")).toBe(true);
    expect(closeBtn?.getAttribute("aria-label")).toBe("Clear selection");
  });

  it("on a node with Resources: action-row, separator, block, and × are all direct children of the pill", () => {
    const host = makeHost();
    const state = makeStaticHooks({
      hasResources: true,
      breakdown: [{ resource: "alice", count: 1, percentage: 100 }],
    });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    const pillEl = host.querySelector<HTMLElement>(".mining-lib-pill-selection");
    if (pillEl === null) throw new Error("pill not mounted");
    const directKids = Array.from(pillEl.children);
    expect(directKids.some((k) => k.classList.contains("mining-lib-pill-action-row"))).toBe(true);
    expect(directKids.some((k) => k.classList.contains("mining-lib-pill-separator"))).toBe(true);
    expect(directKids.some((k) => k.classList.contains("mining-lib-resource-block"))).toBe(true);
    expect(directKids.some((k) => k.classList.contains("mining-lib-pill-close"))).toBe(true);
  });
});

describe("createSelectionPill — Attributes block (Phase 25 §6)", () => {
  it("does NOT mount the attributes block when getCaseAttributeBreakdown returns []", () => {
    const host = makeHost();
    const state = makeStaticHooks({ caseAttributeBreakdown: [] });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    expect(host.querySelector(".mining-lib-pill-attrs")).toBeNull();
  });

  it("mounts the attributes block when the breakdown is non-empty", () => {
    const host = makeHost();
    const state = makeStaticHooks({
      caseAttributeBreakdown: [
        {
          attribute: "case:priority",
          humanLabel: "Priority",
          distribution: [{ value: "high", displayLabel: "high", count: 1 }],
        },
      ],
    });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    expect(host.querySelector(".mining-lib-pill-attrs")).not.toBeNull();
    expect(host.querySelector(".mining-lib-pill-attr-section")).not.toBeNull();
    expect(host.querySelector(".mining-lib-pill-attr-value")?.textContent).toBe("high");
  });

  it("only mounts the attributes block for node targets, not edge targets", () => {
    const host = makeHost();
    const state = makeStaticHooks({
      caseAttributeBreakdown: [
        {
          attribute: "case:priority",
          humanLabel: "Priority",
          distribution: [{ value: "high", displayLabel: "high", count: 1 }],
        },
      ],
    });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(EDGE_TARGET);
    expect(host.querySelector(".mining-lib-pill-attrs")).toBeNull();
  });

  it("clicking an attribute row emits onToggleCaseAttribute(attribute, value)", () => {
    const host = makeHost();
    const state = makeStaticHooks({
      caseAttributeBreakdown: [
        {
          attribute: "case:priority",
          humanLabel: "Priority",
          distribution: [{ value: "high", displayLabel: "high", count: 1 }],
        },
      ],
    });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    host.querySelector<HTMLButtonElement>(".mining-lib-pill-attr-row")?.click();
    expect(state.attributeToggleCalls).toEqual([{ attribute: "case:priority", value: "high" }]);
  });

  it("active rows reflect getActiveCaseAttributeValuesAt(attribute)", () => {
    const host = makeHost();
    const state = makeStaticHooks({
      caseAttributeBreakdown: [
        {
          attribute: "case:priority",
          humanLabel: "Priority",
          distribution: [
            { value: "high", displayLabel: "high", count: 1 },
            { value: "normal", displayLabel: "normal", count: 4 },
          ],
        },
      ],
      activeCaseAttributeValues: { "case:priority": ["high"] },
    });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    const rows = host.querySelectorAll<HTMLButtonElement>(".mining-lib-pill-attr-row");
    expect(rows[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(rows[1]?.getAttribute("aria-pressed")).toBe("false");
  });

  it("attributes block lands after Resources block when both are present", () => {
    const host = makeHost();
    const state = makeStaticHooks({
      hasResources: true,
      breakdown: [{ resource: "alice", count: 1, percentage: 100 }],
      caseAttributeBreakdown: [
        {
          attribute: "case:priority",
          humanLabel: "Priority",
          distribution: [{ value: "high", displayLabel: "high", count: 1 }],
        },
      ],
    });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    const pillEl = host.querySelector<HTMLElement>(".mining-lib-pill-selection");
    if (pillEl === null) throw new Error("pill not mounted");
    const children = Array.from(pillEl.children);
    const resourceIdx = children.findIndex((c) =>
      c.classList.contains("mining-lib-resource-block"),
    );
    const attrsIdx = children.findIndex((c) => c.classList.contains("mining-lib-pill-attrs"));
    expect(resourceIdx).toBeGreaterThanOrEqual(0);
    expect(attrsIdx).toBeGreaterThan(resourceIdx);
  });

  it("update() re-builds the attributes block when external state toggles", () => {
    const host = makeHost();
    const state = makeStaticHooks({
      caseAttributeBreakdown: [
        {
          attribute: "case:priority",
          humanLabel: "Priority",
          distribution: [{ value: "high", displayLabel: "high", count: 1 }],
        },
      ],
      activeCaseAttributeValues: {},
    });
    const pill = createSelectionPill({ root: host, hooks: bindHooks(state) });
    pill.show(NODE_TARGET);
    expect(host.querySelector(".mining-lib-pill-attr-row")?.getAttribute("aria-pressed")).toBe(
      "false",
    );

    state.activeCaseAttributeValues = { "case:priority": ["high"] };
    pill.update();
    expect(host.querySelector(".mining-lib-pill-attr-row")?.getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
});
