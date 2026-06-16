import { describe, expect, it } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import {
  activeCaseAttributeValues,
  formatAttributeChipLabel,
  formatAttributeValue,
  getCaseAttributeDistribution,
  getCaseAttributeDistributionAtNode,
  getFilterableCaseAttributes,
  humanizeAttributeName,
  logHasCaseAttributes,
  toggleCaseAttribute,
  UNSET_VALUE,
} from "./caseAttributeFilter.js";
import type { FilterClause } from "./filterClauses.js";
import { parseCsv } from "./parseCsv.js";
import type { AttributeValue, Case, Event, EventLog } from "./types.js";

const { log: n5Log } = parseCsv(n5Csv);

function makeLog(
  cases: { id: string; attributes: Record<string, AttributeValue>; activities: string[] }[],
  caseAttributes: string[] = [],
): EventLog {
  const eventList: Event[] = [];
  const caseMap = new Map<string, Case>();
  for (const c of cases) {
    const events: Event[] = c.activities.map((activity, i) => ({
      caseId: c.id,
      activity,
      timestamp: new Date(2024, 0, 1, 0, i),
      resource: null,
      lifecycle: "complete",
      attributes: {},
    }));
    eventList.push(...events);
    caseMap.set(c.id, { id: c.id, events, attributes: c.attributes });
  }
  return {
    cases: caseMap,
    events: eventList,
    schema: { caseAttributes, eventAttributes: [], columnTypes: {} },
  };
}

describe("UNSET_VALUE", () => {
  it("equals '(unset)' — mirrors UNASSIGNED_RESOURCE convention", () => {
    expect(UNSET_VALUE).toBe("(unset)");
  });
});

describe("formatAttributeValue", () => {
  it("null → UNSET_VALUE sentinel", () => {
    expect(formatAttributeValue(null)).toBe("(unset)");
  });

  it("undefined → UNSET_VALUE sentinel", () => {
    expect(formatAttributeValue(undefined as unknown as AttributeValue)).toBe("(unset)");
  });

  it("boolean true → 'true'", () => {
    expect(formatAttributeValue(true)).toBe("true");
  });

  it("boolean false → 'false'", () => {
    expect(formatAttributeValue(false)).toBe("false");
  });

  it("number → String(n)", () => {
    expect(formatAttributeValue(42)).toBe("42");
    expect(formatAttributeValue(3.14)).toBe("3.14");
    expect(formatAttributeValue(0)).toBe("0");
  });

  it("string → identity", () => {
    expect(formatAttributeValue("high")).toBe("high");
    expect(formatAttributeValue("")).toBe("");
  });
});

describe("humanizeAttributeName", () => {
  it("strips 'case:' prefix and capitalises first letter", () => {
    expect(humanizeAttributeName("case:priority")).toBe("Priority");
  });

  it("replaces underscores with spaces", () => {
    expect(humanizeAttributeName("case:applicant_type")).toBe("Applicant type");
  });

  it("only capitalises the first letter (rest stays lowercase)", () => {
    expect(humanizeAttributeName("case:long_name_with_underscores")).toBe(
      "Long name with underscores",
    );
  });

  it("returns '' for a bare 'case:' prefix with no remainder", () => {
    // Stripping "case:" leaves "", spaced stays "" → the length-0 guard
    // returns the empty string without attempting charAt/slice.
    expect(humanizeAttributeName("case:")).toBe("");
  });

  it("works without the case: prefix (passes through other prefixes)", () => {
    // Non case:* should not have its prefix stripped — humanize is for display labels.
    expect(humanizeAttributeName("cost:amount")).toBe("Cost:amount");
  });

  it("handles already-humanised single words", () => {
    expect(humanizeAttributeName("case:region")).toBe("Region");
  });
});

