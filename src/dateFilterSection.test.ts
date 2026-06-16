import { beforeEach, describe, expect, it } from "vitest";
import {
  createDateFilterSection,
  type DateClauseState,
  type DateFilterSectionHooks,
} from "./dateFilterSection.js";
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

const yearLog = mkLog([
  mkCase("c1", ["2026-01-01T00:00:00", "2026-12-31T23:59:00"]),
  mkCase("c2", ["2026-06-15T12:00:00"]),
]);

const EMPTY_LOG: EventLog = {
  cases: new Map(),
  events: [],
  schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
};

function makeHooks(overrides: Partial<DateFilterSectionHooks> = {}): {
  hooks: DateFilterSectionHooks;
  commits: DateClauseState[];
  clears: number;
} {
  const commits: DateClauseState[] = [];
  let clearCount = 0;
  const result = { commits, clears: 0 };
  const hooks: DateFilterSectionHooks = {
    getLog: () => yearLog,
    getDateClause: () => null,
    onCommit: (state) => {
      commits.push(state);
    },
    onClear: () => {
      clearCount += 1;
      result.clears = clearCount;
    },
    ...overrides,
  };
  return {
    hooks,
    commits,
    get clears() {
      return clearCount;
    },
  } as { hooks: DateFilterSectionHooks; commits: DateClauseState[]; clears: number };
}

function mount(): HTMLDivElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return host;
}

beforeEach(() => {
  for (const el of document.querySelectorAll("div")) el.remove();
});

describe("createDateFilterSection — structure", () => {
  it("renders a collapsible <details class='mining-lib-date-section'>", () => {
    const host = mount();
    const { hooks } = makeHooks();
    const section = createDateFilterSection(hooks);
    host.appendChild(section.element);
    section.update();
    const details = host.querySelector("details.mining-lib-date-section");
    expect(details).not.toBeNull();
    expect((details as HTMLDetailsElement).open).toBe(true);
    section.destroy();
  });

  it("summary reads `Date range` with no suffix when clause is null", () => {
    const host = mount();
    const { hooks } = makeHooks();
    const section = createDateFilterSection(hooks);
    host.appendChild(section.element);
    section.update();
    const summary = host.querySelector("details.mining-lib-date-section > summary");
    expect(summary?.textContent).toBe("Date range");
    section.destroy();
  });

  it("summary appends ` · active` when any bound is set", () => {
    const host = mount();
    const { hooks } = makeHooks({
      getDateClause: () => ({ from: "2026-03-01", to: null, anchor: "started" }),
    });
    const section = createDateFilterSection(hooks);
    host.appendChild(section.element);
    section.update();
    const summary = host.querySelector("details.mining-lib-date-section > summary");
    expect(summary?.textContent).toBe("Date range · active");
    section.destroy();
  });

  it("auto-hides (no DOM) when log has no events", () => {
    const host = mount();
    const { hooks } = makeHooks({ getLog: () => EMPTY_LOG });
    const section = createDateFilterSection(hooks);
    host.appendChild(section.element);
    section.update();
    expect(host.querySelector("details.mining-lib-date-section")).toBeNull();
    section.destroy();
  });

  it("renders anchor select + two date inputs + histogram (no preset chips)", () => {
    const host = mount();
    const { hooks } = makeHooks();
    const section = createDateFilterSection(hooks);
    host.appendChild(section.element);
    section.update();
    expect(host.querySelectorAll(".mining-lib-date-preset-chip")).toHaveLength(0);
    expect(host.querySelectorAll("select.mining-lib-date-anchor")).toHaveLength(1);
    expect(host.querySelectorAll("input.mining-lib-date-input")).toHaveLength(2);
    expect(host.querySelectorAll("svg.mining-lib-date-histogram")).toHaveLength(1);
    section.destroy();
  });

  it("anchor select has two DateAnchor options (started + ended), defaulting to `started`", () => {
    const host = mount();
    const { hooks } = makeHooks();
    const section = createDateFilterSection(hooks);
    host.appendChild(section.element);
    section.update();
    const sel = host.querySelector<HTMLSelectElement>("select.mining-lib-date-anchor");
    const values = Array.from(sel?.options ?? []).map((o) => o.value);
    expect(values).toEqual(["started", "ended"]);
    expect(sel?.value).toBe("started");
    section.destroy();
  });

  it("inputs receive log's min/max as the HTML min/max calendar bounds", () => {
    const host = mount();
    const { hooks } = makeHooks();
    const section = createDateFilterSection(hooks);
    host.appendChild(section.element);
    section.update();
    const inputs = host.querySelectorAll<HTMLInputElement>("input.mining-lib-date-input");
    expect(inputs[0]?.min).toBe("2026-01-01");
    expect(inputs[0]?.max).toBe("2026-12-31");
    expect(inputs[1]?.min).toBe("2026-01-01");
    expect(inputs[1]?.max).toBe("2026-12-31");
    section.destroy();
  });

  it("inputs pre-fill with log min/max when no clause is active", () => {
    const host = mount();
    const { hooks } = makeHooks();
    const section = createDateFilterSection(hooks);
    host.appendChild(section.element);
    section.update();
    const inputs = host.querySelectorAll<HTMLInputElement>("input.mining-lib-date-input");
    expect(inputs[0]?.value).toBe("2026-01-01");
    expect(inputs[1]?.value).toBe("2026-12-31");
    section.destroy();
  });

  it("clause bounds override pre-fill (per-bound: null falls back to log edge)", () => {
    const host = mount();
    const { hooks } = makeHooks({
      getDateClause: () => ({ from: "2026-03-01", to: null, anchor: "started" }),
    });
    const section = createDateFilterSection(hooks);
    host.appendChild(section.element);
    section.update();
    const inputs = host.querySelectorAll<HTMLInputElement>("input.mining-lib-date-input");
    expect(inputs[0]?.value).toBe("2026-03-01"); // clause value
    expect(inputs[1]?.value).toBe("2026-12-31"); // pre-fill (clause.to was null)
    section.destroy();
  });
});

