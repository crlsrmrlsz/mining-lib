import type { FilterClause } from "./filterClauses.js";
import type { ControlsConfig } from "./parseControls.js";
import type { PresetName } from "./presets.js";
import type { ResolvedTheme, Theme } from "./theme.js";
import type { CountMode, Dfg, EventLog, Variant } from "./types.js";

// Public diagram types (Phase 38-II E1). Extracted out of the 1,555-line
// `createDiagram.ts` coordinator into this leaf so the chrome modules
// (toolbar / selectionPill / diagramSelection / MiningLibDiagram) import them
// from here instead of reaching *back* into the coordinator — which created
// type-only import cycles coupling every leaf to the largest file. The public
// API surface is unchanged: `index.ts` re-exports these names verbatim.

export type ZoomConfig = {
  minScale?: number;
  maxScale?: number;
};

export type ViewTransform = {
  x: number;
  y: number;
  k: number;
};

export type SelectionTarget = { kind: "node"; id: string } | { kind: "edge"; id: string };

export type CreateDiagramConfig = {
  countMode?: CountMode;
  zoom?: ZoomConfig;
  theme?: Theme;
  variantTopK?: number;
  preset?: PresetName;
  controls?: ControlsConfig;
  /**
   * Phase 36 — dagre layout direction. "TB" stacks ranks top-to-bottom
   * (default; well-suited to portrait embeds and short funnels). "LR" lays
   * ranks left-to-right (well-suited to wide-landscape embeds and long linear
   * processes like loan-origination). Read at mount; runtime changes via the
   * element attribute are no-ops after the first connect.
   */
  rankdir?: "LR" | "TB";
  /**
   * Phase 24 — pin a variant as the happy path at construction. The renderer
   * fades nodes and edges that lie outside this exact sequence. `null`/omitted
   * leaves the overlay off. Honored on first render; runtime changes go through
   * `handle.setHappyPathVariant`.
   */
  happyPathVariant?: string[];
  /**
   * Phase 27 — pin a single case as the trace at construction. Mounts the
   * floating Trace panel anchored top-right and fades nodes/edges outside the
   * case's path. Auto-cleared on first render if the case id isn't in the
   * rendered log. Trace wins over `happyPathVariant` when both are set
   * (Decision D1).
   */
  traceCase?: string;
};

export type DiagramHandle = {
  render(dfg: Dfg, sourceLog?: EventLog): void;
  setCountMode(mode: CountMode): void;
  getCountMode(): CountMode;
  setTheme(partial: Theme): void;
  getTheme(): ResolvedTheme;
  setPreset(name: PresetName): void;
  getPreset(): PresetName;
  /**
   * Phase 37 — flip the dagre layout direction at runtime. Re-lays-out, clears
   * manual node-drag + edge-bend overrides (their coordinates are keyed to the
   * old orientation and meaningless after a 90° relayout), and re-fits the
   * camera. Library default is "TB" (vertical).
   */
  setRankdir(dir: "LR" | "TB"): void;
  getRankdir(): "LR" | "TB";
  getVariants(): Variant[];
  /**
   * Phase 20 — replace the full filter clause list. Empty array clears all
   * filtering; non-empty clauses intersect (AND) to form the case set.
   * Defensive-copies its input and dedupes structurally on insert so the
   * click-to-filter button can't push the same clause twice.
   */
  setFilters(clauses: FilterClause[]): void;
  /** Phase 20 — defensive copy of the active clause list. */
  getFilters(): FilterClause[];
  /**
   * Phase-12 back-compat: thin wrapper over `setFilters` that targets only the
   * `variant` clause. Existing callers stay green; new code should use
   * `setFilters`.
   */
  setVariantFilter(signatures: string[] | null): void;
  /** Phase-12 back-compat: reads the `variant` clause's sequences. */
  getVariantFilter(): string[] | null;
  /**
   * Phase 24 — pin a variant as the happy path. Faded class lands on nodes and
   * edges that are not on the pinned sequence. Pass `null` to clear.
   * Defensive-copies its input; returns a defensive copy from
   * `getHappyPathVariant`. Silently auto-clears on subsequent renders when the
   * pinned sequence no longer matches any variant in the filtered log (see
   * requirements D6).
   */
  setHappyPathVariant(sequence: string[] | null): void;
  getHappyPathVariant(): string[] | null;
  /**
   * Phase 27 — pin a single case for trace inspection. After the 2026-05-22
   * refold this is a convenience wrapper that pushes a single-id `caseId`
   * filter clause via `setFilters`; the floating Trace panel mounts at
   * top-right whenever exactly one case is scoped. Pass `null` to strip the
   * clause. Pinning a case defensively clears any active `setHappyPathVariant`
   * pin (Decision D1 — looking at one case, the happy-path comparison is
   * irrelevant).
   */
  setTraceCase(caseId: string | null): void;
  getTraceCase(): string | null;
  getTransform(): ViewTransform;
  resetView(): void;
  zoomTo(scale: number): void;
  select(target: SelectionTarget | null): void;
  getSelected(): SelectionTarget | null;
  /**
   * Phase 32 — serialize the full filtered diagram to a self-contained SVG
   * string: the scoped stylesheet inlined, the active `--mining-*` tokens
   * resolved onto the root, transient pan/zoom reset so the whole graph is
   * captured. Round-trippable into any `<img src>`. Throws a `TypeError` if
   * called before the first `render`.
   */
  exportSvg(): string;
  /**
   * Phase 32 — rasterize the exported SVG to a PNG `Blob` at `scale`
   * device-pixel density (default 2), with an opaque theme-coloured backdrop.
   * Rejects with a `TypeError` before the first `render` or on a non-positive
   * `scale`.
   */
  exportPng(options?: PngExportConfig): Promise<Blob>;
  destroy(): void;
};

/** Phase 32 — options for {@link DiagramHandle.exportPng}. */
export type PngExportConfig = {
  /** Device-pixel density multiplier (default 2). Must be finite and > 0. */
  scale?: number;
};
