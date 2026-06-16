# Security Policy

## Trust boundary

mining-lib runs **entirely in the browser** and has **no network, storage, or
execution surface of its own** beyond the page it is embedded in:

- It **never makes network requests** — the embedder fetches the log and hands
  the text to `parseCsv` / `parseLog` / `loadLog`.
- It has **no backend** and runs no code at install/build time in a consumer's
  app beyond standard bundling.
- Its only persistence is an **opt-in IndexedDB cache** (`loadLog`), keyed by a
  SHA-256 of the log text, scoped to the page's origin.

## Untrusted input → DOM

The library renders **untrusted event-log content** — activity names, resource
names, and case-attribute values from the consumer's CSV/NDJSON — into the host
page's DOM (SVG labels, the selection pill, the trace panel, and the exported
SVG/PNG).

**These strings are always treated as text, never as markup.** Every display
sink uses `textContent` / D3 `.text()` (which do **not** parse HTML), the only
`innerHTML` write in the codebase is a hard-coded internal icon set (no user
input reaches it), and `exportSvg()` serialises through `XMLSerializer` (which
escapes text and attribute values). A malicious activity name such as
`<img src=x onerror=…>` therefore appears as literal text and injects nothing —
this invariant is covered by a regression test (`src/security.test.ts`).

The library does **not** sanitise or rewrite log content (it does not need to,
because it never interprets it as markup). Embedders should still treat event
logs as untrusted data on their side and avoid `eval`-ing or `innerHTML`-ing
log fields in their own code.

## Reporting a vulnerability

Please report suspected vulnerabilities privately via GitHub's **"Report a
vulnerability"** (Security → Advisories) on
<https://github.com/crlsrmrlsz/mining-lib>, or by email to the maintainer.
Please do not open a public issue for an unfixed vulnerability. We aim to
acknowledge reports within a few days.

## Supported versions

The project is pre-1.0; security fixes land on `main` and in the latest
published release.
