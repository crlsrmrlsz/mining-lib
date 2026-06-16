import { describe, expect, it } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import {
  bucketCasesByAnchor,
  bucketEventVolume,
  caseInDateRange,
  formatDateChipLabel,
  formatHistogramBucketTooltip,
  logDateRange,
  parseDateBound,
} from "./dateFilter.js";
import { parseCsv } from "./parseCsv.js";
import type { Case, EventLog } from "./types.js";

const { log: n5Log } = parseCsv(n5Csv);

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

describe("logDateRange", () => {
  it("returns null for an empty log", () => {
    const empty: EventLog = {
      cases: new Map(),
      events: [],
      schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
    };
    expect(logDateRange(empty)).toBeNull();
  });

  it("returns { min, max } for a single-event log", () => {
    const log = mkLog([mkCase("c1", ["2026-03-15T10:00:00"])]);
    const range = logDateRange(log);
    expect(range).not.toBeNull();
    expect(range?.min.getTime()).toBe(new Date("2026-03-15T10:00:00").getTime());
    expect(range?.max.getTime()).toBe(new Date("2026-03-15T10:00:00").getTime());
  });

  it("returns earliest and latest timestamps across all events", () => {
    const log = mkLog([
      mkCase("c1", ["2026-01-15T10:00:00", "2026-04-20T15:00:00"]),
      mkCase("c2", ["2026-02-10T08:30:00", "2026-03-05T18:00:00"]),
    ]);
    const range = logDateRange(log);
    expect(range?.min.getTime()).toBe(new Date("2026-01-15T10:00:00").getTime());
    expect(range?.max.getTime()).toBe(new Date("2026-04-20T15:00:00").getTime());
  });

  it("works on the n5 fixture (January–February 2024)", () => {
    const range = logDateRange(n5Log);
    expect(range).not.toBeNull();
    expect(range?.min.getUTCFullYear()).toBe(2024);
    expect(range?.max.getUTCFullYear()).toBe(2024);
    expect(range?.min.getTime()).toBeLessThan(range?.max.getTime() as number);
  });
});

describe("parseDateBound", () => {
  it("null `from` → -Infinity", () => {
    expect(parseDateBound(null, "from")).toBe(Number.NEGATIVE_INFINITY);
  });

  it("null `to` → +Infinity", () => {
    expect(parseDateBound(null, "to")).toBe(Number.POSITIVE_INFINITY);
  });

  it("ISO date `from` parses as local midnight (00:00:00 in current TZ)", () => {
    // The bound for "2026-03-01 from" should equal the ms of Mar 1 00:00:00
    // local. We compare against an independently-constructed Date with the
    // same year/month/day at midnight local time.
    const expected = new Date(2026, 2, 1, 0, 0, 0, 0).getTime(); // month is 0-indexed
    expect(parseDateBound("2026-03-01", "from")).toBe(expected);
  });

  it("ISO date `to` parses as local end-of-day (23:59:59.999 in current TZ)", () => {
    const expected = new Date(2026, 2, 31, 23, 59, 59, 999).getTime();
    expect(parseDateBound("2026-03-31", "to")).toBe(expected);
  });

  it("`from` boundary is < same-day `to` boundary by the expected ms count", () => {
    // 23 h 59 min 59 s 999 ms = 86_399_999 ms
    expect(parseDateBound("2026-06-15", "to") - parseDateBound("2026-06-15", "from")).toBe(
      86_399_999,
    );
  });
});

describe("caseInDateRange", () => {
  const earlyCase = mkCase("early", ["2026-01-15T10:00:00", "2026-01-20T10:00:00"]);
  const midCase = mkCase("mid", ["2026-03-10T10:00:00", "2026-03-25T10:00:00"]);
  const spanCase = mkCase("span", ["2026-02-20T10:00:00", "2026-04-10T10:00:00"]);
  const fromMs = parseDateBound("2026-03-01", "from");
  const toMs = parseDateBound("2026-03-31", "to");

  it("started: case keeps when first event is within bounds", () => {
    expect(caseInDateRange(midCase, fromMs, toMs, "started")).toBe(true);
    expect(caseInDateRange(earlyCase, fromMs, toMs, "started")).toBe(false);
    expect(caseInDateRange(spanCase, fromMs, toMs, "started")).toBe(false);
  });

  it("ended: case keeps when last event is within bounds", () => {
    expect(caseInDateRange(midCase, fromMs, toMs, "ended")).toBe(true);
    expect(caseInDateRange(earlyCase, fromMs, toMs, "ended")).toBe(false);
    expect(caseInDateRange(spanCase, fromMs, toMs, "ended")).toBe(false);
  });

  it("returns false for a case with zero events (defensive)", () => {
    const emptyCase = mkCase("empty", []);
    expect(caseInDateRange(emptyCase, fromMs, toMs, "started")).toBe(false);
    expect(caseInDateRange(emptyCase, fromMs, toMs, "ended")).toBe(false);
  });

  it("open lower bound (-Infinity) accepts every prior date", () => {
    const openFrom = parseDateBound(null, "from");
    expect(caseInDateRange(earlyCase, openFrom, toMs, "started")).toBe(true);
    expect(caseInDateRange(midCase, openFrom, toMs, "started")).toBe(true);
    expect(caseInDateRange(spanCase, openFrom, toMs, "started")).toBe(true);
  });

  it("open upper bound (+Infinity) accepts every later date", () => {
    const openTo = parseDateBound(null, "to");
    expect(caseInDateRange(earlyCase, fromMs, openTo, "started")).toBe(false);
    expect(caseInDateRange(midCase, fromMs, openTo, "started")).toBe(true);
    expect(caseInDateRange(spanCase, fromMs, openTo, "started")).toBe(false);
  });
});

