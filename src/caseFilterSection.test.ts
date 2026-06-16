import { describe, expect, it } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import { type CaseFilterSectionHooks, createCaseFilterSection } from "./caseFilterSection.js";
import { parseCsv } from "./parseCsv.js";
import type { EventLog } from "./types.js";

const { log: n5Log } = parseCsv(n5Csv);

const EMPTY_LOG: EventLog = {
  cases: new Map(),
  events: [],
  schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
};

function mountFixture(initial: { caseId?: string | null; log?: EventLog } = {}): {
  hooks: CaseFilterSectionHooks;
  state: { caseId: string | null; log: EventLog };
  events: { commit: string[]; clear: number };
  setState(patch: Partial<{ caseId: string | null; log: EventLog }>): void;
} {
  const state = {
    caseId: initial.caseId ?? null,
    log: initial.log ?? n5Log,
  };
  const events = { commit: [] as string[], clear: 0 };
  const hooks: CaseFilterSectionHooks = {
    getLog: () => state.log,
    getCaseId: () => state.caseId,
    onCommit: (id) => {
      events.commit.push(id);
    },
    onClear: () => {
      events.clear += 1;
    },
  };
  return {
    hooks,
    state,
    events,
    setState(patch) {
      Object.assign(state, patch);
    },
  };
}

describe("createCaseFilterSection — construction", () => {
  it("element has the section-mount class", () => {
    const fx = mountFixture();
    const section = createCaseFilterSection(fx.hooks);
    section.update();
    expect(section.element.classList.contains("mining-lib-case-section-mount")).toBe(true);
    section.destroy();
  });

  it("renders a collapsible details + combobox (input + chevron + popup, no native datalist)", () => {
    const fx = mountFixture();
    const section = createCaseFilterSection(fx.hooks);
    section.update();
    expect(section.element.querySelector("details.mining-lib-case-section")).not.toBeNull();
    expect(section.element.querySelector("input.mining-lib-case-input")).not.toBeNull();
    expect(section.element.querySelector(".mining-lib-case-chevron")).not.toBeNull();
    expect(section.element.querySelector("ul.mining-lib-case-popup")).not.toBeNull();
    // No native datalist any more — replaced by a custom popup.
    expect(section.element.querySelector("datalist")).toBeNull();
    section.destroy();
  });

  it("popup is hidden by default", () => {
    const fx = mountFixture();
    const section = createCaseFilterSection(fx.hooks);
    section.update();
    const popup = section.element.querySelector("ul.mining-lib-case-popup") as HTMLUListElement;
    expect(popup.hidden).toBe(true);
    section.destroy();
  });

  it("summary reads `Case` by default", () => {
    const fx = mountFixture();
    const section = createCaseFilterSection(fx.hooks);
    section.update();
    expect(section.element.querySelector("summary")?.textContent).toBe("Case");
    section.destroy();
  });

  it("summary reads `Case · active` when a case is pinned", () => {
    const fx = mountFixture({ caseId: "case_0001" });
    const section = createCaseFilterSection(fx.hooks);
    section.update();
    expect(section.element.querySelector("summary")?.textContent).toBe("Case · active");
    section.destroy();
  });

  it("populates the popup with one item per case id (lex order)", () => {
    const fx = mountFixture();
    const section = createCaseFilterSection(fx.hooks);
    section.update();
    const items = section.element.querySelectorAll("li.mining-lib-case-popup-item");
    expect(items.length).toBe(n5Log.cases.size);
    expect((items[0] as HTMLElement).dataset.value).toBe("case_0001");
    expect((items[n5Log.cases.size - 1] as HTMLElement).dataset.value).toBe(
      `case_000${n5Log.cases.size}`,
    );
    section.destroy();
  });

  it("pre-fills the input with the active case id", () => {
    const fx = mountFixture({ caseId: "case_0003" });
    const section = createCaseFilterSection(fx.hooks);
    section.update();
    const input = section.element.querySelector("input.mining-lib-case-input") as HTMLInputElement;
    expect(input.value).toBe("case_0003");
    section.destroy();
  });
});

