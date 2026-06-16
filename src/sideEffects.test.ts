import { describe, expect, it } from "vitest";
// Import a SINGLE named export — deliberately the parser, NOT createDiagram —
// to mirror an embedder who only wants `parseCsv`. Registering the
// `<mining-lib-diagram>` custom element is a top-level side effect of the entry
// module, so it must run regardless of which export the consumer pulls in.
//
// The package.json `sideEffects: ["./dist/mining-lib.js", ...]` field is what
// tells a tree-shaking bundler to preserve that registration even when the
// consumer imports only a pure helper; `publint` (CI) validates the field, and
// this test pins the behaviour it protects: importing any export registers the
// element.
import { parseCsv } from "./index.js";

describe("custom-element registration is a preserved package side effect", () => {
  it("registers <mining-lib-diagram> when any single named export is imported", () => {
    expect(typeof parseCsv).toBe("function");
    expect(customElements.get("mining-lib-diagram")).toBeDefined();
  });
});
