import { afterEach, describe, expect, it } from "vitest";
import type { FilterClause } from "./filterClauses.js";
import { createFiltersPanel } from "./filtersPanel.js";
import type { EventLog } from "./types.js";

function makeHost(): HTMLDivElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return host;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("createFiltersPanel — scaffold (Phase 22 slim)", () => {
  it("mounts a <div> with class `mining-lib-filters-panel`, part=`filters-panel`, no inner heading", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    const div = host.querySelector<HTMLDivElement>("div.mining-lib-filters-panel");
    expect(div).not.toBeNull();
    expect(div).toBe(panel.element);
    expect(div?.getAttribute("part")).toBe("filters-panel");
    // The popover trigger already says "Filters"; repeating it
    // inside the popover (the old `<summary>Filters</summary>`)
    // was visual noise and got removed.
    expect(div?.querySelector("summary")).toBeNull();
  });

  it("renders an Active row inside the panel, hidden until non-variant clauses arrive", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    const active = panel.element.querySelector<HTMLElement>(".mining-lib-filters-active");
    expect(active).not.toBeNull();
    expect(active?.hidden).toBe(true);
  });

  it("Active row contains a chips container + a Clear all button as siblings", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    const active = panel.element.querySelector<HTMLElement>(".mining-lib-filters-active");
    expect(active?.querySelector(".mining-lib-filters-chips")).not.toBeNull();
    const clearBtn = active?.querySelector<HTMLButtonElement>("button.mining-lib-clear-all");
    expect(clearBtn).not.toBeNull();
    expect(clearBtn?.textContent).toBe("Clear all");
  });

  it("does NOT render a panel-level `Filters` h3 header (Phase 22 dropped it — summary names the surface)", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    expect(panel.element.querySelector("h3")).toBeNull();
  });

  it("does NOT render an `Active filters` h4 sub-heading (Phase 22 dropped — chip row IS the surface)", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    const headings = panel.element.querySelectorAll("h4");
    for (const h of Array.from(headings)) {
      expect(h.textContent).not.toBe("Active filters");
    }
  });

  it("does NOT render a Variants section (moved to variantsPanel.ts)", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    expect(panel.element.querySelectorAll("details").length).toBe(0);
    expect(panel.element.querySelector(".mining-lib-filters-variants")).toBeNull();
    expect(panel.element.querySelector(".mining-lib-filters-variants-host")).toBeNull();
  });

  it("setHost re-parents the panel without destroying internal nodes", () => {
    const a = makeHost();
    const b = makeHost();
    const panel = createFiltersPanel(a);
    const beforeRef = panel.element;
    panel.setHost(b);
    expect(b.contains(beforeRef)).toBe(true);
    expect(a.contains(beforeRef)).toBe(false);
    expect(panel.element).toBe(beforeRef);
  });

  it("setHooks replaces the action callbacks; clear-all fires the new hook", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    let clearCalled = 0;
    panel.setHooks({
      removeClause: () => undefined,
      clearNonVariant: () => {
        clearCalled += 1;
      },
    });
    panel.element.querySelector<HTMLButtonElement>("button.mining-lib-clear-all")?.click();
    expect(clearCalled).toBe(1);
  });

  it("destroy removes the element from the DOM", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    panel.destroy();
    expect(host.querySelector(".mining-lib-filters-panel")).toBeNull();
  });
});

