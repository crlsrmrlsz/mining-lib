import { describe, expect, it } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import {
  activeResourcesAt,
  buildFilteredLogFromClauses,
  clauseEquals,
  clausesToCaseIds,
  cloneClause,
  dedupeClause,
  type FilterClause,
  replaceClause,
  toggleResourceAt,
  validateFilterClauses,
} from "./filterClauses.js";
import { getVariants, variantSignature } from "./getVariants.js";
import { parseCsv } from "./parseCsv.js";
import type { Case, EventLog } from "./types.js";

const { log: n5Log } = parseCsv(n5Csv);
const N5_VARIANTS = getVariants(n5Log);
const DIRECT_APPROVAL_SIG = variantSignature(N5_VARIANTS[0]?.sequence ?? []);

describe("clauseEquals", () => {
  it("returns false when kinds differ", () => {
    expect(
      clauseEquals({ kind: "node", activity: "a" }, { kind: "branch", edge: ["a", "b"] }),
    ).toBe(false);
  });

  it("variant clauses compare sequences as a set (order-independent)", () => {
    expect(
      clauseEquals(
        { kind: "variant", sequences: ["sigA", "sigB"] },
        { kind: "variant", sequences: ["sigB", "sigA"] },
      ),
    ).toBe(true);
    expect(
      clauseEquals(
        { kind: "variant", sequences: ["sigA", "sigB"] },
        { kind: "variant", sequences: ["sigA"] },
      ),
    ).toBe(false);
    expect(
      clauseEquals(
        { kind: "variant", sequences: ["sigA"] },
        { kind: "variant", sequences: ["sigB"] },
      ),
    ).toBe(false);
  });

  it("branch clauses compare edge tuples positionally", () => {
    expect(
      clauseEquals(
        { kind: "branch", edge: ["submitted", "approved"] },
        { kind: "branch", edge: ["submitted", "approved"] },
      ),
    ).toBe(true);
    expect(
      clauseEquals({ kind: "branch", edge: ["a", "b"] }, { kind: "branch", edge: ["b", "a"] }),
    ).toBe(false);
  });

  it("node clauses compare activity strings", () => {
    expect(
      clauseEquals(
        { kind: "node", activity: "review_in_progress" },
        { kind: "node", activity: "review_in_progress" },
      ),
    ).toBe(true);
    expect(
      clauseEquals(
        { kind: "node", activity: "review_in_progress" },
        { kind: "node", activity: "approved" },
      ),
    ).toBe(false);
  });

  it("resourceAt clauses compare activity + resources (set-equality on resources)", () => {
    expect(
      clauseEquals(
        { kind: "resourceAt", activity: "intake", resources: ["alice", "bob"] },
        { kind: "resourceAt", activity: "intake", resources: ["bob", "alice"] },
      ),
    ).toBe(true);
    expect(
      clauseEquals(
        { kind: "resourceAt", activity: "intake", resources: ["alice"] },
        { kind: "resourceAt", activity: "intake", resources: ["alice", "bob"] },
      ),
    ).toBe(false);
    expect(
      clauseEquals(
        { kind: "resourceAt", activity: "intake", resources: ["alice"] },
        { kind: "resourceAt", activity: "review", resources: ["alice"] },
      ),
    ).toBe(false);
  });

  it("resourceAt clause with the sentinel (unassigned) is just another string in the set", () => {
    expect(
      clauseEquals(
        { kind: "resourceAt", activity: "submitted", resources: ["(unassigned)"] },
        { kind: "resourceAt", activity: "submitted", resources: ["(unassigned)"] },
      ),
    ).toBe(true);
  });

  it("resourceAt clauses of equal length but differing members compare false", () => {
    // Same activity, same resource-count, but one member differs — exercises
    // the per-member set-membership check rather than the length short-circuit.
    expect(
      clauseEquals(
        { kind: "resourceAt", activity: "intake", resources: ["alice", "bob"] },
        { kind: "resourceAt", activity: "intake", resources: ["alice", "carol"] },
      ),
    ).toBe(false);
  });
});

describe("dedupeClause", () => {
  it("returns the same list reference when an exact duplicate exists", () => {
    const list: FilterClause[] = [{ kind: "branch", edge: ["a", "b"] }];
    const result = dedupeClause(list, { kind: "branch", edge: ["a", "b"] });
    expect(result).toBe(list);
  });

  it("appends on distinct content", () => {
    const list: FilterClause[] = [{ kind: "branch", edge: ["a", "b"] }];
    const result = dedupeClause(list, { kind: "branch", edge: ["c", "d"] });
    expect(result).not.toBe(list);
    expect(result).toHaveLength(2);
  });

  it("allows two branch clauses on different edges to coexist", () => {
    let list: FilterClause[] = [];
    list = dedupeClause(list, { kind: "branch", edge: ["a", "b"] });
    list = dedupeClause(list, { kind: "branch", edge: ["b", "c"] });
    expect(list).toHaveLength(2);
  });

  it("allows one node + one branch clause to coexist", () => {
    let list: FilterClause[] = [];
    list = dedupeClause(list, { kind: "branch", edge: ["a", "b"] });
    list = dedupeClause(list, { kind: "node", activity: "x" });
    expect(list).toHaveLength(2);
  });

  it("dedups variant clauses with the same set of sequences (order-insensitive)", () => {
    const list: FilterClause[] = [{ kind: "variant", sequences: ["A", "B"] }];
    const result = dedupeClause(list, { kind: "variant", sequences: ["B", "A"] });
    expect(result).toBe(list);
  });

  it("dedups resourceAt clauses with the same activity + same resource set", () => {
    const list: FilterClause[] = [
      { kind: "resourceAt", activity: "intake", resources: ["alice", "bob"] },
    ];
    const result = dedupeClause(list, {
      kind: "resourceAt",
      activity: "intake",
      resources: ["bob", "alice"],
    });
    expect(result).toBe(list);
  });

  it("allows two resourceAt clauses on different activities to coexist", () => {
    let list: FilterClause[] = [];
    list = dedupeClause(list, { kind: "resourceAt", activity: "intake", resources: ["alice"] });
    list = dedupeClause(list, { kind: "resourceAt", activity: "review", resources: ["alice"] });
    expect(list).toHaveLength(2);
  });

  it("allows resourceAt + branch clauses to coexist", () => {
    let list: FilterClause[] = [];
    list = dedupeClause(list, { kind: "branch", edge: ["a", "b"] });
    list = dedupeClause(list, { kind: "resourceAt", activity: "intake", resources: ["alice"] });
    expect(list).toHaveLength(2);
  });
});

