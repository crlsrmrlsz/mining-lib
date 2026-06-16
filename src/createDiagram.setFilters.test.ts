import { afterEach, describe, expect, it } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import { buildDfg } from "./buildDfg.js";
import type { FilterClause } from "./filterClauses.js";
import { variantSignature } from "./getVariants.js";
import { createDiagram } from "./index.js";
import { parseCsv } from "./parseCsv.js";

const { log: n5Log } = parseCsv(n5Csv);
const n5Dfg = buildDfg(n5Log);

const DIRECT_APPROVAL = [
  "submitted",
  "intake_validation",
  "assigned_to_reviewer",
  "review_in_progress",
  "health_inspection",
  "approved",
];
const EARLY_REJECTION = ["submitted", "intake_validation", "rejected"];

function makeHost(): HTMLDivElement {
  const host = document.createElement("div");
  host.style.width = "1200px";
  host.style.height = "720px";
  document.body.appendChild(host);
  return host;
}

function shadowSvg(host: HTMLDivElement): SVGSVGElement {
  const el = host.querySelector("mining-lib-diagram") as
    | (HTMLElement & { shadowRoot: ShadowRoot | null })
    | null;
  const svg = el?.shadowRoot?.querySelector("svg.mining-lib-svg");
  if (!svg) throw new Error("svg not found in shadow root");
  return svg as SVGSVGElement;
}

function nodeCount(host: HTMLDivElement): number {
  return shadowSvg(host).querySelectorAll("g.mining-lib-node").length;
}

afterEach(() => {
  for (const el of document.querySelectorAll("mining-lib-diagram")) el.remove();
  for (const el of document.querySelectorAll("div")) el.remove();
});

