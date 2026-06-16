import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { parseCsv } from "./parseCsv.js";
import { parseNdjson } from "./parseNdjson.js";

// The parsers are the library's untrusted-input boundary. Their contract is
// "lenient body, strict skeleton": with a valid header/first-line present, ANY
// body content must warn+skip rather than throw, and well-formed input must
// round-trip its counts. Property-based fuzzing is the highest-ROI way to pin
// that invariant against generative garbage.
const HEADER = "case:concept:name,concept:name,time:timestamp,lifecycle:transition,org:resource";
const VALID_NDJSON_LINE =
  '{"case:concept:name":"c1","concept:name":"a","time:timestamp":"2025-01-01T00:00:00","lifecycle:transition":"complete","org:resource":null}';

describe("parser fuzzing — never throws on header-present garbage", () => {
  test("parseCsv: valid header + arbitrary body rows never throws", () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 30 }), (rows) => {
        const { log, warnings } = parseCsv(`${HEADER}\n${rows.join("\n")}`);
        expect(Array.isArray(warnings)).toBe(true);
        expect(log.events.length).toBeGreaterThanOrEqual(0);
        // every surviving event has the three skeleton fields populated
        for (const ev of log.events) {
          expect(ev.activity.length).toBeGreaterThan(0);
          expect(ev.timestamp instanceof Date).toBe(true);
        }
      }),
    );
  });

  test("parseNdjson: valid first line + arbitrary interleaved garbage lines never throws", () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 30 }), (lines) => {
        const { log, warnings } = parseNdjson(`${VALID_NDJSON_LINE}\n${lines.join("\n")}`);
        expect(Array.isArray(warnings)).toBe(true);
        expect(log.events.length).toBeGreaterThanOrEqual(1); // at least the valid line
      }),
    );
  });

  test("parseCsv round-trip: N timestamp-distinct rows yield N events, 0 warnings", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            caseId: fc.constantFrom("c1", "c2", "c3"),
            activity: fc.constantFrom("submit", "review", "approve", "reject"),
            resource: fc.constantFrom("", "alice", "bob"),
          }),
          { minLength: 1, maxLength: 30 },
        ),
        (recs) => {
          // Index-derived seconds make every (case, timestamp, activity) triple
          // distinct, so there are no dedup-warning skips.
          const body = recs
            .map(
              (r, i) =>
                `${r.caseId},${r.activity},2025-01-01T00:00:${String(i).padStart(2, "0")},complete,${r.resource}`,
            )
            .join("\n");
          const { log, warnings } = parseCsv(`${HEADER}\n${body}`);
          expect(warnings).toEqual([]);
          expect(log.events.length).toBe(recs.length);
        },
      ),
    );
  });
});