describe("filtersPanel.update — chips + Clear all", () => {
  it("renders a `Through (from) → (to)` chip for a branch clause", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    panel.update([{ kind: "branch", edge: ["submitted", "approved"] }]);
    const chips = panel.element.querySelectorAll<HTMLButtonElement>(
      "button.mining-lib-filters-chip",
    );
    expect(chips).toHaveLength(1);
    expect(chips[0]?.querySelector(".mining-lib-filters-chip-label")?.textContent).toBe(
      "Through submitted → approved",
    );
    expect(chips[0]?.dataset.from).toBe("submitted");
    expect(chips[0]?.dataset.to).toBe("approved");
  });

  it("renders an `At (activity)` chip for a node clause", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    panel.update([{ kind: "node", activity: "review_in_progress" }]);
    const label = panel.element.querySelector(".mining-lib-filters-chip-label");
    expect(label?.textContent).toBe("At review_in_progress");
  });

  it("does NOT render a chip for variant clauses (those live in the Variants panel)", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    panel.update([
      { kind: "variant", sequences: ["X"] },
      { kind: "branch", edge: ["a", "b"] },
    ]);
    const chips = panel.element.querySelectorAll<HTMLButtonElement>(
      "button.mining-lib-filters-chip",
    );
    expect(chips).toHaveLength(1);
    expect(chips[0]?.dataset.kind).toBe("branch");
  });

  it("shows the Active row iff at least one non-variant clause is present", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    const active = panel.element.querySelector(".mining-lib-filters-active") as HTMLElement;

    expect(active.hidden).toBe(true);
    panel.update([{ kind: "branch", edge: ["a", "b"] }]);
    expect(active.hidden).toBe(false);
    panel.update([]);
    expect(active.hidden).toBe(true);
    panel.update([{ kind: "variant", sequences: ["X"] }]);
    expect(active.hidden).toBe(true); // variant alone doesn't open the row
  });

  it("clicking a chip's × dispatches removeClause with the matching clause", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    const removed: FilterClause[] = [];
    panel.setHooks({
      removeClause: (c) => removed.push(c),
      clearNonVariant: () => undefined,
    });
    panel.update([
      { kind: "branch", edge: ["a", "b"] },
      { kind: "node", activity: "x" },
    ]);
    const chips = panel.element.querySelectorAll<HTMLButtonElement>(
      "button.mining-lib-filters-chip",
    );
    chips[0]?.querySelector<HTMLSpanElement>(".mining-lib-filters-chip-x")?.click();
    expect(removed).toHaveLength(1);
    expect(removed[0]).toEqual({ kind: "branch", edge: ["a", "b"] });
  });

  it("clicking the chip body (not the ×) is a no-op", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    let removeCalls = 0;
    panel.setHooks({
      removeClause: () => {
        removeCalls += 1;
      },
      clearNonVariant: () => undefined,
    });
    panel.update([{ kind: "branch", edge: ["a", "b"] }]);
    const chip = panel.element.querySelector<HTMLButtonElement>("button.mining-lib-filters-chip");
    const labelEl = chip?.querySelector<HTMLSpanElement>(".mining-lib-filters-chip-label");
    labelEl?.click();
    expect(removeCalls).toBe(0);
  });

  it("Clear all link is visible iff ≥ 1 non-variant chip; click invokes clearNonVariant", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    let cleared = 0;
    panel.setHooks({
      removeClause: () => undefined,
      clearNonVariant: () => {
        cleared += 1;
      },
    });
    const clearBtn = panel.element.querySelector<HTMLButtonElement>(
      "button.mining-lib-clear-all",
    ) as HTMLButtonElement;
    const active = panel.element.querySelector(".mining-lib-filters-active") as HTMLElement;

    panel.update([{ kind: "branch", edge: ["a", "b"] }]);
    expect(active.hidden).toBe(false);
    clearBtn.click();
    expect(cleared).toBe(1);

    panel.update([]);
    expect(active.hidden).toBe(true);
  });

  it("update is idempotent — calling twice with the same input gives the same DOM", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    panel.update([
      { kind: "branch", edge: ["a", "b"] },
      { kind: "node", activity: "x" },
    ]);
    const firstCount = panel.element.querySelectorAll(".mining-lib-filters-chip").length;
    panel.update([
      { kind: "branch", edge: ["a", "b"] },
      { kind: "node", activity: "x" },
    ]);
    const secondCount = panel.element.querySelectorAll(".mining-lib-filters-chip").length;
    expect(firstCount).toBe(2);
    expect(secondCount).toBe(2);
  });
});

describe("filtersPanel — resourceAt chips (Phase 21 rework 2026-05-12)", () => {
  it("renders a chip for a resourceAt clause with one resource", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    panel.update([{ kind: "resourceAt", activity: "intake_validation", resources: ["clerk_002"] }]);
    const chip = panel.element.querySelector(".mining-lib-filters-chip[data-kind='resourceAt']");
    expect(chip).not.toBeNull();
    expect(chip?.querySelector(".mining-lib-filters-chip-label")?.textContent).toBe(
      "clerk_002 at intake_validation",
    );
  });

  it("renders the chip with `+ N` tail when a resourceAt clause has multiple resources", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    panel.update([
      {
        kind: "resourceAt",
        activity: "intake_validation",
        resources: ["clerk_002", "clerk_003", "(unassigned)"],
      },
    ]);
    expect(
      panel.element
        .querySelector(".mining-lib-filters-chip[data-kind='resourceAt']")
        ?.querySelector(".mining-lib-filters-chip-label")?.textContent,
    ).toBe("clerk_002 + 2 at intake_validation");
  });

  it("renders one chip per resourceAt clause when multiple activities are active", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    panel.update([
      { kind: "resourceAt", activity: "intake_validation", resources: ["clerk_002"] },
      { kind: "resourceAt", activity: "review_in_progress", resources: ["reviewer_004"] },
    ]);
    const chips = panel.element.querySelectorAll(
      ".mining-lib-filters-chip[data-kind='resourceAt']",
    );
    expect(chips).toHaveLength(2);
  });

  it("clicking a resourceAt chip's × dispatches removeClause with the matching clause", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    const removed: FilterClause[] = [];
    panel.setHooks({
      removeClause: (c) => removed.push(c),
      clearNonVariant: () => undefined,
    });
    const clause: FilterClause = {
      kind: "resourceAt",
      activity: "intake_validation",
      resources: ["clerk_002"],
    };
    panel.update([clause]);
    panel.element
      .querySelector<HTMLSpanElement>(
        ".mining-lib-filters-chip[data-kind='resourceAt'] .mining-lib-filters-chip-x",
      )
      ?.click();
    expect(removed).toEqual([clause]);
  });
});

