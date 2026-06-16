import { describe, expect, test } from "vitest";
import { parseLog } from "./parseNdjson.js";

// Malformed rows surface as `warnings` (never silently dropped) at the public
// auto-detecting dispatcher, so an embedder who checks `result.warnings` can
// detect row loss. The library has NO element-level warnings event because the
// `<mining-lib-diagram>` element consumes POST-parse data — warnings live at
// the parse call site (parseCsv / parseNdjson / parseLog / loadLog all return
// the same `warnings` array, demonstrated in the README quickstart).
describe("parseLog surfaces parse warnings (no silent row loss)", () => {
  const header = "case:concept:name,concept:name,time:timestamp,lifecycle:transition,org:resource";

  test("a malformed CSV row warns + is skipped; the good row survives", () => {
    const csv = `${header}\nc1,a,2025-01-01T00:00:00,complete,\nc1,b,not-a-date,complete,`;
    const { log, warnings } = parseLog(csv);
    expect(log.events.length).toBe(1);
    expect(warnings.length).toBe(1);
    expect(warnings[0]?.reason).toMatch(/time:timestamp/);
  });

  test("a malformed NDJSON line warns + is skipped", () => {
    const ndjson =
      '{"case:concept:name":"c1","concept:name":"a","time:timestamp":"2025-01-01T00:00:00","lifecycle:transition":"complete","org:resource":null}\nnot json';
    const { warnings } = parseLog(ndjson);
    expect(warnings.length).toBe(1);
  });
});
