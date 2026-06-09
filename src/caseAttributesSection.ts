/**
 * Filters-panel case-attribute sections (Phase 25).
 *
 * One collapsible `<details>` section per filterable `case:*`
 * attribute, with a checkbox per distinct value. Lives inside the
 * Filters popover beneath the Active-chips row.
 *
 * The section is intentionally dumb — `getRowsFor(attribute)` is
 * expected to hand back rows whose `displayLabel` is already
 * formatted (via `formatAttributeValue` upstream) and whose
 * `value` is the raw `AttributeValue` (with `null` replaced by
 * `UNSET_VALUE` upstream when the caller wants the sentinel
 * round-trip). `onToggle` simply forwards `value` back — the
 * clause helpers translate at the matcher boundary.
 *
 * Architectural sibling of `createVariantPanel` — same
 * `{ element, update() }` shape, same per-render rebuild.
 */

import { humanizeAttributeName } from "./caseAttributeFilter.js";
import type { AttributeValue } from "./types.js";

export type CaseAttributesSectionRow = {
  value: AttributeValue;
  displayLabel: string;
  count: number;
};

export type CaseAttributesSectionHooks = {
  /** Filterable case:* attributes, in display order. */
  getAttributes(): string[];
  /** Distinct-value rows for one attribute. */
  getRowsFor(attribute: string): CaseAttributesSectionRow[];
  /** Values currently filtered on `attribute` — drives checkbox state. */
  getActiveValues(attribute: string): AttributeValue[];
  /** User toggled a value. The caller pushes a `setFilters(...)` call. */
  onToggle(attribute: string, value: AttributeValue): void;
};

export type CaseAttributesSectionInstance = {
  element: HTMLElement;
  /** Rebuild every section from scratch off the latest hook reads. */
  update(): void;
};

export function createCaseAttributesSection(
  hooks: CaseAttributesSectionHooks,
): CaseAttributesSectionInstance {
  const element = document.createElement("div");
  element.className = "mining-lib-attr-sections";

  function buildSection(attribute: string): HTMLDetailsElement {
    const details = document.createElement("details");
    details.className = "mining-lib-attr-section";
    details.open = true;
    details.dataset.attribute = attribute;

    const summary = document.createElement("summary");
    const human = humanizeAttributeName(attribute);
    const active = hooks.getActiveValues(attribute);
    summary.textContent = active.length > 0 ? `${human} · ${active.length} selected` : human;
    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "mining-lib-attr-body";

    const activeSet = new Set<AttributeValue>(active);
    for (const row of hooks.getRowsFor(attribute)) {
      body.appendChild(buildRow(attribute, row, activeSet.has(row.value)));
    }

    details.appendChild(body);
    return details;
  }

  function buildRow(
    attribute: string,
    row: CaseAttributesSectionRow,
    checked: boolean,
  ): HTMLLabelElement {
    const label = document.createElement("label");
    label.className = "mining-lib-attr-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.addEventListener("change", () => {
      hooks.onToggle(attribute, row.value);
    });
    label.appendChild(checkbox);

    const valueSpan = document.createElement("span");
    valueSpan.className = "mining-lib-attr-value";
    valueSpan.textContent = row.displayLabel;
    label.appendChild(valueSpan);

    const countSpan = document.createElement("span");
    countSpan.className = "mining-lib-attr-count";
    countSpan.textContent = String(row.count);
    label.appendChild(countSpan);

    return label;
  }

  return {
    element,
    update(): void {
      element.replaceChildren();
      for (const attribute of hooks.getAttributes()) {
        element.appendChild(buildSection(attribute));
      }
    },
  };
}
