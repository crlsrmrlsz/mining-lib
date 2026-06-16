import { afterEach, describe, expect, it } from "vitest";
import n5Csv from "../data/input/runs/n5-fixture/events.csv?raw";
import { buildDfg } from "./buildDfg.js";
import { createDiagram } from "./index.js";
import { parseCsv } from "./parseCsv.js";
import { LIGHT_DEFAULTS } from "./theme.js";

// B5: the overlay/happy-path tokens previously had NO `:host` default (only the
// JS theme emitted them), so a CSS-only embedder who cleared the inline value
// got nothing. They now have `:host` defaults that match theme.ts
// LIGHT_DEFAULTS. This test pins the JS side — that `applyThemeToSvg` emits the
// three tokens at their resolved defaults — and the matching `:host` defaults
// (a static fallback) are asserted by `tokenDefaultsCss.test`-equivalent lint.
const { log } = parseCsv(n5Csv);
const dfg = buildDfg(log);

function makeHost(): HTMLDivElement {
  const host = document.createElement("div");
  host.style.width = "900px";
  host.style.height = "640px";
  document.body.appendChild(host);
  return host;
}

afterEach(() => {
  for (const el of document.querySelectorAll("mining-lib-diagram")) el.remove();
  for (const el of document.querySelectorAll("div")) el.remove();
});

describe("default theme emits overlay/happy-path tokens at LIGHT_DEFAULTS (Phase 38-II B5)", () => {
  it("sets --mining-overlay-fade-opacity / --mining-happy-stroke / --mining-happy-node-fill inline", () => {
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(dfg, log);
    const el = host.querySelector("mining-lib-diagram") as HTMLElement;

    expect(el.style.getPropertyValue("--mining-overlay-fade-opacity")).toBe(
      LIGHT_DEFAULTS.overlayFadeOpacity,
    );
    expect(el.style.getPropertyValue("--mining-happy-stroke")).toBe(LIGHT_DEFAULTS.happyStroke);
    expect(el.style.getPropertyValue("--mining-happy-node-fill")).toBe(
      LIGHT_DEFAULTS.happyNodeFill,
    );
    handle.destroy();
  });
});