describe("replaceClause", () => {
  it("strips an existing variant clause when sequences === null", () => {
    const list: FilterClause[] = [
      { kind: "variant", sequences: ["A"] },
      { kind: "branch", edge: ["x", "y"] },
    ];
    const result = replaceClause(list, "variant", null);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ kind: "branch", edge: ["x", "y"] });
  });

  it("replaces an existing variant clause with new sequences", () => {
    const list: FilterClause[] = [{ kind: "variant", sequences: ["A"] }];
    const result = replaceClause(list, "variant", ["B", "C"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ kind: "variant", sequences: ["B", "C"] });
  });

  it("appends a variant clause when none exists and sequences is non-null", () => {
    const list: FilterClause[] = [{ kind: "branch", edge: ["x", "y"] }];
    const result = replaceClause(list, "variant", ["A"]);
    expect(result).toHaveLength(2);
    expect(result.find((c) => c.kind === "variant")).toEqual({ kind: "variant", sequences: ["A"] });
  });

  it("round-trips: set → null → set produces the same final clause shape", () => {
    let list: FilterClause[] = [];
    list = replaceClause(list, "variant", ["A", "B"]);
    expect(list).toHaveLength(1);
    list = replaceClause(list, "variant", null);
    expect(list).toHaveLength(0);
    list = replaceClause(list, "variant", ["A", "B"]);
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({ kind: "variant", sequences: ["A", "B"] });
  });

  it("copies the sequences array (mutation does not leak to the clause)", () => {
    const sigs = ["A", "B"];
    const list = replaceClause([], "variant", sigs);
    sigs.push("C");
    const variantClause = list[0] as Extract<FilterClause, { kind: "variant" }>;
    expect(variantClause.sequences).toEqual(["A", "B"]);
  });
});

describe("toggleResourceAt", () => {
  it("creates a new clause when none exists for the activity", () => {
    const result = toggleResourceAt([], "intake", "alice");
    expect(result).toEqual([{ kind: "resourceAt", activity: "intake", resources: ["alice"] }]);
  });

  it("extends an existing clause's resources array", () => {
    const list: FilterClause[] = [{ kind: "resourceAt", activity: "intake", resources: ["alice"] }];
    const result = toggleResourceAt(list, "intake", "bob");
    expect(result).toEqual([
      { kind: "resourceAt", activity: "intake", resources: ["alice", "bob"] },
    ]);
  });

  it("removes a resource that's already in the clause", () => {
    const list: FilterClause[] = [
      { kind: "resourceAt", activity: "intake", resources: ["alice", "bob"] },
    ];
    const result = toggleResourceAt(list, "intake", "alice");
    expect(result).toEqual([{ kind: "resourceAt", activity: "intake", resources: ["bob"] }]);
  });

  it("strips the clause entirely when removing the last resource", () => {
    const list: FilterClause[] = [{ kind: "resourceAt", activity: "intake", resources: ["alice"] }];
    const result = toggleResourceAt(list, "intake", "alice");
    expect(result).toEqual([]);
  });

  it("creates a new clause for a different activity, leaving the existing one alone", () => {
    const list: FilterClause[] = [{ kind: "resourceAt", activity: "intake", resources: ["alice"] }];
    const result = toggleResourceAt(list, "review", "bob");
    expect(result).toEqual([
      { kind: "resourceAt", activity: "intake", resources: ["alice"] },
      { kind: "resourceAt", activity: "review", resources: ["bob"] },
    ]);
  });

  it("preserves non-resourceAt clauses unchanged", () => {
    const list: FilterClause[] = [
      { kind: "branch", edge: ["a", "b"] },
      { kind: "resourceAt", activity: "intake", resources: ["alice"] },
    ];
    const result = toggleResourceAt(list, "intake", "alice");
    expect(result).toEqual([{ kind: "branch", edge: ["a", "b"] }]);
  });
});

describe("activeResourcesAt", () => {
  it("returns [] when no clause exists for the activity", () => {
    expect(activeResourcesAt([], "intake")).toEqual([]);
  });

  it("returns a defensive copy of the matching clause's resources", () => {
    const list: FilterClause[] = [
      { kind: "resourceAt", activity: "intake", resources: ["alice", "bob"] },
    ];
    const result = activeResourcesAt(list, "intake");
    expect(result).toEqual(["alice", "bob"]);
    result.push("eve");
    expect(activeResourcesAt(list, "intake")).toEqual(["alice", "bob"]);
  });

  it("returns [] for an activity not in the clause list", () => {
    const list: FilterClause[] = [{ kind: "resourceAt", activity: "intake", resources: ["alice"] }];
    expect(activeResourcesAt(list, "review")).toEqual([]);
  });
});