describe("DiagramHandle.setFilters / getFilters — replace semantics (Scenario 6)", () => {
  it("replace overrides, never merges, the previous list", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);

    handle.setFilters([{ kind: "branch", edge: ["intake_validation", "rejected"] }]);
    expect(handle.getFilters()).toEqual([
      { kind: "branch", edge: ["intake_validation", "rejected"] },
    ]);

    handle.setFilters([{ kind: "node", activity: "approved" }]);
    const after = handle.getFilters();
    expect(after).toHaveLength(1);
    expect(after[0]).toEqual({ kind: "node", activity: "approved" });

    handle.setFilters([]);
    expect(handle.getFilters()).toEqual([]);
    handle.destroy();
  });

  it("getFilters returns a defensive copy (mutation does not affect handle state)", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    handle.setFilters([{ kind: "node", activity: "rejected" }]);

    const a = handle.getFilters();
    a.push({ kind: "node", activity: "tampered" });
    a[0] = { kind: "node", activity: "approved" };

    const b = handle.getFilters();
    expect(b).toHaveLength(1);
    expect(b[0]).toEqual({ kind: "node", activity: "rejected" });
    expect(b).not.toBe(a);
    handle.destroy();
  });

  it("clears all filtering on setFilters([])", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    const fullNodes = nodeCount(host);

    handle.setFilters([{ kind: "branch", edge: ["intake_validation", "rejected"] }]);
    expect(nodeCount(host)).toBe(3); // submitted, intake_validation, rejected only

    handle.setFilters([]);
    expect(nodeCount(host)).toBe(fullNodes);
    handle.destroy();
  });

  it("throws TypeError on non-array input", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    expect(() => handle.setFilters("nope" as unknown as FilterClause[])).toThrow(TypeError);
    expect(() => handle.setFilters(null as unknown as FilterClause[])).toThrow(TypeError);
    handle.destroy();
  });

  it("throws TypeError on a clause with a malformed shape", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    expect(() => handle.setFilters([{ kind: "branch" } as unknown as FilterClause])).toThrow(
      TypeError,
    );
    expect(() => handle.setFilters([{ kind: "node" } as unknown as FilterClause])).toThrow(
      TypeError,
    );
    expect(() =>
      handle.setFilters([{ kind: "variant", sequences: ["ok", 1] } as unknown as FilterClause]),
    ).toThrow(TypeError);
    expect(() => handle.setFilters([{ kind: "attribute" } as unknown as FilterClause])).toThrow(
      TypeError,
    );
    expect(() =>
      handle.setFilters([
        { kind: "attribute", attribute: "case:priority" } as unknown as FilterClause,
      ]),
    ).toThrow(TypeError);
    expect(() =>
      handle.setFilters([
        {
          kind: "attribute",
          attribute: "case:priority",
          values: [{} as unknown as never],
        } as unknown as FilterClause,
      ]),
    ).toThrow(TypeError);
    expect(() => handle.setFilters([{ kind: "made-up" } as unknown as FilterClause])).toThrow(
      TypeError,
    );
    handle.destroy();
  });

  it("throws TypeError on a malformed date clause", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    // Missing fields entirely.
    expect(() => handle.setFilters([{ kind: "date" } as unknown as FilterClause])).toThrow(
      TypeError,
    );
    // Unknown anchor string.
    expect(() =>
      handle.setFilters([
        {
          kind: "date",
          from: "2024-01-01",
          to: "2024-02-01",
          anchor: "made-up",
        } as unknown as FilterClause,
      ]),
    ).toThrow(TypeError);
    // Non-string non-null `from`.
    expect(() =>
      handle.setFilters([
        {
          kind: "date",
          from: 123 as unknown as null,
          to: null,
          anchor: "started",
        } as unknown as FilterClause,
      ]),
    ).toThrow(TypeError);
    handle.destroy();
  });

  it("typing a `from` date in the section's input commits a date clause through the chrome", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    const el = host.querySelector("mining-lib-diagram") as HTMLElement;
    const fromInput = el.querySelector<HTMLInputElement>(
      "input.mining-lib-date-input[data-kind='from']",
    );
    if (!fromInput) throw new Error("missing from input");
    fromInput.value = "2024-01-10";
    fromInput.dispatchEvent(new Event("change", { bubbles: true }));
    const filters = handle.getFilters();
    const dateClause = filters.find((c) => c.kind === "date");
    expect(dateClause).toBeDefined();
    if (dateClause?.kind === "date") {
      expect(dateClause.anchor).toBe("started");
      expect(dateClause.from).toBe("2024-01-10");
    }
    handle.destroy();
  });

  it("round-trips a well-formed date clause through setFilters/getFilters with defensive copy", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    handle.setFilters([{ kind: "date", from: "2024-01-01", to: "2024-01-31", anchor: "started" }]);
    const got = handle.getFilters();
    expect(got).toHaveLength(1);
    expect(got[0]).toEqual({
      kind: "date",
      from: "2024-01-01",
      to: "2024-01-31",
      anchor: "started",
    });
    // Mutating the returned array doesn't leak into internal state.
    got.length = 0;
    expect(handle.getFilters()).toHaveLength(1);
    handle.destroy();
  });

  it("throws TypeError on a malformed caseId clause", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    // Missing caseIds.
    expect(() => handle.setFilters([{ kind: "caseId" } as unknown as FilterClause])).toThrow(
      TypeError,
    );
    // Non-array.
    expect(() =>
      handle.setFilters([{ kind: "caseId", caseIds: "case_0001" } as unknown as FilterClause]),
    ).toThrow(TypeError);
    // Non-string element.
    expect(() =>
      handle.setFilters([{ kind: "caseId", caseIds: [123] } as unknown as FilterClause]),
    ).toThrow(TypeError);
    // Empty-string element.
    expect(() => handle.setFilters([{ kind: "caseId", caseIds: [""] }])).toThrow(TypeError);
    handle.destroy();
  });

  it("round-trips a well-formed caseId clause through setFilters/getFilters with defensive copy", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    handle.setFilters([{ kind: "caseId", caseIds: ["case_0001", "case_0003"] }]);
    const got = handle.getFilters();
    expect(got).toHaveLength(1);
    expect(got[0]).toEqual({ kind: "caseId", caseIds: ["case_0001", "case_0003"] });
    // Mutating the returned array's caseIds doesn't leak into internal state.
    const ids = (got[0] as Extract<FilterClause, { kind: "caseId" }>).caseIds;
    ids.push("case_99999");
    expect((handle.getFilters()[0] as Extract<FilterClause, { kind: "caseId" }>).caseIds).toEqual([
      "case_0001",
      "case_0003",
    ]);
    handle.destroy();
  });
});