describe("logHasCaseAttributes", () => {
  it("returns false for a log with no schema.caseAttributes", () => {
    const log = makeLog([], []);
    expect(logHasCaseAttributes(log)).toBe(false);
  });

  it("returns false for a log whose case attributes are all mono-value", () => {
    const log = makeLog(
      [
        { id: "c1", attributes: { "case:tenant": "acme" }, activities: ["x"] },
        { id: "c2", attributes: { "case:tenant": "acme" }, activities: ["x"] },
      ],
      ["case:tenant"],
    );
    expect(logHasCaseAttributes(log)).toBe(false);
  });

  it("returns true when at least one case attribute has ≥ 2 distinct values", () => {
    const log = makeLog(
      [
        { id: "c1", attributes: { "case:priority": "high" }, activities: ["x"] },
        { id: "c2", attributes: { "case:priority": "low" }, activities: ["x"] },
      ],
      ["case:priority"],
    );
    expect(logHasCaseAttributes(log)).toBe(true);
  });

  it("treats null and a real value as 2 distinct values (non-mono)", () => {
    const log = makeLog(
      [
        { id: "c1", attributes: { "case:priority": null }, activities: ["x"] },
        { id: "c2", attributes: { "case:priority": "high" }, activities: ["x"] },
      ],
      ["case:priority"],
    );
    expect(logHasCaseAttributes(log)).toBe(true);
  });

  it("returns true on the n5 fixture (priority + applicant_type both have ≥ 2 values)", () => {
    expect(logHasCaseAttributes(n5Log)).toBe(true);
  });

  it("treats a case missing the attribute key as the null/(unset) value when counting distinctness", () => {
    // c1 has no "case:priority" key at all → countDistinctValues reads
    // undefined and coerces it to null, which is a distinct value from
    // "high". So the column is non-mono and the log is filterable.
    const log = makeLog(
      [
        { id: "c1", attributes: {}, activities: ["x"] },
        { id: "c2", attributes: { "case:priority": "high" }, activities: ["x"] },
      ],
      ["case:priority"],
    );
    expect(logHasCaseAttributes(log)).toBe(true);
  });

  it("treats a missing key like an explicit null — both coerce to the same distinct value (mono)", () => {
    // c1 omits the key (→ null) and c2 sets it to null explicitly. Both
    // collapse to the same single distinct value, so the column is mono
    // and not filterable.
    const log = makeLog(
      [
        { id: "c1", attributes: {}, activities: ["x"] },
        { id: "c2", attributes: { "case:priority": null }, activities: ["x"] },
      ],
      ["case:priority"],
    );
    expect(getFilterableCaseAttributes(log)).toEqual([]);
  });
});

describe("getFilterableCaseAttributes", () => {
  it("returns [] when no schema.caseAttributes", () => {
    const log = makeLog([], []);
    expect(getFilterableCaseAttributes(log)).toEqual([]);
  });

  it("excludes mono-value columns", () => {
    const log = makeLog(
      [
        {
          id: "c1",
          attributes: { "case:tenant": "acme", "case:priority": "high" },
          activities: ["x"],
        },
        {
          id: "c2",
          attributes: { "case:tenant": "acme", "case:priority": "low" },
          activities: ["x"],
        },
      ],
      ["case:tenant", "case:priority"],
    );
    expect(getFilterableCaseAttributes(log)).toEqual(["case:priority"]);
  });

  it("preserves schema order (not alphabetic)", () => {
    const log = makeLog(
      [
        {
          id: "c1",
          attributes: { "case:z_first": "a", "case:a_second": "x" },
          activities: ["x"],
        },
        {
          id: "c2",
          attributes: { "case:z_first": "b", "case:a_second": "y" },
          activities: ["x"],
        },
      ],
      ["case:z_first", "case:a_second"],
    );
    expect(getFilterableCaseAttributes(log)).toEqual(["case:z_first", "case:a_second"]);
  });

  it("returns both attributes for the n5 fixture (CSV header order — applicant_type first)", () => {
    expect(getFilterableCaseAttributes(n5Log)).toEqual(["case:applicant_type", "case:priority"]);
  });
});

