import { describe, expect, it } from "vitest";
import { buildDfg } from "./buildDfg.js";
import { createDiagram } from "./index.js";
import { parseCsv } from "./parseCsv.js";

// Activity names + attribute values come from untrusted CSV/NDJSON and are
// rendered into the host page's DOM. Every display sink uses `.text()` /
// `.textContent` (no HTML parsing) and the export path serialises via
// XMLSerializer, so a payload must appear as LITERAL TEXT, never as markup.
// This test locks that invariant against a future `.text()` -> `.innerHTML`
// regression.
const XSS = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';

function makeHost(): HTMLDivElement {
  const host = document.createElement("div");
  host.style.width = "800px";
  host.style.height = "600px";
  document.body.appendChild(host);
  return host;
}

describe("untrusted activity strings render as text, never markup (XSS)", () => {
  it("does not inject elements from a malicious activity name, and escapes it in the export", () => {
    const csv =
      "case:concept:name,concept:name,time:timestamp,lifecycle:transition,org:resource\n" +
      `c1,${XSS},2025-01-01T00:00:00,complete,\n` +
      "c1,done,2025-01-01T01:00:00,complete,";
    const { log } = parseCsv(csv);
    const host = makeHost();
    const handle = createDiagram(host, {});
    handle.render(buildDfg(log), log);

    const el = host.querySelector("mining-lib-diagram");
    const root = (el as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot;

    // No element was parsed out of the payload into the live DOM.
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("script")).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();

    // The payload survives as the literal text content of a node label.
    const labels = [...root.querySelectorAll("text")].map((t) => t.textContent ?? "");
    expect(labels.some((t) => t.includes(XSS))).toBe(true);

    // The serialised export escapes it — no live `<img>` / `<script>` tag.
    const svg = handle.exportSvg();
    expect(svg).not.toContain("<img");
    expect(svg).not.toContain("<script");
    expect(svg).toContain("&lt;img");

    handle.destroy();
  });
});