describe("createCaseFilterSection — popup open/close", () => {
  it("clicking the chevron opens the popup", () => {
    const fx = mountFixture();
    const section = createCaseFilterSection(fx.hooks);
    section.update();
    const chevron = section.element.querySelector(".mining-lib-case-chevron") as HTMLButtonElement;
    const popup = section.element.querySelector("ul.mining-lib-case-popup") as HTMLUListElement;
    expect(popup.hidden).toBe(true);
    chevron.click();
    expect(popup.hidden).toBe(false);
    section.destroy();
  });

  it("clicking the chevron a second time closes the popup (toggle)", () => {
    const fx = mountFixture();
    const section = createCaseFilterSection(fx.hooks);
    section.update();
    const chevron = section.element.querySelector(".mining-lib-case-chevron") as HTMLButtonElement;
    const popup = section.element.querySelector("ul.mining-lib-case-popup") as HTMLUListElement;
    chevron.click();
    chevron.click();
    expect(popup.hidden).toBe(true);
    section.destroy();
  });

  it("Escape on the input closes the popup", () => {
    const fx = mountFixture();
    const section = createCaseFilterSection(fx.hooks);
    section.update();
    const chevron = section.element.querySelector(".mining-lib-case-chevron") as HTMLButtonElement;
    const input = section.element.querySelector("input.mining-lib-case-input") as HTMLInputElement;
    const popup = section.element.querySelector("ul.mining-lib-case-popup") as HTMLUListElement;
    chevron.click();
    expect(popup.hidden).toBe(false);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(popup.hidden).toBe(true);
    section.destroy();
  });
});

describe("createCaseFilterSection — live filtering as user types", () => {
  it("typing in the input filters the visible popup items (case-insensitive substring)", () => {
    const fx = mountFixture();
    const section = createCaseFilterSection(fx.hooks);
    section.update();
    const input = section.element.querySelector("input.mining-lib-case-input") as HTMLInputElement;
    // n5 fixture has case_0001 through case_0005. Type "3" → only case_0003 visible.
    input.value = "3";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const visible = Array.from(
      section.element.querySelectorAll<HTMLLIElement>("li.mining-lib-case-popup-item"),
    ).filter((li) => !li.hidden);
    expect(visible.length).toBe(1);
    expect(visible[0]?.dataset.value).toBe("case_0003");
    section.destroy();
  });

  it("typing automatically opens the popup", () => {
    const fx = mountFixture();
    const section = createCaseFilterSection(fx.hooks);
    section.update();
    const input = section.element.querySelector("input.mining-lib-case-input") as HTMLInputElement;
    const popup = section.element.querySelector("ul.mining-lib-case-popup") as HTMLUListElement;
    expect(popup.hidden).toBe(true);
    input.value = "case_0";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(popup.hidden).toBe(false);
    section.destroy();
  });

  it("clearing the input shows every item again", () => {
    const fx = mountFixture();
    const section = createCaseFilterSection(fx.hooks);
    section.update();
    const input = section.element.querySelector("input.mining-lib-case-input") as HTMLInputElement;
    input.value = "3";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const visible = Array.from(
      section.element.querySelectorAll<HTMLLIElement>("li.mining-lib-case-popup-item"),
    ).filter((li) => !li.hidden);
    expect(visible.length).toBe(n5Log.cases.size);
    section.destroy();
  });
});

