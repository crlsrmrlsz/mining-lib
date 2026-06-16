# Usage reference

Everything beyond the [README](../README.md) quick start: the two ways to mount a
diagram, parsing logs, the count/time modes, pan & zoom, theming, filtering and
per-case drill-down, exports, and the full API surface.

- [Install](#install)
- [Two ways to mount](#two-ways-to-mount)
  - [The factory](#the-factory-creatediagram)
  - [The web component](#the-web-component-mining-lib-diagram)
- [Parsing logs](#parsing-logs)
- [Building & rendering a DFG](#building--rendering-a-dfg)
- [Count & time modes](#count--time-modes)
- [Pan & zoom](#pan--zoom)
- [Layout direction](#layout-direction)
- [Theming](#theming)
- [Filtering & drill-down](#filtering--drill-down)
- [Dragging nodes & edges](#dragging-nodes--edges)
- [Exporting](#exporting)
- [API index](#api-index)

---

## Install

From npm, as an ES module:

```sh
npm install mining-lib
```

```ts
import { createDiagram } from "mining-lib";
```

Or as a classic `<script>` tag from a CDN — the API lands on `window.MiningLib`:

```html
<script src="https://cdn.jsdelivr.net/npm/mining-lib/dist/mining-lib.umd.js"></script>
<script>
  const handle = window.MiningLib.createDiagram("#chart", {});
</script>
```

The scoped stylesheet is inlined into the bundle and injected into the
component's shadow root — for both the ESM and UMD builds — so there is no
separate CSS file to load, and no selector can leak into (or be overridden by)
the host page.

## Two ways to mount

### The factory: `createDiagram`

`createDiagram(target, config)` mounts a diagram into `target` (a selector or an
element) and returns an imperative **handle**.

```ts
import { buildDfg, createDiagram, parseLog } from "mining-lib";

const handle = createDiagram("#chart", { countMode: "absolute", rankdir: "TB" });

const { log } = parseLog(await fetch("/events.csv").then((r) => r.text()));
handle.render(buildDfg(log));

// …later
handle.destroy();
```

Construction options (`CreateDiagramConfig`):

| Option | Type | Notes |
|---|---|---|
| `countMode` | `CountMode` | initial aggregate (default `"absolute"`) |
| `zoom` | `{ minScale?, maxScale? }` | pan/zoom bounds (default `[0.1, 10]`) |
| `theme` | `Theme` | partial theme merged over the baseline |
| `preset` | `"default" \| "linear" \| "paper"` | visual preset |
| `rankdir` | `"TB" \| "LR"` | layout direction (default `"TB"`) |
| `variantTopK` | `number` | default number of variants shown |
| `controls` | `ControlsConfig` | which chrome surfaces to show |
| `happyPathVariant` | `string[]` | pin a happy-path overlay at mount |
| `traceCase` | `string` | pin a single case trace at mount |

### The web component: `<mining-lib-diagram>`

`createDiagram` is sugar over a custom element that self-registers on
`import "mining-lib"`. Use it declaratively in any HTML or framework template:

```html
<mining-lib-diagram preset="linear" rankdir="LR" count-mode="case"></mining-lib-diagram>
```

Set data via the `el.log` / `el.dfg` properties and reach the imperative handle
via `el.handle`. Reflected attributes / properties:

| Attribute / property | Values | Notes |
|---|---|---|
| `count-mode` | `absolute` *(default)* / `case` / `meanRepetitions` / `maxRepetitions` / `meanDuration` / `medianDuration` | reactive |
| `preset` | `default` / `linear` / `paper` | theme preset |
| `theme` | `light` / `dark` (or a `Theme` object via the property) | reactive |
| `rankdir` | `TB` *(default)* / `LR` | layout direction; reactive |
| `trace-case` | a case id | pins the single-case trace |
| `variant-top-k` | a positive integer | default top-K variants shown |
| `controls` | `all` *(default)* / `none` / a subset (`mode variants filters tr bl selection`) | hides chrome surfaces |

Style internal surfaces from the host page via the `::part()` API (e.g.
`mining-lib-diagram::part(popover)`).

## Parsing logs

The input contract is [`LOG_FORMAT_SPEC`](../data/input/LOG_FORMAT_SPEC.md) — both
**CSV** and **NDJSON** (one JSON object per line, *not* a JSON array). You don't
need to know which you have:

```ts
import { parseLog, parseCsv, parseNdjson, detectLogFormat, loadLog } from "mining-lib";

// Auto-detect CSV vs NDJSON by content; returns { log, warnings }.
const { log, warnings } = parseLog(text);

// Or be explicit:
const csvResult = parseCsv(text);
const ndjsonResult = parseNdjson(text);
detectLogFormat(text); // "csv" | "ndjson"

// Async entry point with an IndexedDB cache (keyed by a SHA-256 of the text)
// fronting parse + build, so re-loading the same log is instant.
const { log: cachedLog, dfg, fromCache } = await loadLog(text);
```

Parsing is lenient: a malformed row is **skipped with a 1-based line number in
`warnings`, never silently dropped**, and good rows survive. A leading UTF-8 BOM
(Excel "Save as CSV UTF-8", PowerShell) is stripped automatically.

```ts
if (warnings.length > 0) {
  console.warn(`${warnings.length} rows skipped`, warnings);
}
```

## Building & rendering a DFG

`buildDfg(log)` is a pure function of the log. `handle.render(dfg)` lays it out
with dagre and paints it into the factory-owned SVG; node height and edge stroke
width scale with frequency. Calling `render` again replaces the picture.

```ts
import { buildDfg, parseLog } from "mining-lib";

const { log } = parseLog(text);
const dfg = buildDfg(log);

for (const node of dfg.nodes.values()) {
  console.log(node.activity, node.absoluteFrequency, node.caseFrequency);
}
for (const edge of dfg.edges.values()) {
  console.log(`${edge.from} → ${edge.to}`, edge.absoluteFrequency, edge.durationMs);
}

handle.render(dfg);
```

## Count & time modes

Every node and edge carries four count aggregates plus two duration aggregates.

| Mode | What it shows | Question it answers |
|---|---|---|
| `absolute` *(default)* | total event occurrences | "how much work did this step do?" |
| `case` | distinct cases that visited | "how many cases touched this step?" |
| `maxRepetitions` | max occurrences within any single case | "worst-case outlier per case?" |
| `meanRepetitions` | `absolute / case`, per visiting case | "typical rework amount?" |
| `meanDuration` | mean transition / terminal-case duration | "how slow on average?" |
| `medianDuration` | median transition / terminal-case duration | "how slow for a typical case?" |

The two duration modes colour edges and nodes along a neutral→amber ramp so the
slowest transitions stand out. Set the mode at creation and/or switch at runtime
— the embedder owns any UI:

```ts
const handle = createDiagram("#chart", { countMode: "absolute" });
handle.render(buildDfg(log));

handle.setCountMode("case");      // wired to your own <select>, button, shortcut…
handle.getCountMode();            // "case"
```

On a mode change the layout re-runs, and the rendered `<svg>` exposes
`data-count-mode="<mode>"` for CSS / DOM hooks.

## Pan & zoom

The rendered `<svg>` is focusable (`tabindex="0"`) and pans/zooms out of the box:

- **Wheel** to zoom; **drag** to pan; **double-click** to reset.
- **`+`** / **`=`** zoom in, **`-`** / **`_`** zoom out, **`0`** resets (the
  diagram must have keyboard focus — Tab to it or click it first).
- **Pinch** on touch devices.

Drive the view from your own UI:

```ts
const handle = createDiagram("#chart", { zoom: { minScale: 0.25, maxScale: 5 } });
handle.render(dfg);

handle.zoomTo(2);        // scale to 2× (clamped to bounds)
handle.resetView();      // back to identity
handle.getTransform();   // { x, y, k } — plain, JSON-safe object
```

Pan/zoom survives `setCountMode` re-renders, so switching modes never throws away
the viewer's current view. `resetView()` always brings it home.

## Layout direction

The graph lays out top-to-bottom (`"TB"`) by default. A wide, shallow funnel often
reads better left-to-right (`"LR"`):

```ts
const handle = createDiagram("#chart", { rankdir: "LR" });
handle.render(dfg);

handle.setRankdir("TB");   // re-lays-out in place — no remount
handle.getRankdir();       // "TB"
```

A flip re-runs the dagre layout and re-fits; because the new orientation
recomputes every coordinate, manual node drags and edge bends are cleared.

## Theming

A light default and a paired dark variant ship in the box. Pass `theme` at
construction or call `handle.setTheme(partial)` at runtime; every field is
optional and merges over the current resolved theme. Geometry customisations
(corner radius, stroke width, padding) survive a `dark` flip; palette fields fall
through to the new baseline. CSS custom properties (`--mining-*`) on the `<svg>`
are writeable directly from your stylesheet too.

```ts
const handle = createDiagram("#chart", { theme: { dark: true, nodeRadius: 8 } });
handle.setTheme({ nodeRadius: 12 });   // partial merge
handle.getTheme();                     // ResolvedTheme (defensive copy)
```

| Field | Default (light / dark) | Notes |
|---|---|---|
| `dark` | `false` / `true` | flips palette baseline |
| `nodeFill` | `#f8fafc` / `#0d0e12` | rect fill |
| `nodeStroke` | `#e4e4e7` / `#27272a` | rect border |
| `nodeText` | `#18181b` / `#fafafa` | activity label |
| `nodeMutedText` | `#71717a` / `#a1a1aa` | per-node count |
| `edgeStroke` | `#d4d4d8` / `#3f3f46` | edge + arrowhead |
| `edgeLabelText` | `#71717a` / `#a1a1aa` | count text in chip |
| `chipFill` | `#f8fafc` / `#0d0e12` | edge-label chip fill |
| `chipStroke` | `#e4e4e7` / `#27272a` | edge-label chip border |
| `background` | `transparent` / `#000000` | svg background |
| `fontFamily` | system sans stack | applied as a CSS variable |
| `fontSize` | `12` | base px; node count and edge label use `fontSize − 2` |
| `nodeRadius` | `6` | rect `rx`/`ry` |
| `nodePadding` | `16` | extra label-side padding inside the rect |
| `strokeWidth` | `1` | base edge weight; frequency scales `[base, base × 2]` |

Presets bundle a coordinated look: `handle.setPreset("paper")` (or the
`preset` attribute). Available: `default`, `linear`, `paper`.

## Filtering & drill-down

`handle.setFilters(clauses)` replaces the full clause list; an empty array clears
filtering, and multiple clauses intersect (AND) to form the case set in scope.

```ts
handle.setFilters([
  { kind: "attribute", attribute: "case:loan_amount_band", values: ["over_750k"] },
  { kind: "date", from: "2025-01-01", to: "2025-03-31", anchor: "started" },
]);
handle.getFilters();   // defensive copy of the active clauses
handle.setFilters([]); // clear all
```

Clause kinds:

| `kind` | Shape | Keeps cases that… |
|---|---|---|
| `variant` | `{ sequences: string[] }` | follow one of these exact activity paths |
| `node` | `{ activity: string }` | visit this activity |
| `branch` | `{ edge: [from, to] }` | take this transition |
| `resourceAt` | `{ activity, resources: string[] }` | had one of these resources at the activity |
| `attribute` | `{ attribute, values: AttributeValue[] }` | match a case attribute value |
| `date` | `{ from, to, anchor: "started" \| "ended" }` | started/ended within the range |
| `caseId` | `{ caseIds: string[] }` | are one of these cases |

Scope to a single case to mount the floating **trace panel** (its step-by-step
path with timings):

```ts
handle.setTraceCase("case_0042");   // convenience wrapper over a single-id caseId clause
handle.setTraceCase(null);          // clear
```

Pin a variant as a **happy-path overlay** — nodes and edges off the sequence fade:

```ts
handle.setHappyPathVariant(["submitted", "review", "approved"]);
handle.setHappyPathVariant(null);
```

## Dragging nodes & edges

Every node is draggable; its incident edges follow through the same smooth
Catmull-Rom curves the first render uses. Every interior waypoint on a routed
edge is exposed as a small circular handle — drag it to reshape the curve.
Dragged positions and bends persist for the current log and survive count-mode
switches. Double-click, press `0`, or call `handle.resetView()` to clear them;
`handle.render(newDfg)` clears them too (the new DFG owns its own layout).

## Exporting

Serialize the current filtered diagram to a self-contained SVG string, or a PNG
`Blob`:

```ts
const svg = handle.exportSvg();                    // stylesheet inlined, tokens resolved
const png = await handle.exportPng({ scale: 2 });  // opaque backdrop, 2× density

// A small download helper is exported too:
import { triggerDownload } from "mining-lib";
triggerDownload(svg, "process.svg", "image/svg+xml");
triggerDownload(png, "process.png", "image/png");
```

Both throw a `TypeError` if called before the first `render`.

## API index

The diagram handle (`DiagramHandle`):

| Method | Purpose |
|---|---|
| `render(dfg, sourceLog?)` | lay out and paint a DFG |
| `setCountMode` / `getCountMode` | switch / read the active aggregate |
| `setTheme` / `getTheme` | partial-merge / read the theme |
| `setPreset` / `getPreset` | switch / read the visual preset |
| `setRankdir` / `getRankdir` | flip / read layout direction |
| `getVariants` | the log's variants, most frequent first |
| `setFilters` / `getFilters` | replace / read the filter clause list |
| `setHappyPathVariant` / `getHappyPathVariant` | pin / read the happy-path overlay |
| `setTraceCase` / `getTraceCase` | pin / read the single-case trace |
| `select` / `getSelected` | programmatic node/edge selection |
| `zoomTo` / `resetView` / `getTransform` | drive the camera |
| `exportSvg` / `exportPng` | serialize the diagram |
| `destroy` | tear down and release listeners |

Top-level exports also include the pure data functions — `parseCsv`,
`parseNdjson`, `parseLog`, `detectLogFormat`, `loadLog`, `clearLogCache`,
`buildDfg`, `getVariants`, `layoutDfg`, `renderDfg`, `computeFitToView` — plus
helpers for case attributes, date ranges, resources, durations, and traces. See
[`src/index.ts`](../src/index.ts) for the complete, typed surface.
