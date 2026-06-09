/**
 * Selection-pill case-attributes block (Phase 25).
 *
 * Mounts below the existing Filter / Resources rows when the
 * clicked node has case-attribute variation among its incident
 * cases. One labelled sub-section per filterable case:* attribute,
 * each with a column of toggle-button rows mirroring the
 * resourceBreakdownBlock UX precedent.
 *
 * Dumb factory — rows arrive pre-formatted via `getRowsFor` at the
 * createDiagram boundary (see §6). Click a row, `onToggle` runs,
 * the caller decides what to do (push a setFilters call).
 */

import type { AttributeValue } from "./types.js";

export type CaseAttributesBlockRow = {
  value: AttributeValue;
  displayLabel: string;
  count: number;
};

export type CaseAttributesBlockSection = {
  attribute: string;
  humanLabel: string;
  distribution: ReadonlyArray<CaseAttributesBlockRow>;
};

export type CaseAttributesBlockHooks = {
  /** Values currently filtered on `attribute` — drives row active state. */
  getActiveValues(attribute: string): ReadonlyArray<AttributeValue>;
  /** User clicked a row. Caller pushes the resulting setFilters call. */
  onToggle(attribute: string, value: AttributeValue): void;
};

export type CaseAttributesBlockInstance = {
  element: HTMLElement;
  destroy(): void;
};

export function createCaseAttributesBlock(
  sections: ReadonlyArray<CaseAttributesBlockSection>,
  hooks: CaseAttributesBlockHooks,
): CaseAttributesBlockInstance {
  const element = document.createElement("div");
  element.className = "mining-lib-pill-attrs";

  for (const section of sections) {
    element.appendChild(buildSection(section, hooks));
  }

  return {
    element,
    destroy(): void {
      element.remove();
    },
  };
}

function buildSection(
  section: CaseAttributesBlockSection,
  hooks: CaseAttributesBlockHooks,
): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "mining-lib-pill-attr-section";
  wrap.dataset.attribute = section.attribute;

  const label = document.createElement("div");
  label.className = "mining-lib-pill-attr-label";
  label.textContent = section.humanLabel;
  wrap.appendChild(label);

  const active = new Set<AttributeValue>(hooks.getActiveValues(section.attribute));
  for (const row of section.distribution) {
    wrap.appendChild(buildRow(section.attribute, row, active.has(row.value), hooks));
  }
  return wrap;
}

function buildRow(
  attribute: string,
  row: CaseAttributesBlockRow,
  isActive: boolean,
  hooks: CaseAttributesBlockHooks,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mining-lib-pill-attr-row";
  if (isActive) btn.classList.add("mining-lib-pill-attr-row-active");
  btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  btn.addEventListener("click", () => hooks.onToggle(attribute, row.value));

  const valueSpan = document.createElement("span");
  valueSpan.className = "mining-lib-pill-attr-value";
  valueSpan.textContent = row.displayLabel;
  btn.appendChild(valueSpan);

  const countSpan = document.createElement("span");
  countSpan.className = "mining-lib-pill-attr-count";
  countSpan.textContent = String(row.count);
  btn.appendChild(countSpan);

  return btn;
}
