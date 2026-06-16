import { afterEach, describe, expect, it } from "vitest";
import type { ResourceBreakdownRow } from "./getResourceBreakdown.js";
import { createResourceBreakdownBlock } from "./resourceBreakdownBlock.js";

afterEach(() => {
  document.body.replaceChildren();
});

function makeRows(n: number): ResourceBreakdownRow[] {
  const rows: ResourceBreakdownRow[] = [];
  for (let i = 0; i < n; i += 1) {
    rows.push({
      resource: `r_${String(i).padStart(2, "0")}`,
      count: n - i,
      percentage: Math.round((100 * (n - i)) / ((n * (n + 1)) / 2)),
    });
  }
  return rows;
}

describe("createResourceBreakdownBlock — structure", () => {
  it("returns a detached HTMLElement with class mining-lib-resource-block", () => {
    const { element } = createResourceBreakdownBlock([
      { resource: "alice", count: 1, percentage: 100 },
    ]);
    expect(element.classList.contains("mining-lib-resource-block")).toBe(true);
    expect(element.isConnected).toBe(false);
  });

  it("renders a header with text 'Resources'", () => {
    const { element } = createResourceBreakdownBlock([
      { resource: "alice", count: 1, percentage: 100 },
    ]);
    const header = element.querySelector(".mining-lib-resource-header");
    expect(header?.textContent).toBe("Resources");
  });

  it("renders an empty block with no rows / no segments when given []", () => {
    const { element } = createResourceBreakdownBlock([]);
    expect(element.querySelectorAll(".mining-lib-resource-row")).toHaveLength(0);
    const segments = element.querySelectorAll(".mining-lib-resource-bar > *");
    expect(segments).toHaveLength(0);
  });

  it("destroy() removes the element from its parent", () => {
    const { element, destroy } = createResourceBreakdownBlock([
      { resource: "alice", count: 1, percentage: 100 },
    ]);
    document.body.appendChild(element);
    expect(element.isConnected).toBe(true);
    destroy();
    expect(element.isConnected).toBe(false);
  });
});

describe("createResourceBreakdownBlock — top-5 cap + '+N others'", () => {
  it("1 row → one list row, no '+N others'", () => {
    const { element } = createResourceBreakdownBlock([
      { resource: "alice", count: 1, percentage: 100 },
    ]);
    const rows = element.querySelectorAll(".mining-lib-resource-row");
    expect(rows).toHaveLength(1);
    expect(element.querySelector(".mining-lib-resource-others")).toBeNull();
  });

  it("5 rows → five list rows, no '+N others'", () => {
    const { element } = createResourceBreakdownBlock(makeRows(5));
    expect(element.querySelectorAll(".mining-lib-resource-row")).toHaveLength(5);
    expect(element.querySelector(".mining-lib-resource-others")).toBeNull();
  });

  it("6 rows → five list rows + one '+1 others' row", () => {
    const { element } = createResourceBreakdownBlock(makeRows(6));
    const rows = element.querySelectorAll(".mining-lib-resource-row");
    expect(rows).toHaveLength(6);
    const others = element.querySelector(".mining-lib-resource-others");
    expect(others).not.toBeNull();
    expect(others?.textContent?.includes("+1 others")).toBe(true);
  });

  it("12 rows → five list rows + one '+7 others' row", () => {
    const { element } = createResourceBreakdownBlock(makeRows(12));
    const others = element.querySelector(".mining-lib-resource-others");
    expect(others?.textContent?.includes("+7 others")).toBe(true);
  });

  it("'+N others' row aggregates the tail count + percentage", () => {
    const rows: ResourceBreakdownRow[] = [
      { resource: "a", count: 50, percentage: 50 },
      { resource: "b", count: 20, percentage: 20 },
      { resource: "c", count: 10, percentage: 10 },
      { resource: "d", count: 8, percentage: 8 },
      { resource: "e", count: 5, percentage: 5 },
      { resource: "f", count: 4, percentage: 4 },
      { resource: "g", count: 3, percentage: 3 },
    ];
    const { element } = createResourceBreakdownBlock(rows);
    const others = element.querySelector(".mining-lib-resource-others");
    // tail count = 4+3 = 7; tail percentage = 4+3 = 7
    expect(others?.textContent).toContain("7");
  });
});

