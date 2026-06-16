export type Theme = {
  dark?: boolean;
  nodeFill?: string;
  nodeStroke?: string;
  nodeText?: string;
  nodeMutedText?: string;
  edgeStroke?: string;
  edgeLabelText?: string;
  /**
   * Edge-label chip fill (the small rectangle under each edge's
   * count or duration text). Renamed from `chipFill` in Phase 19
   * — the old name implied it affected the popover/UI chips,
   * which it never did. The CSS one-phase alias
   * (`--mining-chip-fill`) was dropped in Phase 20.
   */
  edgeLabelFill?: string;
  edgeLabelStroke?: string;
  background?: string;
  fontFamily?: string;
  fontSize?: number;
  nodeRadius?: number;
  nodePadding?: number;
  strokeWidth?: number;
  accent?: string;
  accentForeground?: string;
  borderRadius?: number;
  pillShadow?: string;
  gridDot?: string;
  monoFontFamily?: string;
  timeRampLow?: string;
  timeRampHigh?: string;
  /**
   * Phase 24 — opacity applied to nodes / edges / edge-labels marked
   * with the `.mining-lib-faded` class while a happy-path overlay
   * is active. Stored as a string so it serialises cleanly into the
   * `--mining-overlay-fade-opacity` CSS variable; embedders can
   * override with any valid CSS `<number>`.
   */
  overlayFadeOpacity?: string;
  /**
   * Phase 24 (Option C) — stroke colour for nodes + edges that lie ON
   * the pinned happy path. Decouples the "happy path" signal from
   * selection (accent) and time encoding (time-ramp amber), keeping
   * the three orthogonal channels visually independent. Defaults to
   * a calm green that reads as "preferred / canonical flow".
   */
  happyStroke?: string;
  /**
   * Phase 24 (Option C) — node fill for on-path nodes. A faint tint
   * of the happy-stroke colour so the spine reads as a flat colour
   * block at low zooms, where the 1.5 px stroke would otherwise
   * disappear into the rectangle.
   */
  happyNodeFill?: string;
};

export type ResolvedTheme = Required<Omit<Theme, "dark">> & { dark: boolean };

const SANS_STACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const MONO_STACK = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace';

const PILL_SHADOW_LIGHT = "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)";
const PILL_SHADOW_DARK = "0 1px 2px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.6)";

export const LIGHT_DEFAULTS: ResolvedTheme = Object.freeze({
  dark: false,
  nodeFill: "#f8fafc",
  nodeStroke: "#e4e4e7",
  nodeText: "#18181b",
  nodeMutedText: "#71717a",
  edgeStroke: "#d4d4d8",
  edgeLabelText: "#71717a",
  edgeLabelFill: "#f8fafc",
  edgeLabelStroke: "#e4e4e7",
  background: "transparent",
  fontFamily: SANS_STACK,
  fontSize: 12,
  nodeRadius: 6,
  nodePadding: 16,
  strokeWidth: 1,
  accent: "#0070f3",
  accentForeground: "#ffffff",
  borderRadius: 4,
  pillShadow: PILL_SHADOW_LIGHT,
  gridDot: "#e4e4e7",
  monoFontFamily: MONO_STACK,
  timeRampLow: "#94a3b8",
  timeRampHigh: "#d97706",
  overlayFadeOpacity: "0.5",
  happyStroke: "#16a34a",
  happyNodeFill: "#f0fdf4",
}) as ResolvedTheme;

export const DARK_DEFAULTS: ResolvedTheme = Object.freeze({
  dark: true,
  nodeFill: "#0d0e12",
  nodeStroke: "#27272a",
  nodeText: "#fafafa",
  nodeMutedText: "#a1a1aa",
  edgeStroke: "#3f3f46",
  edgeLabelText: "#a1a1aa",
  edgeLabelFill: "#0d0e12",
  edgeLabelStroke: "#27272a",
  background: "#000000",
  fontFamily: SANS_STACK,
  fontSize: 12,
  nodeRadius: 6,
  nodePadding: 16,
  strokeWidth: 1,
  accent: "#3b82f6",
  accentForeground: "#ffffff",
  borderRadius: 4,
  pillShadow: PILL_SHADOW_DARK,
  gridDot: "#27272a",
  monoFontFamily: MONO_STACK,
  timeRampLow: "#475569",
  timeRampHigh: "#d97706",
  overlayFadeOpacity: "0.5",
  happyStroke: "#22c55e",
  happyNodeFill: "#052e16",
}) as ResolvedTheme;

export function resolveTheme(partial?: Theme): ResolvedTheme {
  const baseline = partial?.dark ? DARK_DEFAULTS : LIGHT_DEFAULTS;
  const result: ResolvedTheme = { ...baseline };
  if (!partial) return result;
  for (const key of Object.keys(partial) as (keyof Theme)[]) {
    if (key === "dark") continue;
    const value = partial[key];
    if (value === undefined) continue;
    // Type-safe assignment: ResolvedTheme keys other than "dark"
    // are exactly Theme's non-undefined keys.
    (result as Record<string, unknown>)[key] = value;
  }
  return result;
}

/**
 * Per-field merge for `setTheme(partial)`: for each field the user
 * customised relative to the *previous* baseline, keep their value;
 * otherwise pick up the *new* baseline. Explicit fields in `partial`
 * win unconditionally. `dark` flips together with the baseline.
 */
export function mergeTheme(
  prevBaseline: ResolvedTheme,
  newBaseline: ResolvedTheme,
  current: ResolvedTheme,
  partial: Theme,
): ResolvedTheme {
  const result: ResolvedTheme = { ...newBaseline };
  for (const key of Object.keys(newBaseline) as (keyof ResolvedTheme)[]) {
    if (key === "dark") continue;
    const explicit = partial[key as keyof Theme];
    if (explicit !== undefined) {
      (result as Record<string, unknown>)[key] = explicit;
      continue;
    }
    if (current[key] !== prevBaseline[key]) {
      (result as Record<string, unknown>)[key] = current[key];
    }
  }
  result.dark = newBaseline.dark;
  return result;
}
