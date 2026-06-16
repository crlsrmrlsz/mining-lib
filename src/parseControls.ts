/**
 * `controls` attribute parsing. Each token gates exactly one
 * chrome surface: per-pill granularity for the top-centre row
 * (mode / variants / filters), plus utilities (`tr`), zoom
 * (`bl`), and the floating selection pill (`selection`).
 *
 * Phase 29 rename (2026-05-22):
 *  - `primary` → `mode variants filters` (Phase 22 had split the
 *    top-centre row into independent pills; the umbrella token
 *    was stale).
 *  - `ctx` → `selection` (the Phase-14 "ctx" referred to a
 *    contextual side panel that died in Phase 22; today the
 *    token gates the floating selection pill).
 *
 * Old token names parse with a one-shot `console.warn` per
 * session and map to their new equivalents. Aliases will be
 * removed in Phase 30 (mirrors Phase 19's chip-fill rename
 * playbook).
 */

export type ControlsConfig = {
  mode: boolean;
  variants: boolean;
  filters: boolean;
  tr: boolean;
  bl: boolean;
  selection: boolean;
};

const ALL_ON: ControlsConfig = Object.freeze({
  mode: true,
  variants: true,
  filters: true,
  tr: true,
  bl: true,
  selection: true,
}) as ControlsConfig;

const ALL_OFF: ControlsConfig = Object.freeze({
  mode: false,
  variants: false,
  filters: false,
  tr: false,
  bl: false,
  selection: false,
}) as ControlsConfig;

const KNOWN_TOKENS = ["mode", "variants", "filters", "tr", "bl", "selection"] as const;

const DEPRECATED_TOKENS: Readonly<Record<string, ReadonlyArray<keyof ControlsConfig>>> = {
  primary: ["mode", "variants", "filters"],
  ctx: ["selection"],
};

// Module-scoped de-dup so each deprecated token warns at most
// once per page lifetime, no matter how many <mining-lib-diagram>
// instances pass it through `controls`.
const deprecationWarned = new Set<string>();

function warnDeprecated(oldToken: string, replacement: ReadonlyArray<keyof ControlsConfig>): void {
  if (deprecationWarned.has(oldToken)) return;
  deprecationWarned.add(oldToken);
  console.warn(
    `[mining-lib] "controls" token "${oldToken}" is deprecated; use "${replacement.join(" ")}". Will be removed in Phase 30.`,
  );
}

export function parseControls(value: string | null | undefined): ControlsConfig {
  if (value === null || value === undefined) return { ...ALL_ON };
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "all") return { ...ALL_ON };
  if (trimmed === "none") return { ...ALL_OFF };
  const tokens = trimmed.split(/\s+/);
  const result: ControlsConfig = { ...ALL_OFF };
  let warnedUnknown = false;
  for (const token of tokens) {
    if ((KNOWN_TOKENS as readonly string[]).includes(token)) {
      result[token as keyof ControlsConfig] = true;
      continue;
    }
    const expansion = DEPRECATED_TOKENS[token];
    if (expansion !== undefined) {
      warnDeprecated(token, expansion);
      for (const target of expansion) {
        result[target] = true;
      }
      continue;
    }
    if (!warnedUnknown) {
      warnedUnknown = true;
      console.warn(
        `[mining-lib] unknown controls token: "${token}". Valid tokens: ${KNOWN_TOKENS.join(", ")}, "all", "none".`,
      );
    }
  }
  return result;
}

export const DEFAULT_CONTROLS: ControlsConfig = ALL_ON;

export function serializeControls(c: ControlsConfig): string {
  if (c.mode && c.variants && c.filters && c.tr && c.bl && c.selection) return "all";
  if (!c.mode && !c.variants && !c.filters && !c.tr && !c.bl && !c.selection) return "none";
  const parts: string[] = [];
  if (c.mode) parts.push("mode");
  if (c.variants) parts.push("variants");
  if (c.filters) parts.push("filters");
  if (c.tr) parts.push("tr");
  if (c.bl) parts.push("bl");
  if (c.selection) parts.push("selection");
  return parts.join(" ");
}