describe("clausesToCaseIds (n5 fixture)", () => {
  it("returns null when the clause list is empty", () => {
    expect(clausesToCaseIds(n5Log, [])).toBeNull();
  });

  it("variant clause keeps only cases on the listed signatures", () => {
    const ids = clausesToCaseIds(n5Log, [{ kind: "variant", sequences: [DIRECT_APPROVAL_SIG] }]);
    expect(ids).not.toBeNull();
    expect([...(ids as Set<string>)].sort()).toEqual(["case_0002", "case_0004"]);
  });

  it("node clause for `request_additional_info` keeps the rework case only", () => {
    const ids = clausesToCaseIds(n5Log, [{ kind: "node", activity: "request_additional_info" }]);
    expect([...(ids as Set<string>)]).toEqual(["case_0005"]);
  });

  it("branch clause for `intake_validation → rejected` keeps the early-rejection case only", () => {
    const ids = clausesToCaseIds(n5Log, [
      { kind: "branch", edge: ["intake_validation", "rejected"] },
    ]);
    expect([...(ids as Set<string>)]).toEqual(["case_0001"]);
  });

  it("branch clause for `health_inspection → approved` keeps three cases", () => {
    const ids = clausesToCaseIds(n5Log, [
      { kind: "branch", edge: ["health_inspection", "approved"] },
    ]);
    expect([...(ids as Set<string>)].sort()).toEqual(["case_0002", "case_0004", "case_0005"]);
  });

  it("composite branch + node intersects to the rework case only", () => {
    // health_inspection → approved: 0002, 0004, 0005
    // node request_additional_info: 0005 only
    // intersection:                  0005
    const ids = clausesToCaseIds(n5Log, [
      { kind: "branch", edge: ["health_inspection", "approved"] },
      { kind: "node", activity: "request_additional_info" },
    ]);
    expect([...(ids as Set<string>)]).toEqual(["case_0005"]);
  });

  it("composite with a never-traversed branch yields an empty set", () => {
    // submitted → approved is not adjacent in any case.
    const ids = clausesToCaseIds(n5Log, [
      { kind: "branch", edge: ["submitted", "approved"] },
      { kind: "node", activity: "review_in_progress" },
    ]);
    expect((ids as Set<string>).size).toBe(0);
  });

  it("resourceAt clause keeps cases with a matching (activity, resource) event", () => {
    // n5 intake_validation: clerk_002 in 0001/0002/0004/0005; clerk_003 in 0003.
    const ids = clausesToCaseIds(n5Log, [
      { kind: "resourceAt", activity: "intake_validation", resources: ["clerk_002"] },
    ]);
    expect([...(ids as Set<string>)].sort()).toEqual([
      "case_0001",
      "case_0002",
      "case_0004",
      "case_0005",
    ]);
  });

  it("resourceAt clause is OR within the resources array", () => {
    // intake_validation across n5: clerk_002 OR clerk_003 covers all 5 cases.
    const ids = clausesToCaseIds(n5Log, [
      {
        kind: "resourceAt",
        activity: "intake_validation",
        resources: ["clerk_002", "clerk_003"],
      },
    ]);
    expect((ids as Set<string>).size).toBe(5);
  });

  it("resourceAt clause keys on activity — same resource, different activity → different result", () => {
    // clerk_002 handles intake_validation in 4 cases but never review_in_progress.
    const ids = clausesToCaseIds(n5Log, [
      { kind: "resourceAt", activity: "review_in_progress", resources: ["clerk_002"] },
    ]);
    expect((ids as Set<string>).size).toBe(0);
  });

  it("resourceAt with the (unassigned) sentinel matches events whose resource is null", () => {
    // Every n5 case has a null-resource `submitted` event → all 5 survive.
    const ids = clausesToCaseIds(n5Log, [
      { kind: "resourceAt", activity: "submitted", resources: ["(unassigned)"] },
    ]);
    expect((ids as Set<string>).size).toBe(5);
  });

  it("resourceAt with empty resources array matches no case", () => {
    const ids = clausesToCaseIds(n5Log, [
      { kind: "resourceAt", activity: "intake_validation", resources: [] },
    ]);
    expect((ids as Set<string>).size).toBe(0);
  });

  it("two resourceAt clauses on different activities AND together", () => {
    // intake_validation by clerk_002 → cases 0001, 0002, 0004, 0005.
    // review_in_progress by reviewer_004 → cases 0004, 0005.
    // Intersection: 0004, 0005.
    const ids = clausesToCaseIds(n5Log, [
      { kind: "resourceAt", activity: "intake_validation", resources: ["clerk_002"] },
      { kind: "resourceAt", activity: "review_in_progress", resources: ["reviewer_004"] },
    ]);
    expect([...(ids as Set<string>)].sort()).toEqual(["case_0004", "case_0005"]);
  });
});

