import { afterEach, describe, expect, it } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import { buildDfg } from "./buildDfg.js";
import { getVariants } from "./getVariants.js";
import { createDiagram } from "./index.js";
import { parseCsv } from "./parseCsv.js";
import type { Case, Event, EventLog } from "./types.js";

const { log: n5Log } = parseCsv(n5Csv);
const n5Dfg = buildDfg(n5Log);

function makeLog(cases: { id: string; activities: string[] }[]): EventLog {
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
    caseMap.set(c.id, { id: c.id, events, attributes: {} });
  }
  return {
    cases: caseMap,
    events: eventList,
    schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
  };
}

function mountTarget(): HTMLDivElement {
  const div = document.createElement("div");
  div.id = "mount";
  document.body.appendChild(div);
  return div;
}

describe("DiagramHandle.getVariants", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns the same shape as the top-level getVariants when sourceLog is provided to render", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg, n5Log);

    expect(handle.getVariants()).toEqual(getVariants(n5Log));
  });

  it("throws TypeError when render was called without sourceLog", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});
    handle.render(n5Dfg);

    expect(() => handle.getVariants()).toThrow(TypeError);
    expect(() => handle.getVariants()).toThrow(/getVariants/);
    expect(() => handle.getVariants()).toThrow(/sourceLog/);
  });

  it("throws TypeError when render has never been called", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});

    expect(() => handle.getVariants()).toThrow(TypeError);
  });

  it("returns variants for the most recent sourceLog when render is called multiple times", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});

    const logA = makeLog([
      { id: "a1", activities: ["x", "y"] },
      { id: "a2", activities: ["x", "y"] },
    ]);
    const logB = makeLog([{ id: "b1", activities: ["p", "q", "r"] }]);

    handle.render(buildDfg(logA), logA);
    expect(handle.getVariants()).toEqual(getVariants(logA));

    handle.render(buildDfg(logB), logB);
    expect(handle.getVariants()).toEqual(getVariants(logB));
  });

  it("clears the stored sourceLog when render is called without one", () => {
    mountTarget();
    const handle = createDiagram("#mount", {});

    handle.render(n5Dfg, n5Log);
    expect(handle.getVariants()).toHaveLength(4);

    handle.render(n5Dfg);
    expect(() => handle.getVariants()).toThrow(TypeError);
  });
});