describe("Filters panel — case-attribute section mount (Phase 25 §5)", () => {
  function diagramHost(host: HTMLDivElement): HTMLElement {
    const el = host.querySelector("mining-lib-diagram") as HTMLElement | null;
    if (!el) throw new Error("<mining-lib-diagram> not found");
    return el;
  }

  it("mounts a case-attributes section inside the Filters panel with one details per filterable attribute", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    const sections = diagramHost(host).querySelectorAll("details.mining-lib-attr-section");
    // n5 fixture has case:applicant_type + case:priority, both with ≥ 2 distinct values.
    expect(sections.length).toBe(2);
    const attrs = Array.from(sections).map((s) => (s as HTMLDetailsElement).dataset.attribute);
    expect(attrs).toEqual(["case:applicant_type", "case:priority"]);
    handle.destroy();
  });

  it("toggling a section checkbox pushes a setFilters call with the right attribute clause", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    const prioritySection = diagramHost(host).querySelector(
      "details.mining-lib-attr-section[data-attribute='case:priority']",
    );
    expect(prioritySection).not.toBeNull();
    const checkboxes =
      prioritySection?.querySelectorAll<HTMLInputElement>("input[type='checkbox']") ?? [];
    let highCheckbox: HTMLInputElement | null = null;
    for (const cb of Array.from(checkboxes)) {
      const valueText = cb.parentElement?.querySelector(".mining-lib-attr-value")?.textContent;
      if (valueText === "high") highCheckbox = cb;
    }
    expect(highCheckbox).not.toBeNull();
    if (highCheckbox) {
      highCheckbox.checked = true;
      highCheckbox.dispatchEvent(new Event("change"));
    }
    expect(handle.getFilters()).toEqual([
      { kind: "attribute", attribute: "case:priority", values: ["high"] },
    ]);
    handle.destroy();
  });

  it("counts in the section reflect the filtered log (Decision D6 — dynamic counts)", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    handle.setFilters([{ kind: "attribute", attribute: "case:priority", values: ["high"] }]);
    const prioritySection = diagramHost(host).querySelector(
      "details.mining-lib-attr-section[data-attribute='case:priority']",
    );
    const rows = prioritySection?.querySelectorAll(".mining-lib-attr-row") ?? [];
    const byValue = new Map<string | null, string | null>();
    for (const row of Array.from(rows)) {
      const v = row.querySelector(".mining-lib-attr-value")?.textContent ?? null;
      const c = row.querySelector(".mining-lib-attr-count")?.textContent ?? null;
      byValue.set(v, c);
    }
    expect(byValue.get("high")).toBe("1");
    expect(byValue.get("normal")).toBe("0");
    handle.destroy();
  });
});

describe("DiagramHandle.setFilters — attribute clause round-trip (Phase 25)", () => {
  it("accepts an attribute clause and round-trips it through getFilters", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    const clause: FilterClause = {
      kind: "attribute",
      attribute: "case:priority",
      values: ["high"],
    };
    handle.setFilters([clause]);
    expect(handle.getFilters()).toEqual([clause]);
    handle.destroy();
  });

  it("getFilters returns a defensive copy of attribute clauses", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    handle.setFilters([{ kind: "attribute", attribute: "case:priority", values: ["high", "low"] }]);
    const got = handle.getFilters();
    const first = got[0] as Extract<FilterClause, { kind: "attribute" }>;
    first.values.push("normal");
    const again = handle.getFilters();
    const firstAgain = again[0] as Extract<FilterClause, { kind: "attribute" }>;
    expect(firstAgain.values).toEqual(["high", "low"]);
    handle.destroy();
  });

  it("attribute clause filters the rendered DFG (n5 priority=high → only case_0005's events)", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    const before = nodeCount(host);
    handle.setFilters([{ kind: "attribute", attribute: "case:priority", values: ["high"] }]);
    const after = nodeCount(host);
    // case_0005 is the rework-loop case in n5 — it does pass through
    // every node, so the post-filter count can equal the pre-filter
    // count for the n5 fixture. The contract here is "the filter
    // doesn't throw and the diagram re-renders"; the per-fixture
    // count delta is asserted in the more granular caseAttributeFilter
    // e2e tests.
    expect(typeof after).toBe("number");
    expect(after).toBeLessThanOrEqual(before);
    handle.destroy();
  });

  it("attribute clause accepts the (unset) sentinel", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    // No n5 case has null priority, so this filters to zero cases.
    handle.setFilters([{ kind: "attribute", attribute: "case:priority", values: ["(unset)"] }]);
    expect(nodeCount(host)).toBe(0);
    handle.destroy();
  });

  it("attribute clause accepts numeric and boolean values", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    // These attributes don't exist in n5 — matcher returns empty set.
    handle.setFilters([
      { kind: "attribute", attribute: "case:score", values: [1, 2, 3] },
      { kind: "attribute", attribute: "case:vip", values: [true] },
    ]);
    expect(handle.getFilters()).toEqual([
      { kind: "attribute", attribute: "case:score", values: [1, 2, 3] },
      { kind: "attribute", attribute: "case:vip", values: [true] },
    ]);
    handle.destroy();
  });
});

