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
 * `{ element, update() }` shape, same signature-keyed in-place
 * update (rebuild only when the attribute/value structure changes).
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
  /**
   * Refresh from the latest hook reads. Rebuilds the sections only when the
   * attribute / value structure changes; otherwise syncs selection, counts,
   * and summaries in place so scroll position and open/closed state survive.
   */
  update(): void;
};

export function createCaseAttributesSection(
  hooks: CaseAttributesSectionHooks,
): CaseAttributesSectionInstance {
  const element = document.createElement("div");
  element.className = "mining-lib-attr-sections";

  // Tracks the DOM structure (attributes + each one's ordered value list).
  // While it is unchanged, updates sync checkbox / count / summary text in
  // place instead of rebuilding — so checking a box never resets the panel's
  // scroll position or collapses open <details> sections (the per-render
  // rebuild used to do both). Mirrors createVariantPanel's signature-key
  // pattern.
  let lastStructureKey: string | null = null;

  function structureKey(): string {
    // Counts and active-selection state are deliberately excluded — they
    // change on every filter toggle but never alter the DOM shape, so they
    // are synced in place rather than triggering a rebuild.
    return JSON.stringify(
      hooks
        .getAttributes()
        .map((attribute) => [
          attribute,
          hooks.getRowsFor(attribute).map((row) => [String(row.value), row.displayLabel]),
        ]),
    );
  }

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

  function fullRender(): void {
    element.replaceChildren();
    for (const attribute of hooks.getAttributes()) {
      element.appendChild(buildSection(attribute));
    }
  }

  // Refresh the mutable bits — selected summary, checkbox state, and per-value
  // counts — without touching the DOM structure. Rows align by index with
  // getRowsFor(attribute); this runs only while the structure key is stable,
  // so that order is guaranteed identical to what was rendered.
  function syncInPlace(): void {
    for (const details of element.querySelectorAll<HTMLDetailsElement>(
      "details.mining-lib-attr-section",
    )) {
      // `as` casts (not guards): buildSection / buildRow always create these,
      // and syncInPlace only runs when the structure key is unchanged — so the
      // summary, rows, checkbox, and count element are guaranteed present and
      // index-aligned. Avoiding the null-guards keeps the hot path branch-free.
      const attribute = details.dataset.attribute as string;
      const active = hooks.getActiveValues(attribute);
      const human = humanizeAttributeName(attribute);
      const summary = details.querySelector("summary") as HTMLElement;
      summary.textContent = active.length > 0 ? `${human} · ${active.length} selected` : human;

      const activeSet = new Set<AttributeValue>(active);
      const rowEls = details.querySelectorAll<HTMLLabelElement>(".mining-lib-attr-row");
      hooks.getRowsFor(attribute).forEach((row, i) => {
        const rowEl = rowEls[i] as HTMLLabelElement;
        const checkbox = rowEl.querySelector("input[type='checkbox']") as HTMLInputElement;
        checkbox.checked = activeSet.has(row.value);
        const countEl = rowEl.querySelector(".mining-lib-attr-count") as HTMLElement;
        countEl.textContent = String(row.count);
      });
    }
  }

  return {
    element,
    update(): void {
      const key = structureKey();
      if (key !== lastStructureKey) {
        lastStructureKey = key;
        fullRender();
      } else {
        syncInPlace();
      }
    },
  };
}