describe("clauseEquals — attribute clause", () => {
  it("returns true on same attribute + same values (set-equality)", () => {
    expect(
      clauseEquals(
        { kind: "attribute", attribute: "case:priority", values: ["high", "low"] },
        { kind: "attribute", attribute: "case:priority", values: ["low", "high"] },
      ),
    ).toBe(true);
  });

  it("returns false on different attribute", () => {
    expect(
      clauseEquals(
        { kind: "attribute", attribute: "case:priority", values: ["high"] },
        { kind: "attribute", attribute: "case:applicant_type", values: ["high"] },
      ),
    ).toBe(false);
  });

  it("returns false on different values", () => {
    expect(
      clauseEquals(
        { kind: "attribute", attribute: "case:priority", values: ["high"] },
        { kind: "attribute", attribute: "case:priority", values: ["low"] },
      ),
    ).toBe(false);
  });

  it("returns false on different value counts", () => {
    expect(
      clauseEquals(
        { kind: "attribute", attribute: "case:priority", values: ["high"] },
        { kind: "attribute", attribute: "case:priority", values: ["high", "low"] },
      ),
    ).toBe(false);
  });

  it("treats numeric and string values as distinct (no type coercion in set membership)", () => {
    expect(
      clauseEquals(
        { kind: "attribute", attribute: "case:score", values: [1] },
        { kind: "attribute", attribute: "case:score", values: ["1"] },
      ),
    ).toBe(false);
  });

  it("treats the (unset) sentinel as just another string value", () => {
    expect(
      clauseEquals(
        { kind: "attribute", attribute: "case:priority", values: ["(unset)"] },
        { kind: "attribute", attribute: "case:priority", values: ["(unset)"] },
      ),
    ).toBe(true);
  });
});

describe("caseIdsForClause — attribute clause (n5 fixture, has case:priority + case:applicant_type)", () => {
  it("priority=high keeps only case_0005 (the lone high-priority case in n5)", () => {
    const ids = clausesToCaseIds(n5Log, [
      { kind: "attribute", attribute: "case:priority", values: ["high"] },
    ]);
    expect([...(ids as Set<string>)]).toEqual(["case_0005"]);
  });

  it("priority=normal keeps the other 4 cases", () => {
    const ids = clausesToCaseIds(n5Log, [
      { kind: "attribute", attribute: "case:priority", values: ["normal"] },
    ]);
    expect([...(ids as Set<string>)].sort()).toEqual([
      "case_0001",
      "case_0002",
      "case_0003",
      "case_0004",
    ]);
  });

  it("priority=high OR normal keeps all 5 (OR within clause)", () => {
    const ids = clausesToCaseIds(n5Log, [
      { kind: "attribute", attribute: "case:priority", values: ["high", "normal"] },
    ]);
    expect((ids as Set<string>).size).toBe(5);
  });

  it("priority=does_not_exist keeps nothing", () => {
    const ids = clausesToCaseIds(n5Log, [
      { kind: "attribute", attribute: "case:priority", values: ["nonexistent"] },
    ]);
    expect((ids as Set<string>).size).toBe(0);
  });

  it("priority + applicant_type AND across clauses", () => {
    // applicant_type=new_business in n5 → cases 0001, 0002, 0004.
    // priority=normal → cases 0001, 0002, 0003, 0004.
    // intersection → cases 0001, 0002, 0004.
    const ids = clausesToCaseIds(n5Log, [
      { kind: "attribute", attribute: "case:applicant_type", values: ["new_business"] },
      { kind: "attribute", attribute: "case:priority", values: ["normal"] },
    ]);
    expect([...(ids as Set<string>)].sort()).toEqual(["case_0001", "case_0002", "case_0004"]);
  });

  it("empty values array matches nothing", () => {
    const ids = clausesToCaseIds(n5Log, [
      { kind: "attribute", attribute: "case:priority", values: [] },
    ]);
    expect((ids as Set<string>).size).toBe(0);
  });

  it("attribute clause for non-existent attribute matches nothing", () => {
    const ids = clausesToCaseIds(n5Log, [
      { kind: "attribute", attribute: "case:does_not_exist", values: ["whatever"] },
    ]);
    expect((ids as Set<string>).size).toBe(0);
  });

  it("(unset) sentinel matches cases whose attribute is null/undefined", () => {
    // Synthesise a tiny log with one case having priority=null (undefined attribute).
    const baseCase = n5Log.cases.get("case_0001");
    if (!baseCase) throw new Error("fixture invariant violated");
    const syntheticCase = {
      id: "case_synth",
      events: baseCase.events.map((e) => ({ ...e, caseId: "case_synth" })),
      attributes: {},
    };
    const synthLog = {
      cases: new Map([
        ["case_0002", n5Log.cases.get("case_0002") as Case],
        ["case_synth", syntheticCase],
      ]),
      events: [...(n5Log.cases.get("case_0002")?.events ?? []), ...syntheticCase.events],
      schema: n5Log.schema,
    };
    const ids = clausesToCaseIds(synthLog as EventLog, [
      { kind: "attribute", attribute: "case:priority", values: ["(unset)"] },
    ]);
    expect([...(ids as Set<string>)]).toEqual(["case_synth"]);
  });

  it("null literal in values also matches null (defensive)", () => {
    const baseCase = n5Log.cases.get("case_0001");
    if (!baseCase) throw new Error("fixture invariant violated");
    const syntheticCase = {
      id: "case_synth",
      events: baseCase.events.map((e) => ({ ...e, caseId: "case_synth" })),
      attributes: {},
    };
    const synthLog = {
      cases: new Map([
        ["case_0002", n5Log.cases.get("case_0002") as Case],
        ["case_synth", syntheticCase],
      ]),
      events: [...(n5Log.cases.get("case_0002")?.events ?? []), ...syntheticCase.events],
      schema: n5Log.schema,
    };
    const ids = clausesToCaseIds(synthLog as EventLog, [
      { kind: "attribute", attribute: "case:priority", values: [null] },
    ]);
    expect([...(ids as Set<string>)]).toEqual(["case_synth"]);
  });
});