describe("getCaseAttributeDistribution", () => {
  it("returns rows sorted by count desc on n5 priority", () => {
    const rows = getCaseAttributeDistribution("case:priority", n5Log);
    expect(rows).toEqual([
      { value: "normal", count: 4 },
      { value: "high", count: 1 },
    ]);
  });

  it("returns rows sorted by count desc on n5 applicant_type, lex tiebreak", () => {
    const rows = getCaseAttributeDistribution("case:applicant_type", n5Log);
    // counts: new_business=3, existing_business=1, renewal=1 → existing_business < renewal lex.
    expect(rows).toEqual([
      { value: "new_business", count: 3 },
      { value: "existing_business", count: 1 },
      { value: "renewal", count: 1 },
    ]);
  });

  it("places (unset) row last", () => {
    const log = makeLog(
      [
        { id: "c1", attributes: { "case:p": "a" }, activities: ["x"] },
        { id: "c2", attributes: { "case:p": null }, activities: ["x"] },
        { id: "c3", attributes: { "case:p": "a" }, activities: ["x"] },
        { id: "c4", attributes: { "case:p": "b" }, activities: ["x"] },
      ],
      ["case:p"],
    );
    const rows = getCaseAttributeDistribution("case:p", log);
    // counts: a=2, b=1, null=1 → a, b, null (sentinel last regardless of count).
    // Rows hold the raw AttributeValue (null), not the display string; the UI
    // formats via formatAttributeValue at render time.
    expect(rows.map((r) => r.value)).toEqual(["a", "b", null]);
    expect(rows.map((r) => formatAttributeValue(r.value))).toEqual(["a", "b", "(unset)"]);
  });

  it("(unset) stays last even when null is the most-frequent value", () => {
    const log = makeLog(
      [
        { id: "c1", attributes: { "case:p": null }, activities: ["x"] },
        { id: "c2", attributes: { "case:p": null }, activities: ["x"] },
        { id: "c3", attributes: { "case:p": null }, activities: ["x"] },
        { id: "c4", attributes: { "case:p": "a" }, activities: ["x"] },
      ],
      ["case:p"],
    );
    const rows = getCaseAttributeDistribution("case:p", log);
    expect(rows[0]?.value).toBe("a");
    expect(rows[1]?.value).toBe(null);
  });

  it("returns [] when the attribute is not present on any case", () => {
    const log = makeLog([], ["case:p"]);
    expect(getCaseAttributeDistribution("case:p", log)).toEqual([]);
  });

  it("counts each case once even if it has multiple events", () => {
    const log = makeLog(
      [
        {
          id: "c1",
          attributes: { "case:p": "a" },
          activities: ["x", "y", "z"], // 3 events
        },
        { id: "c2", attributes: { "case:p": "b" }, activities: ["x"] },
      ],
      ["case:p"],
    );
    const rows = getCaseAttributeDistribution("case:p", log);
    expect(rows).toEqual([
      { value: "a", count: 1 },
      { value: "b", count: 1 },
    ]);
  });

  it("coerces a case missing the attribute key to the null/(unset) row", () => {
    // c2 has no "case:p" key → c.attributes["case:p"] is undefined, which
    // the function coerces to null and buckets under the (unset) sentinel.
    const log = makeLog(
      [
        { id: "c1", attributes: { "case:p": "a" }, activities: ["x"] },
        { id: "c2", attributes: {}, activities: ["x"] },
      ],
      ["case:p"],
    );
    const rows = getCaseAttributeDistribution("case:p", log);
    // null row sorts last regardless of count.
    expect(rows).toEqual([
      { value: "a", count: 1 },
      { value: null, count: 1 },
    ]);
  });

  it("breaks an equal-count tie between distinct keys that render to the same string by lex of the display value (→ 0, stable)", () => {
    // number 5 and string "5" are distinct Map keys, both non-null, with
    // equal counts. compareRows formats both to "5" so neither lex branch
    // fires and the comparator returns 0 — the pair stays in insertion order.
    const log = makeLog(
      [
        { id: "c1", attributes: { "case:p": 5 }, activities: ["x"] },
        { id: "c2", attributes: { "case:p": "5" }, activities: ["x"] },
      ],
      ["case:p"],
    );
    const rows = getCaseAttributeDistribution("case:p", log);
    expect(rows).toEqual([
      { value: 5, count: 1 },
      { value: "5", count: 1 },
    ]);
    expect(rows.map((r) => formatAttributeValue(r.value))).toEqual(["5", "5"]);
  });
});

