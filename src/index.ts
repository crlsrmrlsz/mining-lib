// Public API surface for mining-lib.
//
// Importing this module registers the `<mining-lib-diagram>` custom element as
// a side effect. The exports below are kept in Biome's canonical module-path
// order; by concern they cover: input (parseCsv / parseNdjson / parseLog /
// loadLog), the event-log model + DFG (buildDfg / types / getVariants), layout
// and render (layoutDfg / renderDfg / computeFitToView), filtering (case
// attributes / date range / clauses / resources), overlays (terminal-node
// duration / single-case trace / happy path), theming + presets + controls,
// and the diagram factory + handle + image export.
import { registerMiningLibDiagram } from "./MiningLibDiagram.js";

registerMiningLibDiagram();

export { buildDfg } from "./buildDfg.js";
export type { CaseAttributeDistributionRow } from "./caseAttributeFilter.js";
export {
  formatAttributeValue,
  getCaseAttributeDistribution,
  getFilterableCaseAttributes,
  humanizeAttributeName,
  UNSET_VALUE,
} from "./caseAttributeFilter.js";
export type { TerminalNodeDuration } from "./caseDuration.js";
export { getTerminalNodeDurations } from "./caseDuration.js";
export type { CaseSummary, CaseTraceEvent } from "./caseTrace.js";
export { getCaseSummary, getCaseTraceEvents } from "./caseTrace.js";
export type { FitTransform } from "./computeFitToView.js";
export { computeFitToView } from "./computeFitToView.js";
export { createDiagram } from "./createDiagram.js";
export type { DateAnchor, EventVolumeBucket } from "./dateFilter.js";
export {
  bucketCasesByAnchor,
  caseInDateRange,
  formatDateChipLabel,
  formatHistogramBucketTooltip,
  logDateRange,
  msToIsoDate,
  parseDateBound,
} from "./dateFilter.js";
export type {
  CreateDiagramConfig,
  DiagramHandle,
  PngExportConfig,
  SelectionTarget,
  ViewTransform,
  ZoomConfig,
} from "./diagramTypes.js";
export type { ExportSvgOptions, PngExportOptions } from "./exportImage.js";
export { buildExportSvgString, svgStringToPngBlob, triggerDownload } from "./exportImage.js";
export type { FilterClause } from "./filterClauses.js";
export type { ResourceBreakdownRow } from "./getResourceBreakdown.js";
export { getResourceBreakdown, logHasResources } from "./getResourceBreakdown.js";
export { getVariants } from "./getVariants.js";
export { computeHappyPathOverlay, happyPathEdgeKey } from "./happyPath.js";
export type { DfgLayout, EdgeLayout, LayoutOptions, NodeLayout } from "./layoutDfg.js";
export { layoutDfg, pickCount } from "./layoutDfg.js";
export type { LoadLogResult } from "./logCache.js";
export { clearLogCache, loadLog } from "./logCache.js";
export type { ControlsConfig } from "./parseControls.js";
export { parseControls } from "./parseControls.js";
export { parseCsv } from "./parseCsv.js";
export { detectLogFormat, parseLog, parseNdjson } from "./parseNdjson.js";
export type { PresetName, PresetVariants } from "./presets.js";
export { isPresetName, PRESET_NAMES, PRESETS } from "./presets.js";
export { renderDfg } from "./renderDfg.js";
export type { ResolvedTheme, Theme } from "./theme.js";
export type {
  AttributeValue,
  Case,
  CountMode,
  Dfg,
  EdgeStats,
  Event,
  EventLog,
  LogSchema,
  NodeStats,
  ParseResult,
  ParseWarning,
  Variant,
} from "./types.js";
