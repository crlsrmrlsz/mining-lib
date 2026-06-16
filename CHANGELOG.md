# Changelog

All notable changes to mining-lib are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-06-09

Initial public release.

### Added

- Parse CSV and NDJSON event logs (`parseCsv`, `parseNdjson`, `parseLog` with
  format auto-detection) — lenient, with line-numbered warnings and automatic
  BOM handling.
- Build and render an interactive Directly-Follows Graph (`buildDfg`,
  `createDiagram`, and the `<mining-lib-diagram>` web component).
- Pan, zoom, and drag — nodes and edge waypoints — via mouse, keyboard, and
  touch.
- Count and timing modes: absolute, case, mean/max repetitions, mean/median
  duration.
- Filtering by variant, node, branch, resource, attribute, and date range, plus
  single-case scope with a per-case trace panel and a happy-path overlay.
- Light and dark themes, `default` / `linear` / `paper` presets, and `::part()`
  styling for host pages.
- SVG and PNG export.
- Optional IndexedDB cache (`loadLog`) keyed by a hash of the log text.

[0.1.0]: https://github.com/crlsrmrlsz/mining-lib/releases/tag/v0.1.0