describe("createResourceBreakdownBlock — stacked bar segments", () => {
  it("renders one segment per visible row (top-5 + others when present)", () => {
    const { element: a } = createResourceBreakdownBlock(makeRows(3));
    expect(a.querySelectorAll(".mining-lib-resource-bar > *")).toHaveLength(3);
    const { element: b } = createResourceBreakdownBlock(makeRows(5));
    expect(b.querySelectorAll(".mining-lib-resource-bar > *")).toHaveLength(5);
    const { element: c } = createResourceBreakdownBlock(makeRows(8));
    expect(c.querySelectorAll(".mining-lib-resource-bar > *")).toHaveLength(6);
  });

  it("segment index drives the segment class (0..4 + 'others')", () => {
    const { element } = createResourceBreakdownBlock(makeRows(8));
    const segments = element.querySelectorAll(".mining-lib-resource-bar > *");
    expect(segments[0]?.classList.contains("mining-lib-resource-bar-segment-0")).toBe(true);
    expect(segments[4]?.classList.contains("mining-lib-resource-bar-segment-4")).toBe(true);
    expect(segments[5]?.classList.contains("mining-lib-resource-bar-segment-others")).toBe(true);
  });
});

describe("createResourceBreakdownBlock — (unassigned) label + segment class", () => {
  it("`resource: null` renders as '(unassigned)' in the row label", () => {
    const { element } = createResourceBreakdownBlock([
      { resource: null, count: 3, percentage: 100 },
    ]);
    const label = element.querySelector(".mining-lib-resource-row .resource-label");
    expect(label?.textContent).toBe("(unassigned)");
  });

  it("`(unassigned)` segment gets the -unassigned modifier class", () => {
    const { element } = createResourceBreakdownBlock([
      { resource: "alice", count: 5, percentage: 50 },
      { resource: null, count: 5, percentage: 50 },
    ]);
    const segments = element.querySelectorAll(".mining-lib-resource-bar > *");
    expect(segments[1]?.classList.contains("mining-lib-resource-bar-segment-unassigned")).toBe(
      true,
    );
  });
});

describe("createResourceBreakdownBlock — toggle hook (2026-05-12 rework)", () => {
  it("rows render as buttons when onToggle is provided", () => {
    const { element } = createResourceBreakdownBlock(
      [{ resource: "alice", count: 1, percentage: 100 }],
      { onToggle: () => undefined },
    );
    const btn = element.querySelector(".mining-lib-resource-row .mining-lib-resource-row-btn");
    expect(btn).not.toBeNull();
    expect(btn?.tagName.toLowerCase()).toBe("button");
  });

  it("rows render as static divs (no buttons) when onToggle is absent", () => {
    const { element } = createResourceBreakdownBlock([
      { resource: "alice", count: 1, percentage: 100 },
    ]);
    expect(element.querySelector(".mining-lib-resource-row-btn")).toBeNull();
  });

  it("clicking a row invokes onToggle with the resource label (sentinel for null)", () => {
    const calls: string[] = [];
    const { element } = createResourceBreakdownBlock(
      [
        { resource: "alice", count: 5, percentage: 50 },
        { resource: null, count: 5, percentage: 50 },
      ],
      { onToggle: (r) => calls.push(r) },
    );
    const buttons = element.querySelectorAll<HTMLButtonElement>(".mining-lib-resource-row-btn");
    buttons[0]?.click();
    buttons[1]?.click();
    expect(calls).toEqual(["alice", "(unassigned)"]);
  });

  it("active resources render with the -active row + bar-segment classes", () => {
    const { element } = createResourceBreakdownBlock(
      [
        { resource: "alice", count: 6, percentage: 60 },
        { resource: "bob", count: 4, percentage: 40 },
      ],
      { activeResources: ["bob"], onToggle: () => undefined },
    );
    const rows = element.querySelectorAll<HTMLLIElement>(".mining-lib-resource-row");
    expect(rows[0]?.classList.contains("mining-lib-resource-row-active")).toBe(false);
    expect(rows[1]?.classList.contains("mining-lib-resource-row-active")).toBe(true);
    const segments = element.querySelectorAll(".mining-lib-resource-bar > *");
    expect(segments[0]?.classList.contains("mining-lib-resource-bar-segment-active")).toBe(false);
    expect(segments[1]?.classList.contains("mining-lib-resource-bar-segment-active")).toBe(true);
  });

  it("active button reports aria-pressed=true", () => {
    const { element } = createResourceBreakdownBlock(
      [{ resource: "alice", count: 1, percentage: 100 }],
      { activeResources: ["alice"], onToggle: () => undefined },
    );
    const btn = element.querySelector(".mining-lib-resource-row-btn");
    expect(btn?.getAttribute("aria-pressed")).toBe("true");
  });

  it("`+N others` row stays non-interactive even when onToggle is provided", () => {
    const calls: string[] = [];
    const { element } = createResourceBreakdownBlock(
      Array.from({ length: 7 }, (_, i) => ({
        resource: `r${i}`,
        count: 7 - i,
        percentage: Math.round((100 * (7 - i)) / 28),
      })),
      { onToggle: (r) => calls.push(r) },
    );
    const others = element.querySelector(".mining-lib-resource-others");
    expect(others?.querySelector(".mining-lib-resource-row-btn")).toBeNull();
  });
});
