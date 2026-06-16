export type AttributeValue = string | number | boolean | null;

export type Event = {
  caseId: string;
  activity: string;
  timestamp: Date;
  resource: string | null;
  lifecycle: string;
  attributes: Record<string, AttributeValue>;
};

export type Case = {
  id: string;
  events: Event[];
  attributes: Record<string, AttributeValue>;
};

export type LogSchema = {
  caseAttributes: string[];
  eventAttributes: string[];
  columnTypes: Record<string, "string" | "number" | "boolean">;
};

export type EventLog = {
  cases: Map<string, Case>;
  events: Event[];
  schema: LogSchema;
};

export type ParseWarning = {
  row: number;
  reason: string;
};

export type ParseResult = {
  log: EventLog;
  warnings: ParseWarning[];
};

export type CountMode =
  | "absolute"
  | "case"
  | "meanRepetitions"
  | "maxRepetitions"
  | "meanDuration"
  | "medianDuration";

/**
 * Mode-chip family discriminator. Every entry in `COUNT_CHIPS`
 * (toolbar.ts) is tagged with one of these so the chip catalogue
 * can be split into per-section popovers (`#` opens count, `t`
 * opens time) at desktop and a unified two-section popover at
 * narrow widths.
 */
export type ChipSection = "count" | "time";

/**
 * Display labels for the two Mode chip families. Used by the
 * narrow `▾ Mode` popover's section headings. Both desktop and
 * narrow Mode triggers are icon-only (`Σ` / `clock`) so the
 * trigger itself doesn't render these labels.
 */
export const MODE_SECTION_LABELS: Record<ChipSection, string> = {
  count: "Count",
  time: "Time",
};

export type NodeStats = {
  activity: string;
  absoluteFrequency: number;
  caseFrequency: number;
  maxRepetitions: number;
  meanRepetitions: number;
};

export type EdgeStats = {
  from: string;
  to: string;
  absoluteFrequency: number;
  caseFrequency: number;
  maxRepetitions: number;
  meanRepetitions: number;
  durationMs: {
    mean: number;
    median: number;
    min: number;
    max: number;
  };
};

export type Dfg = {
  nodes: Map<string, NodeStats>;
  edges: Map<string, EdgeStats>;
};

export type Variant = {
  sequence: string[];
  count: number;
  percentage: number;
};