describe("getCaseAttributeDistributionAtNode", () => {
  it("scopes counts to cases that pass through the given activity", () => {
    // In n5: case_0005 has priority=high. It also has the rework loop with request_additional_info.
    // Only case_0005 passes through request_additional_info → priority distribution there should
    // contain only "high".
    const rows = getCaseAttributeDistributionAtNode(
      "request_additional_info",
      "case:priority",
      n5Log,
    );
    expect(rows).toEqual([{ value: "high", count: 1 }]);
  });

  it("returns the full distribution for an activity every case passes through (submitted)", () => {
    const rows = getCaseAttributeDistributionAtNode("submitted", "case:priority", n5Log);
    // Every case has `submitted` → 4 normal + 1 high.
    expect(rows).toEqual([
      { value: "normal", count: 4 },
      { value: "high", count: 1 },
    ]);
  });

  it("returns [] when no case passes through the activity", () => {
    const rows = getCaseAttributeDistributionAtNode("does_not_exist", "case:priority", n5Log);
    expect(rows).toEqual([]);
  });

  it("does not double-count a case that has the activity multiple times", () => {
    // case_0005 has request_additional_info twice (the rework loop). Should still count 1.
    const rows = getCaseAttributeDistributionAtNode(
      "request_additional_info",
      "case:priority",
      n5Log,
    );
    expect(rows[0]?.count).toBe(1);
  });

  it("skips an event whose caseId has no entry in log.cases", () => {
    // Build a 2-case log, then drop c2 from the cases map while leaving its
    // events behind — exactly the shape of a log where an event references a
    // missing case. The matching-case set still contains "c2", but the lookup
    // returns undefined, so it is skipped and only c1 contributes a row.
    const log = makeLog(
      [
        { id: "c1", attributes: { "case:p": "a" }, activities: ["x"] },
        { id: "c2", attributes: { "case:p": "b" }, activities: ["x"] },
      ],
      ["case:p"],
    );
    log.cases.delete("c2");
    const rows = getCaseAttributeDistributionAtNode("x", "case:p", log);
    expect(rows).toEqual([{ value: "a", count: 1 }]);
  });

  it("coerces a matching case that is missing the attribute key to the null/(unset) row", () => {
    // c2 passes through "x" but has no "case:p" key → undefined is coerced
    // to null and bucketed under the (unset) sentinel, which sorts last.
    const log = makeLog(
      [
        { id: "c1", attributes: { "case:p": "a" }, activities: ["x"] },
        { id: "c2", attributes: {}, activities: ["x"] },
      ],
      ["case:p"],
    );
    const rows = getCaseAttributeDistributionAtNode("x", "case:p", log);
    expect(rows).toEqual([
      { value: "a", count: 1 },
      { value: null, count: 1 },
    ]);
  });
});

