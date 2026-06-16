import { afterEach, describe, expect, it } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import { buildDfg } from "./buildDfg.js";
import { createDiagram } from "./index.js";
import { parseCsv } from "./parseCsv.js";

const { log: n5Log } = parseCsv(n5Csv);
const n5Dfg = buildDfg(n5Log);

function makeHost(): HTMLDivElement {
  const host = document.createElement("div");
  host.style.width = "1000px";
  host.style.height = "700px";
  document.body.appendChild(host);
  return host;
}

afterEach(() => {
  for (const el of document.querySelectorAll("mining-lib-diagram")) el.remove();
  for (const el of document.querySelectorAll("div")) el.remove();
});

describe("theme.fontSize drives the token labels actually read (Phase 38-II B1)", () => {
  it("sets --mining-fs-base (not the inert --mining-font-size alias)", () => {
    const host = makeHost();
    const handle = createDiagram(host, { theme: { fontSize: 16 } });
    handle.render(n5Dfg, n5Log);
    const el = host.querySelector("mining-lib-diagram") as HTMLElement;

    // Node labels + chrome read `--mining-fs-base`; the writer must set it so a
    // fontSize override is honoured (and node boxes — sized off the same value
    // in layoutDfg — stay matched to the text).
    expect(el.style.getPropertyValue("--mining-fs-base")).toBe("16px");
    // The `--mining-font-size` alias is no longer written directly (CSS derives
    // it from --mining-fs-base).
    expect(el.style.getPropertyValue("--mining-font-size")).toBe("");
    handle.destroy();
  });

  it("setTheme({ fontSize }) updates --mining-fs-base at runtime", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(n5Dfg, n5Log);
    handle.setTheme({ fontSize: 20 });
    const el = host.querySelector("mining-lib-diagram") as HTMLElement;
    expect(el.style.getPropertyValue("--mining-fs-base")).toBe("20px");
    handle.destroy();
  });
});