describe("clauseEquals — date clause", () => {
  it("returns true on same from/to/anchor", () => {
    expect(
      clauseEquals(
        { kind: "date", from: "2026-03-01", to: "2026-03-31", anchor: "started" },
        { kind: "date", from: "2026-03-01", to: "2026-03-31", anchor: "started" },
      ),
    ).toBe(true);
  });

  it("returns false on different anchor", () => {
    expect(
      clauseEquals(
        { kind: "date", from: "2026-03-01", to: "2026-03-31", anchor: "started" },
        { kind: "date", from: "2026-03-01", to: "2026-03-31", anchor: "ended" },
      ),
    ).toBe(false);
  });

  it("returns false on different from", () => {
    expect(
      clauseEquals(
        { kind: "date", from: "2026-03-01", to: "2026-03-31", anchor: "started" },
        { kind: "date", from: "2026-02-01", to: "2026-03-31", anchor: "started" },
      ),
    ).toBe(false);
  });

  it("returns false on different to", () => {
    expect(
      clauseEquals(
        { kind: "date", from: "2026-03-01", to: "2026-03-31", anchor: "started" },
        { kind: "date", from: "2026-03-01", to: "2026-04-30", anchor: "started" },
      ),
    ).toBe(false);
  });

  it("treats null bounds as equal to other nulls", () => {
    expect(
      clauseEquals(
        { kind: "date", from: null, to: "2026-03-31", anchor: "started" },
        { kind: "date", from: null, to: "2026-03-31", anchor: "started" },
      ),
    ).toBe(true);
    expect(
      clauseEquals(
        { kind: "date", from: null, to: null, anchor: "started" },
        { kind: "date", from: null, to: null, anchor: "started" },
      ),
    ).toBe(true);
  });

  it("returns false when one bound is null and the other isn't", () => {
    expect(
      clauseEquals(
        { kind: "date", from: null, to: "2026-03-31", anchor: "started" },
        { kind: "date", from: "2026-03-01", to: "2026-03-31", anchor: "started" },
      ),
    ).toBe(false);
  });

  it("returns false vs. other kinds", () => {
    expect(
      clauseEquals(
        { kind: "date", from: null, to: null, anchor: "started" },
        { kind: "node", activity: "approved" },
      ),
    ).toBe(false);
  });
});

describe("replaceClause — date clause", () => {
  it("strips an existing date clause when payload is null", () => {
    const list: FilterClause[] = [
      { kind: "date", from: "2026-03-01", to: "2026-03-31", anchor: "started" },
      { kind: "branch", edge: ["x", "y"] },
    ];
    const result = replaceClause(list, "date", null);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ kind: "branch", edge: ["x", "y"] });
  });

  it("replaces an existing date clause with new payload", () => {
    const list: FilterClause[] = [
      { kind: "date", from: "2026-03-01", to: "2026-03-31", anchor: "started" },
    ];
    const result = replaceClause(list, "date", {
      from: "2026-04-01",
      to: "2026-04-30",
      anchor: "ended",
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      kind: "date",
      from: "2026-04-01",
      to: "2026-04-30",
      anchor: "ended",
    });
  });

  it("appends a date clause when none exists and payload is non-null", () => {
    const list: FilterClause[] = [{ kind: "branch", edge: ["x", "y"] }];
    const result = replaceClause(list, "date", {
      from: null,
      to: "2026-03-31",
      anchor: "ended",
    });
    expect(result).toHaveLength(2);
    expect(result.find((c) => c.kind === "date")).toEqual({
      kind: "date",
      from: null,
      to: "2026-03-31",
      anchor: "ended",
    });
  });

  it("only strips date clauses (variant clauses untouched by date strip)", () => {
    const list: FilterClause[] = [
      { kind: "date", from: "2026-03-01", to: null, anchor: "started" },
      { kind: "variant", sequences: ["sigA"] },
    ];
    const result = replaceClause(list, "date", null);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ kind: "variant", sequences: ["sigA"] });
  });
});

describe("caseIdsForClause — date clause", () => {
  // Synthetic mini-log: three cases with well-known event timestamps
  // so the anchor predicates can be verified exactly.
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

  const earlyCase = mkCase("early", ["2026-01-15T10:00:00", "2026-01-20T10:00:00"]);
  const midCase = mkCase("mid", ["2026-03-10T10:00:00", "2026-03-25T10:00:00"]);
  const spanCase = mkCase("span", ["2026-02-20T10:00:00", "2026-04-10T10:00:00"]);

  const synthLog: EventLog = {
    cases: new Map([
      ["early", earlyCase],
      ["mid", midCase],
      ["span", spanCase],
    ]),
    events: [...earlyCase.events, ...midCase.events, ...spanCase.events],
    schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
  };

  it("started: keeps cases whose first event is in [from, to]", () => {
    const ids = clausesToCaseIds(synthLog, [
      { kind: "date", from: "2026-03-01", to: "2026-03-31", anchor: "started" },
    ]);
    expect([...(ids as Set<string>)]).toEqual(["mid"]);
  });

  it("ended: keeps cases whose last event is in [from, to]", () => {
    const ids = clausesToCaseIds(synthLog, [
      { kind: "date", from: "2026-03-01", to: "2026-03-31", anchor: "ended" },
    ]);
    expect([...(ids as Set<string>)]).toEqual(["mid"]);
  });

  it("open lower bound (from: null) acts as -Infinity", () => {
    const ids = clausesToCaseIds(synthLog, [
      { kind: "date", from: null, to: "2026-02-01", anchor: "started" },
    ]);
    expect([...(ids as Set<string>)]).toEqual(["early"]);
  });

  it("open upper bound (to: null) acts as +Infinity", () => {
    const ids = clausesToCaseIds(synthLog, [
      { kind: "date", from: "2026-03-01", to: null, anchor: "started" },
    ]);
    expect([...(ids as Set<string>)]).toEqual(["mid"]);
  });

  it("both bounds null keeps all cases (effectively no filter on the date axis)", () => {
    const ids = clausesToCaseIds(synthLog, [
      { kind: "date", from: null, to: null, anchor: "started" },
    ]);
    expect((ids as Set<string>).size).toBe(3);
  });

  it("defensive auto-swap: from > to silently flips so the matcher still works", () => {
    // The section auto-swaps before push, but the matcher must also defend
    // against a stale inverted clause from a programmatic setFilters call.
    const ids = clausesToCaseIds(synthLog, [
      { kind: "date", from: "2026-03-31", to: "2026-03-01", anchor: "started" },
    ]);
    expect([...(ids as Set<string>)]).toEqual(["mid"]);
  });
});

