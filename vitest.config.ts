import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      // Thresholds are a RATCHET set to floor(measured): they fail CI on any
      // regression but never demand contorted tests. Floors only ever rise.
      // Global is held looser because the interactive chrome is exercised by
      // real-browser e2e, which coverage-v8 under jsdom can't credit; the pure
      // data/model core is pinned at its measured high. Phase 39 Group A drove
      // 11 cores to their floors (+52 unit tests) and ratcheted here — the
      // branches still uncovered in the pinned cores are proven-defensive
      // (`?? 0` fallbacks on in-bounds indices, absent-key guards on maps
      // populated in lockstep) and can't be hit without an `as any`-forged
      // invalid input that biome's noExplicitAny/noNonNullAssertion rejects.
      thresholds: {
        lines: 87,
        functions: 79,
        branches: 79,
        statements: 85,
        "src/parseCsv.ts": { lines: 100, branches: 94, functions: 100, statements: 100 },
        "src/parseNdjson.ts": { lines: 94, branches: 88, functions: 100, statements: 95 },
        "src/logRecords.ts": { lines: 100, branches: 100, functions: 100, statements: 100 },
        "src/buildDfg.ts": { lines: 100, branches: 75, functions: 100, statements: 94 },
        "src/getVariants.ts": { lines: 100, branches: 100, functions: 100, statements: 100 },
        "src/filterClauses.ts": { lines: 100, branches: 100, functions: 100, statements: 100 },
        "src/caseAttributeFilter.ts": {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
        "src/caseDuration.ts": { lines: 100, branches: 86, functions: 100, statements: 100 },
        "src/dateFilter.ts": { lines: 100, branches: 94, functions: 100, statements: 96 },
        "src/getResourceBreakdown.ts": { lines: 94, branches: 93, functions: 100, statements: 96 },
        "src/happyPath.ts": { lines: 100, branches: 100, functions: 100, statements: 100 },
        "src/layoutDfg.ts": { lines: 100, branches: 96, functions: 90, statements: 97 },
      },
    },
  },
});