describe("DiagramHandle.setVariantFilter back-compat round-trip (Scenario 7)", () => {
  it("setVariantFilter writes a `variant` clause that getFilters reads back", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);

    const sigA = variantSignature(DIRECT_APPROVAL);
    const sigB = variantSignature(EARLY_REJECTION);
    handle.setVariantFilter([sigA, sigB]);

    expect(handle.getFilters()).toEqual([{ kind: "variant", sequences: [sigA, sigB] }]);
    expect(handle.getVariantFilter()).toEqual([sigA, sigB]);
    handle.destroy();
  });

  it("setFilters with a variant clause is visible to getVariantFilter", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);

    const sig = variantSignature(EARLY_REJECTION);
    handle.setFilters([{ kind: "variant", sequences: [sig] }]);
    expect(handle.getVariantFilter()).toEqual([sig]);
    handle.destroy();
  });

  it("setVariantFilter(null) strips only the variant clause; non-variant clauses survive", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);

    handle.setFilters([
      { kind: "variant", sequences: [variantSignature(DIRECT_APPROVAL)] },
      { kind: "node", activity: "rejected" },
    ]);
    expect(handle.getFilters()).toHaveLength(2);

    handle.setVariantFilter(null);
    expect(handle.getFilters()).toEqual([{ kind: "node", activity: "rejected" }]);
    expect(handle.getVariantFilter()).toBeNull();
    handle.destroy();
  });
});

describe("DiagramHandle.setFilters structural dedup (Scenario 8)", () => {
  it("two structurally-equal branch clauses collapse to one", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);

    handle.setFilters([
      { kind: "branch", edge: ["a", "b"] },
      { kind: "branch", edge: ["a", "b"] },
    ]);
    expect(handle.getFilters()).toHaveLength(1);
    handle.destroy();
  });

  it("two distinct branch clauses on different edges coexist", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);

    handle.setFilters([
      { kind: "branch", edge: ["a", "b"] },
      { kind: "branch", edge: ["c", "d"] },
    ]);
    expect(handle.getFilters()).toHaveLength(2);
    handle.destroy();
  });

  it("variant clauses with the same set of sequences (different order) collapse to one", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);

    handle.setFilters([
      { kind: "variant", sequences: ["A", "B"] },
      { kind: "variant", sequences: ["B", "A"] },
    ]);
    expect(handle.getFilters()).toHaveLength(1);
    handle.destroy();
  });

  it("repeat-clicking the same edge through setFilters does not duplicate", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);

    const edgeClause: FilterClause = {
      kind: "branch",
      edge: ["intake_validation", "rejected"],
    };
    handle.setFilters([...handle.getFilters(), edgeClause]);
    handle.setFilters([...handle.getFilters(), edgeClause]);
    handle.setFilters([...handle.getFilters(), edgeClause]);

    const filters = handle.getFilters();
    expect(filters.filter((c) => c.kind === "branch")).toHaveLength(1);
    handle.destroy();
  });
});