describe("buildFilteredLogFromClauses", () => {
  it("returns the input log reference when no clauses are active", () => {
    const result = buildFilteredLogFromClauses(n5Log, []);
    expect(result).toBe(n5Log);
  });

  it("filters cases + events together when a node clause is active", () => {
    const result = buildFilteredLogFromClauses(n5Log, [
      { kind: "node", activity: "request_additional_info" },
    ]);
    expect(result.cases.size).toBe(1);
    expect(result.cases.has("case_0005")).toBe(true);
    // Every event in the filtered log belongs to a surviving case.
    for (const ev of result.events) {
      expect(result.cases.has(ev.caseId)).toBe(true);
    }
  });

  it("preserves the schema reference", () => {
    const result = buildFilteredLogFromClauses(n5Log, [{ kind: "node", activity: "rejected" }]);
    expect(result.schema).toBe(n5Log.schema);
  });

  it("can produce an empty log when intersection is empty", () => {
    const result = buildFilteredLogFromClauses(n5Log, [
      { kind: "branch", edge: ["submitted", "approved"] },
    ]);
    expect(result.cases.size).toBe(0);
    expect(result.events).toHaveLength(0);
  });
});

describe("clauseEquals — caseId clause", () => {
  it("returns true on same single-ID payload", () => {
    expect(
      clauseEquals(
        { kind: "caseId", caseIds: ["case_0042"] },
        { kind: "caseId", caseIds: ["case_0042"] },
      ),
    ).toBe(true);
  });

  it("compares caseIds as a set (order-independent)", () => {
    expect(
      clauseEquals(
        { kind: "caseId", caseIds: ["case_0001", "case_0002"] },
        { kind: "caseId", caseIds: ["case_0002", "case_0001"] },
      ),
    ).toBe(true);
  });

  it("returns false on different IDs", () => {
    expect(
      clauseEquals(
        { kind: "caseId", caseIds: ["case_0001"] },
        { kind: "caseId", caseIds: ["case_0002"] },
      ),
    ).toBe(false);
  });

  it("returns false on different ID counts", () => {
    expect(
      clauseEquals(
        { kind: "caseId", caseIds: ["case_0001"] },
        { kind: "caseId", caseIds: ["case_0001", "case_0002"] },
      ),
    ).toBe(false);
  });

  it("returns false when other clause kind has the same shape", () => {
    expect(
      clauseEquals(
        { kind: "caseId", caseIds: ["case_0001"] },
        { kind: "node", activity: "case_0001" },
      ),
    ).toBe(false);
  });
});

describe("replaceClause — caseId", () => {
  it("strips an existing caseId clause when payload === null", () => {
    const before: FilterClause[] = [
      { kind: "caseId", caseIds: ["case_0001"] },
      { kind: "node", activity: "review" },
    ];
    const after = replaceClause(before, "caseId", null);
    expect(after).toHaveLength(1);
    expect(after[0]).toEqual({ kind: "node", activity: "review" });
  });

  it("replaces an existing caseId clause with new IDs", () => {
    const before: FilterClause[] = [{ kind: "caseId", caseIds: ["case_0001"] }];
    const after = replaceClause(before, "caseId", { caseIds: ["case_0002", "case_0003"] });
    expect(after).toHaveLength(1);
    expect(after[0]).toEqual({ kind: "caseId", caseIds: ["case_0002", "case_0003"] });
  });

  it("appends a caseId clause when none exists and payload is non-null", () => {
    const before: FilterClause[] = [{ kind: "node", activity: "review" }];
    const after = replaceClause(before, "caseId", { caseIds: ["case_0001"] });
    expect(after).toHaveLength(2);
    expect(after[1]).toEqual({ kind: "caseId", caseIds: ["case_0001"] });
  });

  it("copies the caseIds array (mutation does not leak)", () => {
    const ids = ["case_0001"];
    const after = replaceClause([], "caseId", { caseIds: ids });
    ids.push("case_0002");
    const stored = (after[0] as Extract<FilterClause, { kind: "caseId" }>).caseIds;
    expect(stored).toEqual(["case_0001"]);
  });

  it("preserves other clause kinds (variant, date) when stripping caseId", () => {
    const before: FilterClause[] = [
      { kind: "variant", sequences: ["sigA"] },
      { kind: "caseId", caseIds: ["case_0001"] },
      { kind: "date", from: "2026-01-01", to: null, anchor: "started" },
    ];
    const after = replaceClause(before, "caseId", null);
    expect(after).toEqual([
      { kind: "variant", sequences: ["sigA"] },
      { kind: "date", from: "2026-01-01", to: null, anchor: "started" },
    ]);
  });
});

