import { afterEach, describe, expect, it } from "vitest";
import { UNSET_VALUE } from "./caseAttributeFilter.js";
import {
  type CaseAttributesSectionHooks,
  createCaseAttributesSection,
} from "./caseAttributesSection.js";
import type { AttributeValue } from "./types.js";

function makeHost(): HTMLDivElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return host;
}

type Row = { value: AttributeValue; displayLabel: string; count: number };

function makeHooks(
  overrides: Partial<CaseAttributesSectionHooks> = {},
): CaseAttributesSectionHooks {
  return {
    getAttributes: () => [],
    getRowsFor: () => [],
    getActiveValues: () => [],
    onToggle: () => undefined,
    ...overrides,
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("createCaseAttributesSection — empty / construction", () => {
  it("returns an element with class `mining-lib-attr-sections` and an update() method", () => {
    const section = createCaseAttributesSection(makeHooks());
    expect(section.element).toBeInstanceOf(HTMLElement);
    expect(section.element.classList.contains("mining-lib-attr-sections")).toBe(true);
    expect(typeof section.update).toBe("function");
  });

  it("renders no <details> children when getAttributes() returns []", () => {
    const section = createCaseAttributesSection(makeHooks());
    section.update();
    expect(section.element.querySelectorAll("details").length).toBe(0);
  });
});

describe("createCaseAttributesSection — single attribute", () => {
  const baseRows: Row[] = [
    { value: "low", displayLabel: "low", count: 184 },
    { value: "normal", displayLabel: "normal", count: 597 },
    { value: "high", displayLabel: "high", count: 219 },
  ];

  it("renders one <details> per attribute, open by default, with a summary", () => {
    const host = makeHost();
    const section = createCaseAttributesSection(
      makeHooks({
        getAttributes: () => ["case:priority"],
        getRowsFor: () => baseRows,
      }),
    );
    host.appendChild(section.element);
    section.update();
    const details = section.element.querySelectorAll<HTMLDetailsElement>(
      "details.mining-lib-attr-section",
    );
    expect(details).toHaveLength(1);
    expect(details[0]?.open).toBe(true);
    const summary = details[0]?.querySelector("summary");
    expect(summary?.textContent).toContain("Priority");
  });

  it("body contains one row per distinct value with label + count", () => {
    const section = createCaseAttributesSection(
      makeHooks({
        getAttributes: () => ["case:priority"],
        getRowsFor: () => baseRows,
      }),
    );
    section.update();
    const rows = section.element.querySelectorAll<HTMLLabelElement>(".mining-lib-attr-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.querySelector(".mining-lib-attr-value")?.textContent).toBe("low");
    expect(rows[0]?.querySelector(".mining-lib-attr-count")?.textContent).toBe("184");
    expect(rows[1]?.querySelector(".mining-lib-attr-value")?.textContent).toBe("normal");
    expect(rows[2]?.querySelector(".mining-lib-attr-value")?.textContent).toBe("high");
  });

  it("checkbox `checked` state mirrors getActiveValues for each row", () => {
    const section = createCaseAttributesSection(
      makeHooks({
        getAttributes: () => ["case:priority"],
        getRowsFor: () => baseRows,
        getActiveValues: () => ["high"],
      }),
    );
    section.update();
    const checkboxes = section.element.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    expect(checkboxes[0]?.checked).toBe(false); // low
    expect(checkboxes[1]?.checked).toBe(false); // normal
    expect(checkboxes[2]?.checked).toBe(true); // high
  });

  it("summary appends `· N selected` when active values are present", () => {
    const section = createCaseAttributesSection(
      makeHooks({
        getAttributes: () => ["case:priority"],
        getRowsFor: () => baseRows,
        getActiveValues: () => ["high", "low"],
      }),
    );
    section.update();
    const summary = section.element.querySelector("summary");
    expect(summary?.textContent).toBe("Priority · 2 selected");
  });

  it("summary shows only the attribute name when no values are active", () => {
    const section = createCaseAttributesSection(
      makeHooks({
        getAttributes: () => ["case:priority"],
        getRowsFor: () => baseRows,
        getActiveValues: () => [],
      }),
    );
    section.update();
    expect(section.element.querySelector("summary")?.textContent).toBe("Priority");
  });

  it("toggling a checkbox emits onToggle(attribute, value)", () => {
    const calls: Array<{ attribute: string; value: AttributeValue }> = [];
    const section = createCaseAttributesSection(
      makeHooks({
        getAttributes: () => ["case:priority"],
        getRowsFor: () => baseRows,
        onToggle: (attribute, value) => calls.push({ attribute, value }),
      }),
    );
    section.update();
    const checkboxes = section.element.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    const high = checkboxes[2];
    if (high) {
      high.checked = true;
      high.dispatchEvent(new Event("change"));
    }
    expect(calls).toEqual([{ attribute: "case:priority", value: "high" }]);
  });

  it("update() re-reads getActiveValues and re-syncs checkbox state", () => {
    let active: AttributeValue[] = [];
    const section = createCaseAttributesSection(
      makeHooks({
        getAttributes: () => ["case:priority"],
        getRowsFor: () => baseRows,
        getActiveValues: () => active,
      }),
    );
    section.update();
    const initialCheckboxes =
      section.element.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    expect(initialCheckboxes[2]?.checked).toBe(false);

    active = ["high"];
    section.update();
    const reCheckboxes =
      section.element.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    expect(reCheckboxes[2]?.checked).toBe(true);
  });
});

describe("createCaseAttributesSection — multiple attributes", () => {
  it("renders one <details> per attribute in the order returned by getAttributes", () => {
    const section = createCaseAttributesSection(
      makeHooks({
        getAttributes: () => ["case:applicant_type", "case:priority"],
        getRowsFor: (attr) =>
          attr === "case:applicant_type"
            ? [
                { value: "new_business", displayLabel: "new_business", count: 3 },
                { value: "renewal", displayLabel: "renewal", count: 1 },
              ]
            : [
                { value: "normal", displayLabel: "normal", count: 4 },
                { value: "high", displayLabel: "high", count: 1 },
              ],
      }),
    );
    section.update();
    const summaries = Array.from(section.element.querySelectorAll("summary")).map(
      (s) => s.textContent,
    );
    expect(summaries).toEqual(["Applicant type", "Priority"]);
  });

  it("onToggle receives the correct attribute string for the clicked row", () => {
    const calls: Array<{ attribute: string; value: AttributeValue }> = [];
    const section = createCaseAttributesSection(
      makeHooks({
        getAttributes: () => ["case:applicant_type", "case:priority"],
        getRowsFor: (attr) =>
          attr === "case:applicant_type"
            ? [{ value: "renewal", displayLabel: "renewal", count: 1 }]
            : [{ value: "high", displayLabel: "high", count: 1 }],
        onToggle: (attribute, value) => calls.push({ attribute, value }),
      }),
    );
    section.update();
    const checkboxes = section.element.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    for (const cb of [checkboxes[0], checkboxes[1]]) {
      if (cb) {
        cb.checked = true;
        cb.dispatchEvent(new Event("change"));
      }
    }
    expect(calls).toEqual([
      { attribute: "case:applicant_type", value: "renewal" },
      { attribute: "case:priority", value: "high" },
    ]);
  });
});

describe("createCaseAttributesSection — sentinel handling", () => {
  it("renders a row with displayLabel '(unset)' when the caller passes UNSET_VALUE", () => {
    const section = createCaseAttributesSection(
      makeHooks({
        getAttributes: () => ["case:priority"],
        getRowsFor: () => [
          { value: "high", displayLabel: "high", count: 2 },
          { value: UNSET_VALUE, displayLabel: "(unset)", count: 3 },
        ],
      }),
    );
    section.update();
    const valueLabels = Array.from(section.element.querySelectorAll(".mining-lib-attr-value")).map(
      (n) => n.textContent,
    );
    expect(valueLabels).toEqual(["high", "(unset)"]);
  });

  it("toggling the (unset) row emits onToggle with the sentinel string", () => {
    const calls: Array<{ attribute: string; value: AttributeValue }> = [];
    const section = createCaseAttributesSection(
      makeHooks({
        getAttributes: () => ["case:priority"],
        getRowsFor: () => [{ value: UNSET_VALUE, displayLabel: "(unset)", count: 3 }],
        onToggle: (attribute, value) => calls.push({ attribute, value }),
      }),
    );
    section.update();
    const cb = section.element.querySelector<HTMLInputElement>("input[type='checkbox']");
    if (cb) {
      cb.checked = true;
      cb.dispatchEvent(new Event("change"));
    }
    expect(calls).toEqual([{ attribute: "case:priority", value: UNSET_VALUE }]);
  });
});

describe("createCaseAttributesSection — preserves DOM across in-place updates", () => {
  const baseRows: Row[] = [
    { value: "low", displayLabel: "low", count: 184 },
    { value: "normal", displayLabel: "normal", count: 597 },
    { value: "high", displayLabel: "high", count: 219 },
  ];

  it("keeps the same <details> element and its open state when only the selection changes", () => {
    let active: AttributeValue[] = [];
    const section = createCaseAttributesSection(
      makeHooks({
        getAttributes: () => ["case:priority"],
        getRowsFor: () => baseRows,
        getActiveValues: () => active,
      }),
    );
    makeHost().appendChild(section.element);
    section.update();
    const detailsBefore = section.element.querySelector<HTMLDetailsElement>(
      "details.mining-lib-attr-section",
    );
    if (!detailsBefore) throw new Error("expected a section");
    detailsBefore.open = false; // user collapsed it

    active = ["high"]; // a checkbox toggle: same structure, new selection
    section.update();

    const detailsAfter = section.element.querySelector<HTMLDetailsElement>(
      "details.mining-lib-attr-section",
    );
    expect(detailsAfter).toBe(detailsBefore); // not rebuilt → scroll/state preserved
    expect(detailsAfter?.open).toBe(false); // user's collapse survives the toggle
    const checkboxes = section.element.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    expect(checkboxes[2]?.checked).toBe(true); // selection still synced
  });

  it("updates the summary selected-count in place (same <summary> node)", () => {
    let active: AttributeValue[] = [];
    const section = createCaseAttributesSection(
      makeHooks({
        getAttributes: () => ["case:priority"],
        getRowsFor: () => baseRows,
        getActiveValues: () => active,
      }),
    );
    makeHost().appendChild(section.element);
    section.update();
    const summaryBefore = section.element.querySelector("summary");
    active = ["high", "low"];
    section.update();
    const summaryAfter = section.element.querySelector("summary");
    expect(summaryAfter).toBe(summaryBefore);
    expect(summaryAfter?.textContent).toBe("Priority · 2 selected");
  });

  it("updates per-value count text in place when filtered counts change", () => {
    let rows: Row[] = [
      { value: "low", displayLabel: "low", count: 184 },
      { value: "high", displayLabel: "high", count: 219 },
    ];
    const section = createCaseAttributesSection(
      makeHooks({
        getAttributes: () => ["case:priority"],
        getRowsFor: () => rows,
      }),
    );
    makeHost().appendChild(section.element);
    section.update();
    const firstRowBefore = section.element.querySelector<HTMLLabelElement>(".mining-lib-attr-row");
    // Same value list, but the filtered counts shrink:
    rows = [
      { value: "low", displayLabel: "low", count: 12 },
      { value: "high", displayLabel: "high", count: 219 },
    ];
    section.update();
    const firstRowAfter = section.element.querySelector<HTMLLabelElement>(".mining-lib-attr-row");
    expect(firstRowAfter).toBe(firstRowBefore); // same element, not rebuilt
    expect(firstRowAfter?.querySelector(".mining-lib-attr-count")?.textContent).toBe("12");
  });

  it("rebuilds when the attribute set changes (structure key differs)", () => {
    let attrs = ["case:priority"];
    const section = createCaseAttributesSection(
      makeHooks({
        getAttributes: () => attrs,
        getRowsFor: () => baseRows,
      }),
    );
    makeHost().appendChild(section.element);
    section.update();
    attrs = ["case:priority", "case:region"];
    section.update();
    expect(section.element.querySelectorAll("details.mining-lib-attr-section")).toHaveLength(2);
  });

  it("rebuilds when an attribute's value list changes", () => {
    let rows: Row[] = [{ value: "low", displayLabel: "low", count: 5 }];
    const section = createCaseAttributesSection(
      makeHooks({
        getAttributes: () => ["case:priority"],
        getRowsFor: () => rows,
      }),
    );
    makeHost().appendChild(section.element);
    section.update();
    rows = [
      { value: "low", displayLabel: "low", count: 5 },
      { value: "high", displayLabel: "high", count: 3 },
    ];
    section.update();
    expect(section.element.querySelectorAll(".mining-lib-attr-row")).toHaveLength(2);
  });

  it("syncs cleared selection, unchecked boxes, and changed counts in place", () => {
    let active: AttributeValue[] = ["high"];
    let rows: Row[] = [
      { value: "low", displayLabel: "low", count: 184 },
      { value: "high", displayLabel: "high", count: 219 },
    ];
    const section = createCaseAttributesSection(
      makeHooks({
        getAttributes: () => ["case:priority"],
        getRowsFor: () => rows,
        getActiveValues: () => active,
      }),
    );
    makeHost().appendChild(section.element);
    section.update(); // fullRender, one value selected
    expect(section.element.querySelector("summary")?.textContent).toBe("Priority · 1 selected");

    // Same structure → in-place sync: selection cleared and counts shrink.
    active = [];
    rows = [
      { value: "low", displayLabel: "low", count: 5 },
      { value: "high", displayLabel: "high", count: 9 },
    ];
    section.update();

    expect(section.element.querySelector("summary")?.textContent).toBe("Priority");
    const checkboxes = section.element.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    expect([...checkboxes].some((c) => c.checked)).toBe(false);
    const counts = [...section.element.querySelectorAll(".mining-lib-attr-count")].map(
      (n) => n.textContent,
    );
    expect(counts).toEqual(["5", "9"]);
  });
});

describe("createCaseAttributesSection — non-string values", () => {
  it("renders rows for numeric and boolean values via the caller-supplied displayLabel", () => {
    const section = createCaseAttributesSection(
      makeHooks({
        getAttributes: () => ["case:vip"],
        getRowsFor: () => [
          { value: true, displayLabel: "true", count: 5 },
          { value: false, displayLabel: "false", count: 95 },
        ],
      }),
    );
    section.update();
    const labels = Array.from(section.element.querySelectorAll(".mining-lib-attr-value")).map(
      (n) => n.textContent,
    );
    expect(labels).toEqual(["true", "false"]);
  });

  it("onToggle forwards the raw AttributeValue (number/boolean) unchanged", () => {
    const calls: Array<{ attribute: string; value: AttributeValue }> = [];
    const section = createCaseAttributesSection(
      makeHooks({
        getAttributes: () => ["case:score"],
        getRowsFor: () => [{ value: 1, displayLabel: "1", count: 10 }],
        onToggle: (attribute, value) => calls.push({ attribute, value }),
      }),
    );
    section.update();
    const cb = section.element.querySelector<HTMLInputElement>("input[type='checkbox']");
    if (cb) {
      cb.checked = true;
      cb.dispatchEvent(new Event("change"));
    }
    expect(calls).toEqual([{ attribute: "case:score", value: 1 }]);
  });
});