describe("bucketEventVolume", () => {
  it("returns an empty array for an empty log", () => {
    const empty: EventLog = {
      cases: new Map(),
      events: [],
      schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
    };
    expect(bucketEventVolume(empty, 40)).toEqual([]);
  });

  it("returns one bucket of count 1 for a single-event log (degenerate range)", () => {
    const log = mkLog([mkCase("c1", ["2026-03-15T10:00:00"])]);
    const buckets = bucketEventVolume(log, 40);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.count).toBe(1);
    expect(buckets[0]?.x0).toBeLessThanOrEqual(new Date("2026-03-15T10:00:00").getTime());
    expect(buckets[0]?.x1).toBeGreaterThanOrEqual(new Date("2026-03-15T10:00:00").getTime());
  });

  it("returns exactly N buckets across [min, max] for multi-event logs", () => {
    const log = mkLog([
      mkCase("c1", ["2026-01-01T00:00:00", "2026-12-31T23:59:00"]),
      mkCase("c2", ["2026-06-15T12:00:00"]),
    ]);
    const buckets = bucketEventVolume(log, 40);
    expect(buckets).toHaveLength(40);
    expect(buckets[0]?.x0).toBe(new Date("2026-01-01T00:00:00").getTime());
    expect(buckets[39]?.x1).toBe(new Date("2026-12-31T23:59:00").getTime());
  });

  it("each event lands in exactly one bucket; bucket counts sum to event count", () => {
    const log = mkLog([
      mkCase("c1", ["2026-01-01T00:00:00", "2026-03-01T00:00:00", "2026-06-01T00:00:00"]),
      mkCase("c2", ["2026-09-01T00:00:00", "2026-12-31T23:59:00"]),
    ]);
    const buckets = bucketEventVolume(log, 10);
    expect(buckets).toHaveLength(10);
    const total = buckets.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(5);
  });

  it("contiguous buckets — x1 of bucket[i] equals x0 of bucket[i+1]", () => {
    const log = mkLog([mkCase("c1", ["2026-01-01T00:00:00", "2026-06-30T23:59:00"])]);
    const buckets = bucketEventVolume(log, 6);
    for (let i = 0; i < buckets.length - 1; i += 1) {
      expect(buckets[i]?.x1).toBe(buckets[i + 1]?.x0);
    }
  });
});

describe("bucketCasesByAnchor", () => {
  function buildLog(): EventLog {
    return mkLog([
      mkCase("c-jan-start", ["2026-01-05T10:00:00", "2026-01-10T10:00:00"]),
      mkCase("c-feb-start-feb-end", ["2026-02-05T10:00:00", "2026-02-25T10:00:00"]),
      mkCase("c-feb-start-mar-end", ["2026-02-15T10:00:00", "2026-03-15T10:00:00"]),
      mkCase("c-mar-start", ["2026-03-05T10:00:00", "2026-03-20T10:00:00"]),
      mkCase("c-spans-all", ["2026-01-15T10:00:00", "2026-04-15T10:00:00"]),
    ]);
  }

  it("returns empty for empty log", () => {
    const empty: EventLog = {
      cases: new Map(),
      events: [],
      schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
    };
    expect(bucketCasesByAnchor(empty, 4, "started")).toEqual([]);
  });

  it("degenerate single-timestamp log → one bucket counting every case", () => {
    // All events share one instant, so min === max and the equal-width
    // bucketing collapses to a single bucket. Every case sits at that
    // instant, so the bucket count is the full case count for either anchor.
    const log = mkLog([
      mkCase("c1", ["2026-03-15T10:00:00"]),
      mkCase("c2", ["2026-03-15T10:00:00"]),
      mkCase("c3", ["2026-03-15T10:00:00"]),
    ]);
    const instant = new Date("2026-03-15T10:00:00").getTime();
    for (const anchor of ["started", "ended"] as const) {
      const buckets = bucketCasesByAnchor(log, 4, anchor);
      expect(buckets).toHaveLength(1);
      expect(buckets[0]?.x0).toBe(instant);
      expect(buckets[0]?.x1).toBe(instant);
      expect(buckets[0]?.count).toBe(3);
    }
  });

  it("started: counts cases whose first event lands in each bucket", () => {
    // Log spans Jan 5 → Apr 15 (~100 days). With 4 buckets:
    // bucket 0 ≈ Jan 5 – Feb 4   → cases starting Jan 5, Jan 15 → 2
    // bucket 1 ≈ Feb 4 – Mar 6   → cases starting Feb 5, Feb 15 → 2
    // bucket 2 ≈ Mar 6 – Apr 5   → cases starting Mar 5 → 1
    // bucket 3 ≈ Apr 5 – Apr 15  → none (no case starts in April)
    const buckets = bucketCasesByAnchor(buildLog(), 4, "started");
    const totals = buckets.map((b) => b.count);
    expect(totals.reduce((s, n) => s + n, 0)).toBe(5);
    expect(totals).toEqual([2, 2, 1, 0]);
  });

  it("ended: counts cases whose last event lands in each bucket", () => {
    // bucket 0 ≈ Jan 5 – Feb 4   → c-jan-start (ends Jan 10) → 1
    // bucket 1 ≈ Feb 4 – Mar 6   → c-feb-start-feb-end (ends Feb 25) → 1
    // bucket 2 ≈ Mar 6 – Apr 5   → c-feb-start-mar-end (ends Mar 15), c-mar-start (ends Mar 20) → 2
    // bucket 3 ≈ Apr 5 – Apr 15  → c-spans-all (ends Apr 15) → 1
    const buckets = bucketCasesByAnchor(buildLog(), 4, "ended");
    expect(buckets.map((b) => b.count).reduce((s, n) => s + n, 0)).toBe(5);
  });

  it("each bucket count equals what the matcher would keep for that bucket alone", () => {
    // Sanity invariant tying the histogram to the matcher: for either
    // anchor, bucket counts equal the size of the case-set the matcher
    // would produce if filtering to just that bucket.
    const log = buildLog();
    for (const anchor of ["started", "ended"] as const) {
      const buckets = bucketCasesByAnchor(log, 4, anchor);
      for (const b of buckets) {
        let n = 0;
        for (const c of log.cases.values()) {
          if (caseInDateRange(c, b.x0, b.x1, anchor)) n += 1;
        }
        expect(b.count).toBe(n);
      }
    }
  });
});