describe("toggleCaseAttribute", () => {
  it("creates a new clause when none exists for the attribute", () => {
    const result = toggleCaseAttribute([], "case:priority", "high");
    expect(result).toEqual([{ kind: "attribute", attribute: "case:priority", values: ["high"] }]);
  });

  it("extends an existing clause's values array", () => {
    const list: FilterClause[] = [
      { kind: "attribute", attribute: "case:priority", values: ["high"] },
    ];
    const result = toggleCaseAttribute(list, "case:priority", "low");
    expect(result).toEqual([
      { kind: "attribute", attribute: "case:priority", values: ["high", "low"] },
    ]);
  });

  it("removes a value that is already in the clause", () => {
    const list: FilterClause[] = [
      { kind: "attribute", attribute: "case:priority", values: ["high", "low"] },
    ];
    const result = toggleCaseAttribute(list, "case:priority", "high");
    expect(result).toEqual([{ kind: "attribute", attribute: "case:priority", values: ["low"] }]);
  });

  it("strips the clause entirely when the last value is removed", () => {
    const list: FilterClause[] = [
      { kind: "attribute", attribute: "case:priority", values: ["high"] },
    ];
    const result = toggleCaseAttribute(list, "case:priority", "high");
    expect(result).toEqual([]);
  });

  it("creates a separate clause for a different attribute", () => {
    const list: FilterClause[] = [
      { kind: "attribute", attribute: "case:priority", values: ["high"] },
    ];
    const result = toggleCaseAttribute(list, "case:applicant_type", "renewal");
    expect(result).toEqual([
      { kind: "attribute", attribute: "case:priority", values: ["high"] },
      { kind: "attribute", attribute: "case:applicant_type", values: ["renewal"] },
    ]);
  });

  it("preserves non-attribute clauses unchanged", () => {
    const list: FilterClause[] = [
      { kind: "branch", edge: ["a", "b"] },
      { kind: "attribute", attribute: "case:priority", values: ["high"] },
    ];
    const result = toggleCaseAttribute(list, "case:priority", "high");
    expect(result).toEqual([{ kind: "branch", edge: ["a", "b"] }]);
  });

  it("handles the UNSET_VALUE sentinel like any other string", () => {
    const result = toggleCaseAttribute([], "case:priority", UNSET_VALUE);
    expect(result).toEqual([
      { kind: "attribute", attribute: "case:priority", values: ["(unset)"] },
    ]);
  });

  it("handles non-string values (numbers and booleans)", () => {
    const r1 = toggleCaseAttribute([], "case:score", 5);
    expect(r1).toEqual([{ kind: "attribute", attribute: "case:score", values: [5] }]);
    const r2 = toggleCaseAttribute([], "case:vip", true);
    expect(r2).toEqual([{ kind: "attribute", attribute: "case:vip", values: [true] }]);
  });
});

describe("activeCaseAttributeValues", () => {
  it("returns [] when no clause exists for the attribute", () => {
    expect(activeCaseAttributeValues([], "case:priority")).toEqual([]);
  });

  it("returns a defensive copy of the matching clause's values", () => {
    const list: FilterClause[] = [
      { kind: "attribute", attribute: "case:priority", values: ["high", "low"] },
    ];
    const result = activeCaseAttributeValues(list, "case:priority");
    expect(result).toEqual(["high", "low"]);
    result.push("normal");
    expect(activeCaseAttributeValues(list, "case:priority")).toEqual(["high", "low"]);
  });

  it("returns [] for an attribute that has no clause", () => {
    const list: FilterClause[] = [
      { kind: "attribute", attribute: "case:priority", values: ["high"] },
    ];
    expect(activeCaseAttributeValues(list, "case:applicant_type")).toEqual([]);
  });

  it("ignores non-attribute clauses", () => {
    const list: FilterClause[] = [{ kind: "branch", edge: ["a", "b"] }];
    expect(activeCaseAttributeValues(list, "case:priority")).toEqual([]);
  });
});

describe("formatAttributeChipLabel", () => {
  it("1 value → '{label}: {v}'", () => {
    expect(formatAttributeChipLabel("Priority", ["high"])).toBe("Priority: high");
  });

  it("2 values → '{label}: {v1}, {v2}' lex-sorted", () => {
    // Lex-sorted: "high" < "low".
    expect(formatAttributeChipLabel("Priority", ["low", "high"])).toBe("Priority: high, low");
  });

  it("3+ values → '{label}: {v1} +{n-1}' (v1 = lex-smallest)", () => {
    expect(formatAttributeChipLabel("Priority", ["normal", "high", "low"])).toBe(
      "Priority: high +2",
    );
  });

  it("renders non-string values via formatAttributeValue", () => {
    expect(formatAttributeChipLabel("Score", [3, 1, 2])).toBe("Score: 1 +2");
    expect(formatAttributeChipLabel("Vip", [true, false])).toBe("Vip: false, true");
  });

  it("(unset) sentinel sorts as a string ('(unset)' is lex-smaller than most letters)", () => {
    // '(' is ASCII 40, lower than letters, so (unset) comes first.
    expect(formatAttributeChipLabel("Priority", ["high", "(unset)"])).toBe(
      "Priority: (unset), high",
    );
  });

  it("keeps two values that render to the same string (sort comparator returns 0)", () => {
    // number 5 and string "5" both format to "5"; neither lex branch fires,
    // so the comparator returns 0 and both survive as the two listed values.
    expect(formatAttributeChipLabel("Score", [5, "5"])).toBe("Score: 5, 5");
  });
});
