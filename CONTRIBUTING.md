# Contributing

Thanks for your interest in mining-lib. Bug reports, fixes, and focused features
are all welcome.

## Getting set up

```sh
pnpm install
pnpm dev        # http://localhost:5173 — example + showcase pages, hot-reloaded
```

Node ≥ 18 and [pnpm](https://pnpm.io). No other toolchain is required — the
library is browser-only.

## Before you open a PR

```sh
pnpm lint        # Biome (format + lint, single pass)
pnpm typecheck   # tsc, source + tests
pnpm test        # unit (Vitest) + browser e2e (Playwright, Chromium)
```

All four should be green. The e2e suite builds the bundle and drives the demo
pages, so the first run installs a browser via Playwright.

## Conventions

- **TypeScript**, ES2022, strict. Match the style of the file you're editing;
  Biome handles formatting.
- **Tests first.** New behaviour comes with a failing test that then passes;
  fixes come with a regression test. Don't weaken a test to make it green.
- **Conventional commits** (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`,
  `chore:`) with an imperative subject. The git log reads like the changelog.
- **Keep the stack.** The public API stays framework-agnostic; internally it's
  D3 + dagre. Please discuss any new runtime dependency in an issue first.

## Scope

mining-lib turns an event log into an interactive Directly-Follows Graph in the
browser. It is intentionally not a full process-mining suite — conformance
checking, Petri nets, and miners beyond the DFG are out of scope. If you're
unsure whether a change fits, open an issue and let's talk it through.