describe("formatHistogramBucketTooltip", () => {
  // Bucket spanning Mar 1 → Mar 7, 2026.
  const x0 = new Date(2026, 2, 1, 0, 0, 0).getTime();
  const x1 = new Date(2026, 2, 7, 23, 59, 59).getTime();

  it("started anchor reads `N cases started`", () => {
    expect(formatHistogramBucketTooltip(x0, x1, 24, "started")).toBe(
      "Mar 1 – Mar 7, 2026: 24 cases started",
    );
  });

  it("ended anchor reads `N cases ended`", () => {
    expect(formatHistogramBucketTooltip(x0, x1, 31, "ended")).toBe(
      "Mar 1 – Mar 7, 2026: 31 cases ended",
    );
  });

  it("singular form when count is 1", () => {
    expect(formatHistogramBucketTooltip(x0, x1, 1, "started")).toBe(
      "Mar 1 – Mar 7, 2026: 1 case started",
    );
  });

  it("zero count shows `0 cases`", () => {
    expect(formatHistogramBucketTooltip(x0, x1, 0, "started")).toBe(
      "Mar 1 – Mar 7, 2026: 0 cases started",
    );
  });

  it("cross-year bucket shows both years", () => {
    const y0 = new Date(2025, 11, 20, 0, 0, 0).getTime();
    const y1 = new Date(2026, 0, 5, 23, 59, 59).getTime();
    expect(formatHistogramBucketTooltip(y0, y1, 5, "started")).toBe(
      "Dec 20, 2025 – Jan 5, 2026: 5 cases started",
    );
  });
});

describe("formatDateChipLabel", () => {
  it("both null returns empty string (caller skips chip render)", () => {
    expect(formatDateChipLabel(null, null, "started")).toBe("");
    expect(formatDateChipLabel(null, null, "ended")).toBe("");
  });

  it("default anchor + same-year range omits the anchor suffix", () => {
    expect(formatDateChipLabel("2026-03-01", "2026-03-31", "started")).toBe("Mar 1 – Mar 31, 2026");
  });

  it("non-default anchor appends suffix", () => {
    expect(formatDateChipLabel("2026-03-01", "2026-03-31", "ended")).toBe(
      "Mar 1 – Mar 31, 2026 (Ended)",
    );
  });

  it("different-year range shows both years", () => {
    expect(formatDateChipLabel("2025-12-15", "2026-03-31", "started")).toBe(
      "Dec 15, 2025 – Mar 31, 2026",
    );
  });

  it("from-only renders as `After …`", () => {
    expect(formatDateChipLabel("2026-04-01", null, "started")).toBe("After Apr 1, 2026");
    expect(formatDateChipLabel("2026-04-01", null, "ended")).toBe("After Apr 1, 2026 (Ended)");
  });

  it("to-only renders as `Before …`", () => {
    expect(formatDateChipLabel(null, "2026-03-31", "started")).toBe("Before Mar 31, 2026");
    expect(formatDateChipLabel(null, "2026-03-31", "ended")).toBe("Before Mar 31, 2026 (Ended)");
  });
});