describe("caseIdsForClause — caseId clause (n5 fixture)", () => {
  it("single-ID clause matches that one case", () => {
    const result = clausesToCaseIds(n5Log, [{ kind: "caseId", caseIds: ["case_0003"] }]);
    expect(result).toEqual(new Set(["case_0003"]));
  });

  it("multi-ID clause OR's within (keeps all listed IDs)", () => {
    const result = clausesToCaseIds(n5Log, [
      { kind: "caseId", caseIds: ["case_0001", "case_0003", "case_0005"] },
    ]);
    expect(result).toEqual(new Set(["case_0001", "case_0003", "case_0005"]));
  });

  it("ID not in the log produces an empty set", () => {
    const result = clausesToCaseIds(n5Log, [{ kind: "caseId", caseIds: ["case_99999"] }]);
    expect(result).toEqual(new Set());
  });

  it("partial overlap: only existing IDs survive", () => {
    const result = clausesToCaseIds(n5Log, [
      { kind: "caseId", caseIds: ["case_0001", "case_99999"] },
    ]);
    expect(result).toEqual(new Set(["case_0001"]));
  });

  it("empty caseIds array matches nothing", () => {
    const result = clausesToCaseIds(n5Log, [{ kind: "caseId", caseIds: [] }]);
    expect(result).toEqual(new Set());
  });

  it("ANDs across with other clause kinds (caseId + node)", () => {
    // case_0005 is the rework case in n5 (has request_additional_info).
    // case_0001 doesn't. Intersection of {1,5} with the rework set = {5}.
    const result = clausesToCaseIds(n5Log, [
      { kind: "caseId", caseIds: ["case_0001", "case_0005"] },
      { kind: "node", activity: "request_additional_info" },
    ]);
    expect(result).toEqual(new Set(["case_0005"]));
  });
});

describe("cloneClause", () => {
  it("deep-copies a variant clause's sequences array (no shared reference)", () => {
    const original: FilterClause = { kind: "variant", sequences: ["sigA", "sigB"] };
    const clone = cloneClause(original);
    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    const cloneSeqs = (clone as Extract<FilterClause, { kind: "variant" }>).sequences;
    const origSeqs = (original as Extract<FilterClause, { kind: "variant" }>).sequences;
    expect(cloneSeqs).not.toBe(origSeqs);
    cloneSeqs.push("sigC");
    expect(origSeqs).toEqual(["sigA", "sigB"]);
  });

  it("deep-copies a branch clause's edge tuple", () => {
    const original: FilterClause = { kind: "branch", edge: ["a", "b"] };
    const clone = cloneClause(original);
    expect(clone).toEqual(original);
    const cloneEdge = (clone as Extract<FilterClause, { kind: "branch" }>).edge;
    const origEdge = (original as Extract<FilterClause, { kind: "branch" }>).edge;
    expect(cloneEdge).not.toBe(origEdge);
  });

  it("copies a node clause (activity carried through)", () => {
    const original: FilterClause = { kind: "node", activity: "intake_validation" };
    const clone = cloneClause(original);
    expect(clone).toEqual({ kind: "node", activity: "intake_validation" });
  });

  it("deep-copies a resourceAt clause's resources array", () => {
    const original: FilterClause = {
      kind: "resourceAt",
      activity: "intake",
      resources: ["alice", "bob"],
    };
    const clone = cloneClause(original);
    expect(clone).toEqual(original);
    const cloneRes = (clone as Extract<FilterClause, { kind: "resourceAt" }>).resources;
    const origRes = (original as Extract<FilterClause, { kind: "resourceAt" }>).resources;
    expect(cloneRes).not.toBe(origRes);
    cloneRes.push("carol");
    expect(origRes).toEqual(["alice", "bob"]);
  });

  it("deep-copies an attribute clause's values array", () => {
    const original: FilterClause = {
      kind: "attribute",
      attribute: "case:priority",
      values: ["high", null],
    };
    const clone = cloneClause(original);
    expect(clone).toEqual(original);
    const cloneVals = (clone as Extract<FilterClause, { kind: "attribute" }>).values;
    const origVals = (original as Extract<FilterClause, { kind: "attribute" }>).values;
    expect(cloneVals).not.toBe(origVals);
  });

  it("copies a date clause (from/to/anchor carried through)", () => {
    const original: FilterClause = {
      kind: "date",
      from: "2026-03-01",
      to: null,
      anchor: "ended",
    };
    const clone = cloneClause(original);
    expect(clone).toEqual({ kind: "date", from: "2026-03-01", to: null, anchor: "ended" });
    expect(clone).not.toBe(original);
  });

  it("deep-copies a caseId clause's caseIds array", () => {
    const original: FilterClause = { kind: "caseId", caseIds: ["case_0001", "case_0002"] };
    const clone = cloneClause(original);
    expect(clone).toEqual(original);
    const cloneIds = (clone as Extract<FilterClause, { kind: "caseId" }>).caseIds;
    const origIds = (original as Extract<FilterClause, { kind: "caseId" }>).caseIds;
    expect(cloneIds).not.toBe(origIds);
    cloneIds.push("case_0003");
    expect(origIds).toEqual(["case_0001", "case_0002"]);
  });
});