describe("createCaseFilterSection — commit paths", () => {
  it("clicking a popup item calls onCommit with the value and closes the popup", () => {
    const fx = mountFixture();
    const section = createCaseFilterSection(fx.hooks);
    section.update();
    const chevron = section.element.querySelector(".mining-lib-case-chevron") as HTMLButtonElement;
    chevron.click(); // open popup
    const item = section.element.querySelector(
      "li.mining-lib-case-popup-item[data-value='case_0002']",
    ) as HTMLLIElement;
    item.click();
    expect(fx.events.commit).toEqual(["case_0002"]);
    const popup = section.element.querySelector("ul.mining-lib-case-popup") as HTMLUListElement;
    expect(popup.hidden).toBe(true);
    section.destroy();
  });

  it("Enter on a valid case id (via typing) calls onCommit", () => {
    const fx = mountFixture();
    const section = createCaseFilterSection(fx.hooks);
    section.update();
    const input = section.element.querySelector("input.mining-lib-case-input") as HTMLInputElement;
    input.value = "case_0001";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(fx.events.commit).toEqual(["case_0001"]);
    section.destroy();
  });

  it("Enter on an invalid case id shows the hint and does not commit", () => {
    const fx = mountFixture();
    const section = createCaseFilterSection(fx.hooks);
    section.update();
    const input = section.element.querySelector("input.mining-lib-case-input") as HTMLInputElement;
    input.value = "case_99999";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(fx.events.commit).toEqual([]);
    const hint = section.element.querySelector(".mining-lib-case-hint");
    expect(hint?.textContent ?? "").toContain("No such case");
    section.destroy();
  });

  it("Enter on an empty input calls onClear (clearing the filter)", () => {
    const fx = mountFixture({ caseId: "case_0001" });
    const section = createCaseFilterSection(fx.hooks);
    section.update();
    const input = section.element.querySelector("input.mining-lib-case-input") as HTMLInputElement;
    input.value = "";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(fx.events.clear).toBe(1);
    expect(fx.events.commit).toEqual([]);
    section.destroy();
  });

  it("re-committing the current pinned id is a no-op (avoids redundant setFilters)", () => {
    const fx = mountFixture({ caseId: "case_0001" });
    const section = createCaseFilterSection(fx.hooks);
    section.update();
    const input = section.element.querySelector("input.mining-lib-case-input") as HTMLInputElement;
    input.value = "case_0001";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(fx.events.commit).toEqual([]);
    section.destroy();
  });
});

describe("createCaseFilterSection — empty log", () => {
  it("input + chevron disabled and empty-msg shown when no cases", () => {
    const fx = mountFixture({ log: EMPTY_LOG });
    const section = createCaseFilterSection(fx.hooks);
    section.update();
    const input = section.element.querySelector("input.mining-lib-case-input") as HTMLInputElement;
    const chevron = section.element.querySelector(".mining-lib-case-chevron") as HTMLButtonElement;
    expect(input.disabled).toBe(true);
    expect(chevron.disabled).toBe(true);
    const empty = section.element.querySelector(".mining-lib-case-empty-msg");
    expect(empty?.textContent ?? "").toContain("No cases in current filter");
    section.destroy();
  });
});

describe("createCaseFilterSection — update() resync", () => {
  it("rebuilds the popup items after the log changes", () => {
    const fx = mountFixture();
    const section = createCaseFilterSection(fx.hooks);
    section.update();
    expect(section.element.querySelectorAll("li.mining-lib-case-popup-item").length).toBe(
      n5Log.cases.size,
    );
    fx.setState({ log: EMPTY_LOG });
    section.update();
    expect(section.element.querySelectorAll("li.mining-lib-case-popup-item").length).toBe(0);
    section.destroy();
  });

  it("reflects a newly-set caseId in the summary + input value", () => {
    const fx = mountFixture();
    const section = createCaseFilterSection(fx.hooks);
    section.update();
    expect(section.element.querySelector("summary")?.textContent).toBe("Case");
    fx.setState({ caseId: "case_0002" });
    section.update();
    expect(section.element.querySelector("summary")?.textContent).toBe("Case · active");
    const input = section.element.querySelector("input.mining-lib-case-input") as HTMLInputElement;
    expect(input.value).toBe("case_0002");
    section.destroy();
  });
});