describe("filtersPanel — attribute chips (Phase 25)", () => {
  it("renders a single-value attribute chip with 'Label: value' format", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    panel.update([{ kind: "attribute", attribute: "case:priority", values: ["high"] }]);
    const chip = panel.element.querySelector(".mining-lib-filters-chip[data-kind='attribute']");
    expect(chip).not.toBeNull();
    expect(chip?.querySelector(".mining-lib-filters-chip-label")?.textContent).toBe(
      "Priority: high",
    );
    expect((chip as HTMLElement).dataset.attribute).toBe("case:priority");
  });

  it("renders a two-value attribute chip lex-sorted", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    panel.update([{ kind: "attribute", attribute: "case:priority", values: ["low", "high"] }]);
    expect(
      panel.element
        .querySelector(".mining-lib-filters-chip[data-kind='attribute']")
        ?.querySelector(".mining-lib-filters-chip-label")?.textContent,
    ).toBe("Priority: high, low");
  });

  it("truncates 3+ value chip to 'Label: first +N'", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    panel.update([
      {
        kind: "attribute",
        attribute: "case:applicant_type",
        values: ["renewal", "new_business", "existing_business"],
      },
    ]);
    expect(
      panel.element
        .querySelector(".mining-lib-filters-chip[data-kind='attribute']")
        ?.querySelector(".mining-lib-filters-chip-label")?.textContent,
    ).toBe("Applicant type: existing_business +2");
  });

  it("renders one chip per attribute clause when multiple attributes are active", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    panel.update([
      { kind: "attribute", attribute: "case:priority", values: ["high"] },
      { kind: "attribute", attribute: "case:applicant_type", values: ["renewal"] },
    ]);
    const chips = panel.element.querySelectorAll(".mining-lib-filters-chip[data-kind='attribute']");
    expect(chips).toHaveLength(2);
  });

  it("clicking an attribute chip's × dispatches removeClause with the matching clause", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    const removed: FilterClause[] = [];
    panel.setHooks({
      removeClause: (c) => removed.push(c),
      clearNonVariant: () => undefined,
    });
    const clause: FilterClause = {
      kind: "attribute",
      attribute: "case:priority",
      values: ["high"],
    };
    panel.update([clause]);
    panel.element
      .querySelector<HTMLSpanElement>(
        ".mining-lib-filters-chip[data-kind='attribute'] .mining-lib-filters-chip-x",
      )
      ?.click();
    expect(removed).toEqual([clause]);
  });

  it("getActiveClauseCount counts attribute clauses as non-variant", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    panel.update([
      { kind: "variant", sequences: ["sigA"] },
      { kind: "attribute", attribute: "case:priority", values: ["high"] },
      { kind: "attribute", attribute: "case:applicant_type", values: ["renewal"] },
    ]);
    expect(panel.getActiveClauseCount()).toBe(2);
  });
});