describe("validateFilterClauses", () => {
  it("accepts a well-formed clause array without throwing", () => {
    expect(() =>
      validateFilterClauses([
        { kind: "variant", sequences: ["sigA"] },
        { kind: "branch", edge: ["a", "b"] },
        { kind: "node", activity: "intake" },
        { kind: "resourceAt", activity: "intake", resources: ["alice"] },
        { kind: "attribute", attribute: "case:priority", values: ["high", 1, true, null] },
        { kind: "date", from: null, to: "2026-03-31", anchor: "started" },
        { kind: "caseId", caseIds: ["case_0001"] },
      ]),
    ).not.toThrow();
  });

  it("throws when the value is not an array", () => {
    expect(() => validateFilterClauses({ kind: "node", activity: "x" })).toThrow(TypeError);
    expect(() => validateFilterClauses({ kind: "node", activity: "x" })).toThrow(
      "clauses must be an array",
    );
  });

  it("throws when a clause is null", () => {
    expect(() => validateFilterClauses([null])).toThrow(
      "every clause must be a FilterClause object",
    );
  });

  it("throws when a clause is a primitive (not an object)", () => {
    expect(() => validateFilterClauses(["not-a-clause"])).toThrow(
      "every clause must be a FilterClause object",
    );
  });

  it("throws when a variant clause's sequences is not a string array", () => {
    expect(() => validateFilterClauses([{ kind: "variant", sequences: [1, 2] }])).toThrow(
      "variant clause requires sequences: string[]",
    );
  });

  it("throws when a branch clause's edge is not a two-string tuple", () => {
    expect(() => validateFilterClauses([{ kind: "branch", edge: ["a"] }])).toThrow(
      "branch clause requires edge: [string, string]",
    );
  });

  it("throws when a node clause's activity is not a string", () => {
    expect(() => validateFilterClauses([{ kind: "node", activity: 42 }])).toThrow(
      "node clause requires activity: string",
    );
  });

  it("throws when a resourceAt clause's activity is not a string", () => {
    expect(() =>
      validateFilterClauses([{ kind: "resourceAt", activity: 7, resources: ["alice"] }]),
    ).toThrow("resourceAt clause requires activity: string");
  });

  it("throws when a resourceAt clause's resources is not a string array", () => {
    expect(() =>
      validateFilterClauses([{ kind: "resourceAt", activity: "intake", resources: [42] }]),
    ).toThrow("resourceAt clause requires resources: string[]");
  });

  it("throws when an attribute clause's attribute is not a string", () => {
    expect(() =>
      validateFilterClauses([{ kind: "attribute", attribute: 9, values: ["high"] }]),
    ).toThrow("attribute clause requires attribute: string");
  });

  it("throws when an attribute clause's values contain a non-AttributeValue", () => {
    expect(() =>
      validateFilterClauses([{ kind: "attribute", attribute: "case:priority", values: [{}] }]),
    ).toThrow("attribute clause requires values: AttributeValue[]");
  });

  it("throws when a date clause's from is neither null nor string", () => {
    expect(() =>
      validateFilterClauses([{ kind: "date", from: 123, to: null, anchor: "started" }]),
    ).toThrow("date clause requires from: string | null");
  });

  it("throws when a date clause's to is neither null nor string", () => {
    expect(() =>
      validateFilterClauses([{ kind: "date", from: null, to: 456, anchor: "started" }]),
    ).toThrow("date clause requires to: string | null");
  });

  it("throws when a date clause's anchor is not a valid DateAnchor", () => {
    expect(() =>
      validateFilterClauses([{ kind: "date", from: null, to: null, anchor: "midpoint" }]),
    ).toThrow("date clause requires anchor: DateAnchor");
  });

  it("throws when a caseId clause's caseIds is not a non-empty string array", () => {
    expect(() => validateFilterClauses([{ kind: "caseId", caseIds: [""] }])).toThrow(
      "caseId clause requires caseIds: non-empty string[]",
    );
  });

  it("throws on an unknown clause kind", () => {
    expect(() => validateFilterClauses([{ kind: "frequency" }])).toThrow(
      "unknown clause kind frequency",
    );
  });
});

describe("caseIdsForClause — resourceAt null-resource skip", () => {
  it("skips a null-resource event at the target activity when (unassigned) is not requested, then matches a later named-resource event", () => {
    // The target activity occurs twice in one case: first with resource=null,
    // then with resource=alice. The clause asks for ["alice"] only (no
    // (unassigned) sentinel), so the null event must be skipped — NOT abort
    // the per-case scan — and the later alice event must still match.
    const mixedCase: Case = {
      id: "mixed",
      events: [
        {
          caseId: "mixed",
          activity: "handoff",
          timestamp: new Date("2026-01-01T09:00:00"),
          resource: null,
          lifecycle: "complete",
          attributes: {},
        },
        {
          caseId: "mixed",
          activity: "handoff",
          timestamp: new Date("2026-01-02T09:00:00"),
          resource: "alice",
          lifecycle: "complete",
          attributes: {},
        },
      ],
      attributes: {},
    };
    // A second case whose only `handoff` event is null-resource: with the
    // (unassigned) sentinel absent it must be excluded entirely.
    const nullOnlyCase: Case = {
      id: "nullOnly",
      events: [
        {
          caseId: "nullOnly",
          activity: "handoff",
          timestamp: new Date("2026-01-01T09:00:00"),
          resource: null,
          lifecycle: "complete",
          attributes: {},
        },
      ],
      attributes: {},
    };
    const synthLog: EventLog = {
      cases: new Map([
        ["mixed", mixedCase],
        ["nullOnly", nullOnlyCase],
      ]),
      events: [...mixedCase.events, ...nullOnlyCase.events],
      schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
    };
    const ids = clausesToCaseIds(synthLog, [
      { kind: "resourceAt", activity: "handoff", resources: ["alice"] },
    ]);
    expect(ids).toEqual(new Set(["mixed"]));
  });
});
