import { DARK_DEFAULTS, LIGHT_DEFAULTS, type ResolvedTheme } from "./theme.js";

export type PresetName = "default" | "linear" | "paper";

export type PresetVariants = {
  light: ResolvedTheme;
  dark: ResolvedTheme;
};

const SERIF_STACK = 'Georgia, "Times New Roman", "Iowan Old Style", serif';

const LINEAR_LIGHT: ResolvedTheme = Object.freeze({
  ...LIGHT_DEFAULTS,
  background: "#fafafe",
  nodeFill: "#ffffff",
  nodeStroke: "#e5e5ea",
  nodeText: "#1a1a23",
  nodeMutedText: "#6b7280",
  edgeStroke: "#d1d5db",
  edgeLabelText: "#6b7280",
  edgeLabelFill: "#ffffff",
  edgeLabelStroke: "#e5e5ea",
  accent: "#5b6cff",
  accentForeground: "#ffffff",
  gridDot: "#e5e5ea",
}) as ResolvedTheme;

const LINEAR_DARK: ResolvedTheme = Object.freeze({
  ...DARK_DEFAULTS,
  background: "#0a0b14",
  nodeFill: "#15161e",
  nodeStroke: "#272a3a",
  nodeText: "#e8e8f0",
  nodeMutedText: "#8b8fa3",
  edgeStroke: "#3a3d4f",
  edgeLabelText: "#8b8fa3",
  edgeLabelFill: "#15161e",
  edgeLabelStroke: "#272a3a",
  accent: "#6366f1",
  accentForeground: "#ffffff",
  gridDot: "#272a3a",
}) as ResolvedTheme;

const PAPER_LIGHT: ResolvedTheme = Object.freeze({
  ...LIGHT_DEFAULTS,
  background: "#faf6f0",
  nodeFill: "#fffaf2",
  nodeStroke: "#d4c8b8",
  nodeText: "#2b2a26",
  nodeMutedText: "#7a7268",
  edgeStroke: "#c4b8a4",
  edgeLabelText: "#7a7268",
  edgeLabelFill: "#fffaf2",
  edgeLabelStroke: "#d4c8b8",
  accent: "#d2691e",
  accentForeground: "#ffffff",
  fontFamily: SERIF_STACK,
  gridDot: "transparent",
}) as ResolvedTheme;

const PAPER_DARK: ResolvedTheme = Object.freeze({
  ...DARK_DEFAULTS,
  background: "#1a1612",
  nodeFill: "#241f1a",
  nodeStroke: "#3d342a",
  nodeText: "#f0e8dc",
  nodeMutedText: "#a89886",
  edgeStroke: "#4d4234",
  edgeLabelText: "#a89886",
  edgeLabelFill: "#241f1a",
  edgeLabelStroke: "#3d342a",
  accent: "#e07b3a",
  accentForeground: "#ffffff",
  fontFamily: SERIF_STACK,
  gridDot: "transparent",
}) as ResolvedTheme;

export const PRESETS: Readonly<Record<PresetName, PresetVariants>> = Object.freeze({
  default: Object.freeze({ light: LIGHT_DEFAULTS, dark: DARK_DEFAULTS }),
  linear: Object.freeze({ light: LINEAR_LIGHT, dark: LINEAR_DARK }),
  paper: Object.freeze({ light: PAPER_LIGHT, dark: PAPER_DARK }),
}) as Readonly<Record<PresetName, PresetVariants>>;

export const PRESET_NAMES: readonly PresetName[] = ["default", "linear", "paper"];

export function isPresetName(value: unknown): value is PresetName {
  return typeof value === "string" && (PRESET_NAMES as readonly string[]).includes(value);
}

export function presetBaseline(name: PresetName, dark: boolean): ResolvedTheme {
  return dark ? PRESETS[name].dark : PRESETS[name].light;
}