describe("filtersPanel — date section + chip (Phase 26)", () => {
  function yearLog(): EventLog {
    const events = [
      {
        caseId: "c1",
        activity: "x",
        timestamp: new Date("2026-01-01T00:00:00"),
        resource: null,
        lifecycle: "complete",
        attributes: {},
      },
      {
        caseId: "c1",
        activity: "y",
        timestamp: new Date("2026-12-31T23:59:00"),
        resource: null,
        lifecycle: "complete",
        attributes: {},
      },
    ];
    return {
      cases: new Map([["c1", { id: "c1", events, attributes: {} }]]),
      events,
      schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
    };
  }

  it("mounts the date section above the case-attributes section", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    panel.setHooks({
      getLog: () => yearLog(),
      getDateClause: () => null,
    });
    panel.update([]);
    const dateSection = host.querySelector("details.mining-lib-date-section");
    const attrSections = host.querySelector(".mining-lib-attr-sections");
    expect(dateSection).not.toBeNull();
    expect(attrSections).not.toBeNull();
    // Date section appears earlier in document order.
    if (dateSection && attrSections) {
      const pos = dateSection.compareDocumentPosition(attrSections);
      expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("renders a chip for a date clause with both bounds set", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    panel.setHooks({ getLog: () => yearLog(), getDateClause: () => null });
    panel.update([{ kind: "date", from: "2026-03-01", to: "2026-03-31", anchor: "started" }]);
    const chips = host.querySelectorAll(".mining-lib-filters-chip");
    expect(chips).toHaveLength(1);
    expect(chips[0]?.querySelector(".mining-lib-filters-chip-label")?.textContent).toBe(
      "Mar 1 – Mar 31, 2026",
    );
  });

  it("renders an `After …` chip for from-only date clause", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    panel.setHooks({ getLog: () => yearLog(), getDateClause: () => null });
    panel.update([{ kind: "date", from: "2026-04-01", to: null, anchor: "started" }]);
    const chip = host.querySelector(".mining-lib-filters-chip-label");
    expect(chip?.textContent).toBe("After Apr 1, 2026");
  });

  it("does NOT render a chip when both bounds are null", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    panel.setHooks({ getLog: () => yearLog(), getDateClause: () => null });
    panel.update([{ kind: "date", from: null, to: null, anchor: "started" }]);
    const chips = host.querySelectorAll(".mining-lib-filters-chip");
    expect(chips).toHaveLength(0);
  });

  it("clicking date chip × invokes removeClause with the matching date clause", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    let removed: FilterClause | undefined;
    panel.setHooks({
      getLog: () => yearLog(),
      getDateClause: () => null,
      removeClause: (c) => {
        removed = c;
      },
    });
    const clause: FilterClause = {
      kind: "date",
      from: "2026-03-01",
      to: "2026-03-31",
      anchor: "ended",
    };
    panel.update([clause]);
    const x = host.querySelector(".mining-lib-filters-chip .mining-lib-filters-chip-x");
    (x?.parentElement as HTMLButtonElement | null)?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    // Simulate clicking exactly the × span to trigger the closest-X check.
    (x as HTMLElement | null)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(removed).toEqual(clause);
  });

  it("getActiveClauseCount counts a chipped date clause", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    panel.setHooks({ getLog: () => yearLog(), getDateClause: () => null });
    panel.update([
      { kind: "date", from: "2026-03-01", to: null, anchor: "started" },
      { kind: "node", activity: "x" },
    ]);
    expect(panel.getActiveClauseCount()).toBe(2);
  });

  it("does NOT count a fully-open date clause in getActiveClauseCount", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    panel.setHooks({ getLog: () => yearLog(), getDateClause: () => null });
    panel.update([
      { kind: "date", from: null, to: null, anchor: "started" },
      { kind: "node", activity: "x" },
    ]);
    expect(panel.getActiveClauseCount()).toBe(1);
  });

  it("auto-hides the date section when the log is empty", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    const emptyLog: EventLog = {
      cases: new Map(),
      events: [],
      schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
    };
    panel.setHooks({ getLog: () => emptyLog, getDateClause: () => null });
    panel.update([]);
    expect(host.querySelector("details.mining-lib-date-section")).toBeNull();
  });
});

describe("filtersPanel.getActiveClauseCount (Phase 22)", () => {
  it("returns 0 before any update", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    expect(panel.getActiveClauseCount()).toBe(0);
  });

  it("returns 0 when only variant clauses are present", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    panel.update([{ kind: "variant", sequences: ["X"] }]);
    expect(panel.getActiveClauseCount()).toBe(0);
  });

  it("returns N for N non-variant clauses (variant clauses excluded)", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    panel.update([
      { kind: "variant", sequences: ["X"] },
      { kind: "branch", edge: ["a", "b"] },
      { kind: "node", activity: "x" },
      { kind: "resourceAt", activity: "y", resources: ["alice"] },
    ]);
    expect(panel.getActiveClauseCount()).toBe(3);
  });

  it("decreases as clauses are cleared from update()", () => {
    const host = makeHost();
    const panel = createFiltersPanel(host);
    panel.update([
      { kind: "branch", edge: ["a", "b"] },
      { kind: "node", activity: "x" },
    ]);
    expect(panel.getActiveClauseCount()).toBe(2);
    panel.update([{ kind: "branch", edge: ["a", "b"] }]);
    expect(panel.getActiveClauseCount()).toBe(1);
    panel.update([]);
    expect(panel.getActiveClauseCount()).toBe(0);
  });
});