describe("createDateFilterSection — interaction", () => {
  it("input change pushes a new date clause via onCommit (uses pre-filled other bound)", () => {
    const host = mount();
    const { hooks, commits } = makeHooks();
    const section = createDateFilterSection(hooks);
    host.appendChild(section.element);
    section.update();
    const fromInput = host.querySelectorAll<HTMLInputElement>("input.mining-lib-date-input")[0];
    if (!fromInput) throw new Error("missing from input");
    fromInput.value = "2026-03-01";
    fromInput.dispatchEvent(new Event("change", { bubbles: true }));
    expect(commits).toHaveLength(1);
    // The `to` input was pre-filled with log max (2026-12-31) so the
    // commit picks that up — filter-equivalent to null on that side
    // since the log max is a no-op upper bound.
    expect(commits[0]).toEqual({
      from: "2026-03-01",
      to: "2026-12-31",
      anchor: "started",
    });
    section.destroy();
  });

  it("auto-swaps when from > to before commit", () => {
    const host = mount();
    const { hooks, commits } = makeHooks({
      getDateClause: () => ({ from: "2026-04-01", to: null, anchor: "started" }),
    });
    const section = createDateFilterSection(hooks);
    host.appendChild(section.element);
    section.update();
    const toInput = host.querySelectorAll<HTMLInputElement>("input.mining-lib-date-input")[1];
    if (!toInput) throw new Error("missing to input");
    toInput.value = "2026-03-01";
    toInput.dispatchEvent(new Event("change", { bubbles: true }));
    expect(commits).toHaveLength(1);
    // Swapped: from=Mar 1, to=Apr 1
    expect(commits[0]).toEqual({
      from: "2026-03-01",
      to: "2026-04-01",
      anchor: "started",
    });
    section.destroy();
  });

  it("anchor select change pushes commit with new anchor + current bounds", () => {
    const host = mount();
    const { hooks, commits } = makeHooks({
      getDateClause: () => ({ from: "2026-03-01", to: "2026-03-31", anchor: "started" }),
    });
    const section = createDateFilterSection(hooks);
    host.appendChild(section.element);
    section.update();
    const sel = host.querySelector<HTMLSelectElement>("select.mining-lib-date-anchor");
    if (!sel) throw new Error("missing anchor select");
    sel.value = "ended";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    expect(commits).toHaveLength(1);
    expect(commits[0]).toEqual({
      from: "2026-03-01",
      to: "2026-03-31",
      anchor: "ended",
    });
    section.destroy();
  });

  it("update() re-syncs input values from getDateClause()", () => {
    const host = mount();
    let clause: DateClauseState | null = null;
    const { hooks } = makeHooks({ getDateClause: () => clause });
    const section = createDateFilterSection(hooks);
    host.appendChild(section.element);
    section.update();
    // No clause → inputs pre-filled with log min/max.
    const inputs = host.querySelectorAll<HTMLInputElement>("input.mining-lib-date-input");
    expect(inputs[0]?.value).toBe("2026-01-01");
    expect(inputs[1]?.value).toBe("2026-12-31");

    clause = { from: "2026-03-01", to: "2026-03-31", anchor: "ended" };
    section.update();
    const inputs2 = host.querySelectorAll<HTMLInputElement>("input.mining-lib-date-input");
    const sel = host.querySelector<HTMLSelectElement>("select.mining-lib-date-anchor");
    expect(inputs2[0]?.value).toBe("2026-03-01");
    expect(inputs2[1]?.value).toBe("2026-03-31");
    expect(sel?.value).toBe("ended");
    section.destroy();
  });
});
