import { afterEach, describe, expect, it } from "vitest";
import { UNSET_VALUE } from "./caseAttributeFilter.js";
import {
  type CaseAttributesBlockHooks,
  type CaseAttributesBlockSection,
  createCaseAttributesBlock,
} from "./caseAttributesBlock.js";
import type { AttributeValue } from "./types.js";

afterEach(() => {
  document.body.replaceChildren();
});

function noopHooks(): CaseAttributesBlockHooks {
  return {
    getActiveValues: () => [],
    onToggle: () => undefined,
  };
}

describe("createCaseAttributesBlock — structure", () => {
  it("returns { element, destroy }", () => {
    const block = createCaseAttributesBlock([], noopHooks());
    expect(block.element).toBeInstanceOf(HTMLElement);
    expect(typeof block.destroy).toBe("function");
  });

  it("element has class `mining-lib-pill-attrs`", () => {
    const block = createCaseAttributesBlock([], noopHooks());
    expect(block.element.classList.contains("mining-lib-pill-attrs")).toBe(true);
  });

  it("renders one sub-section per row with a label and toggle column", () => {
    const sections: CaseAttributesBlockSection[] = [
      {
        attribute: "case:priority",
        humanLabel: "Priority",
        distribution: [
          { value: "high", displayLabel: "high", count: 1 },
          { value: "normal", displayLabel: "normal", count: 4 },
        ],
      },
      {
        attribute: "case:applicant_type",
        humanLabel: "Applicant type",
        distribution: [{ value: "renewal", displayLabel: "renewal", count: 1 }],
      },
    ];
    const block = createCaseAttributesBlock(sections, noopHooks());
    const subs = block.element.querySelectorAll(".mining-lib-pill-attr-section");
    expect(subs).toHaveLength(2);
    expect(subs[0]?.querySelector(".mining-lib-pill-attr-label")?.textContent).toBe("Priority");
    expect(subs[1]?.querySelector(".mining-lib-pill-attr-label")?.textContent).toBe(
      "Applicant type",
    );
  });

  it("renders one toggle button per distinct value with displayLabel + count", () => {
    const sections: CaseAttributesBlockSection[] = [
      {
        attribute: "case:priority",
        humanLabel: "Priority",
        distribution: [
          { value: "high", displayLabel: "high", count: 1 },
          { value: "normal", displayLabel: "normal", count: 4 },
        ],
      },
    ];
    const block = createCaseAttributesBlock(sections, noopHooks());
    const buttons = block.element.querySelectorAll<HTMLButtonElement>(".mining-lib-pill-attr-row");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.querySelector(".mining-lib-pill-attr-value")?.textContent).toBe("high");
    expect(buttons[0]?.querySelector(".mining-lib-pill-attr-count")?.textContent).toBe("1");
    expect(buttons[1]?.querySelector(".mining-lib-pill-attr-value")?.textContent).toBe("normal");
    expect(buttons[1]?.querySelector(".mining-lib-pill-attr-count")?.textContent).toBe("4");
  });
});

describe("createCaseAttributesBlock — active state", () => {
  it("highlights rows whose value is in getActiveValues(attribute)", () => {
    const sections: CaseAttributesBlockSection[] = [
      {
        attribute: "case:priority",
        humanLabel: "Priority",
        distribution: [
          { value: "high", displayLabel: "high", count: 1 },
          { value: "normal", displayLabel: "normal", count: 4 },
        ],
      },
    ];
    const block = createCaseAttributesBlock(sections, {
      getActiveValues: (attr) => (attr === "case:priority" ? ["high"] : []),
      onToggle: () => undefined,
    });
    const buttons = block.element.querySelectorAll<HTMLButtonElement>(".mining-lib-pill-attr-row");
    expect(buttons[0]?.classList.contains("mining-lib-pill-attr-row-active")).toBe(true);
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(buttons[1]?.classList.contains("mining-lib-pill-attr-row-active")).toBe(false);
    expect(buttons[1]?.getAttribute("aria-pressed")).toBe("false");
  });

  it("scopes active state to the row's own attribute (not cross-attribute leakage)", () => {
    const sections: CaseAttributesBlockSection[] = [
      {
        attribute: "case:priority",
        humanLabel: "Priority",
        distribution: [{ value: "high", displayLabel: "high", count: 1 }],
      },
      {
        attribute: "case:applicant_type",
        humanLabel: "Applicant type",
        distribution: [{ value: "high", displayLabel: "high", count: 1 }],
      },
    ];
    const block = createCaseAttributesBlock(sections, {
      // "high" active on priority only, not on applicant_type.
      getActiveValues: (attr) => (attr === "case:priority" ? ["high"] : []),
      onToggle: () => undefined,
    });
    const buttons = block.element.querySelectorAll<HTMLButtonElement>(".mining-lib-pill-attr-row");
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(buttons[1]?.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("createCaseAttributesBlock — toggle dispatch", () => {
  it("clicking a row emits onToggle(attribute, value)", () => {
    const calls: Array<{ attribute: string; value: AttributeValue }> = [];
    const sections: CaseAttributesBlockSection[] = [
      {
        attribute: "case:priority",
        humanLabel: "Priority",
        distribution: [{ value: "high", displayLabel: "high", count: 1 }],
      },
    ];
    const block = createCaseAttributesBlock(sections, {
      getActiveValues: () => [],
      onToggle: (attr, value) => calls.push({ attribute: attr, value }),
    });
    block.element.querySelector<HTMLButtonElement>(".mining-lib-pill-attr-row")?.click();
    expect(calls).toEqual([{ attribute: "case:priority", value: "high" }]);
  });

  it("clicking a row in the second section emits with that section's attribute", () => {
    const calls: Array<{ attribute: string; value: AttributeValue }> = [];
    const sections: CaseAttributesBlockSection[] = [
      {
        attribute: "case:priority",
        humanLabel: "Priority",
        distribution: [{ value: "high", displayLabel: "high", count: 1 }],
      },
      {
        attribute: "case:applicant_type",
        humanLabel: "Applicant type",
        distribution: [{ value: "renewal", displayLabel: "renewal", count: 1 }],
      },
    ];
    const block = createCaseAttributesBlock(sections, {
      getActiveValues: () => [],
      onToggle: (attr, value) => calls.push({ attribute: attr, value }),
    });
    const rows = block.element.querySelectorAll<HTMLButtonElement>(".mining-lib-pill-attr-row");
    rows[1]?.click();
    expect(calls).toEqual([{ attribute: "case:applicant_type", value: "renewal" }]);
  });

  it("clicking the (unset) row emits onToggle with the sentinel string", () => {
    const calls: Array<{ attribute: string; value: AttributeValue }> = [];
    const sections: CaseAttributesBlockSection[] = [
      {
        attribute: "case:priority",
        humanLabel: "Priority",
        distribution: [{ value: UNSET_VALUE, displayLabel: "(unset)", count: 3 }],
      },
    ];
    const block = createCaseAttributesBlock(sections, {
      getActiveValues: () => [],
      onToggle: (attr, value) => calls.push({ attribute: attr, value }),
    });
    block.element.querySelector<HTMLButtonElement>(".mining-lib-pill-attr-row")?.click();
    expect(calls).toEqual([{ attribute: "case:priority", value: UNSET_VALUE }]);
  });
});

describe("createCaseAttributesBlock — destroy", () => {
  it("detaches the element from its parent", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const block = createCaseAttributesBlock([], noopHooks());
    host.appendChild(block.element);
    expect(host.contains(block.element)).toBe(true);
    block.destroy();
    expect(host.contains(block.element)).toBe(false);
  });
});
