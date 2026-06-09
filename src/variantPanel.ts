import { variantSignature } from "./getVariants.js";
import { setIcon } from "./icons.js";
import type { Variant } from "./types.js";

export type VariantPanelHooks = {
  getVariants(): Variant[];
  getActiveFilter(): string[] | null;
  setActiveFilter(signatures: string[] | null): void;
  /**
   * Phase 24 — read the currently-pinned happy-path sequence. `null`
   * means the overlay is off. The panel renders each row's pin
   * button's pressed state against this value (signature match).
   */
  getHappyPath?(): string[] | null;
  /**
   * Phase 24 — set the pinned happy-path sequence (single-select).
   * Pass `null` to clear. The panel calls this when a pin button is
   * clicked — clicking the pinned row again clears, clicking another
   * row moves the pin to that row's sequence.
   */
  setHappyPath?(sequence: string[] | null): void;
};

export type VariantPanelInstance = {
  update(): void;
  setTopK(k: number): void;
  destroy(): void;
};

export function createVariantPanel(
  host: HTMLElement,
  hooks: VariantPanelHooks,
  opts: { topK: number },
): VariantPanelInstance {
  let topK = opts.topK;
  let expanded = false;
  let lastSignaturesKey: string | null = null;
  let destroyed = false;

  host.classList.add("mining-lib-panel");
  host.setAttribute("part", "controls");

  function signaturesKey(variants: Variant[]): string {
    return variants.map((v) => variantSignature(v.sequence)).join("|");
  }

  function rows(): NodeListOf<HTMLLabelElement> {
    return host.querySelectorAll<HTMLLabelElement>("label.mining-lib-panel-row");
  }

  function checkboxes(): NodeListOf<HTMLInputElement> {
    return host.querySelectorAll<HTMLInputElement>("input[type='checkbox'][data-signature]");
  }

  function applyVisibility(): void {
    const list = rows();
    list.forEach((row, i) => {
      row.hidden = !expanded && i >= topK;
    });
    const button = host.querySelector<HTMLButtonElement>("button.mining-lib-panel-show-all");
    const total = list.length;
    if (total <= topK) {
      button?.remove();
      return;
    }
    if (button) {
      button.textContent = expanded ? `Show top ${topK}` : `Show all (${total})`;
    }
  }

  function syncCheckboxState(): void {
    const filter = hooks.getActiveFilter();
    for (const cb of checkboxes()) {
      const sig = cb.dataset.signature ?? "";
      cb.checked = filter === null || filter.includes(sig);
    }
    syncPinState();
  }

  function syncPinState(): void {
    const happyPath = hooks.getHappyPath?.() ?? null;
    const pinnedSig = happyPath === null ? null : variantSignature(happyPath);
    for (const row of rows()) {
      const pin = row.querySelector<HTMLButtonElement>("button.mining-lib-variant-pin");
      if (!pin) continue;
      const sig = pin.dataset.signature ?? "";
      const pressed = pinnedSig !== null && pinnedSig === sig;
      pin.setAttribute("aria-pressed", pressed ? "true" : "false");
      pin.setAttribute("aria-label", pressed ? "Clear happy path" : "Set as happy path");
      row.classList.toggle("mining-lib-variant-row-pinned", pressed);
    }
  }

  function readSelection(): string[] {
    const selected: string[] = [];
    for (const cb of checkboxes()) {
      if (cb.checked) selected.push(cb.dataset.signature ?? "");
    }
    return selected;
  }

  function emitChange(): void {
    if (destroyed) return;
    const selected = readSelection();
    const total = checkboxes().length;
    if (selected.length === total) {
      hooks.setActiveFilter(null);
    } else {
      hooks.setActiveFilter(selected);
    }
  }

  function onCheckboxChange(): void {
    emitChange();
  }

  function onSelectAllClick(): void {
    if (destroyed) return;
    hooks.setActiveFilter(null);
  }

  function onSelectNoneClick(): void {
    if (destroyed) return;
    hooks.setActiveFilter([]);
  }

  function onExpanderClick(): void {
    if (destroyed) return;
    expanded = !expanded;
    applyVisibility();
  }

  function onPinClick(sequence: readonly string[]): void {
    if (destroyed) return;
    if (!hooks.setHappyPath) return;
    const current = hooks.getHappyPath?.() ?? null;
    const currentSig = current === null ? null : variantSignature(current);
    const targetSig = variantSignature(sequence);
    if (currentSig === targetSig) {
      hooks.setHappyPath(null);
    } else {
      hooks.setHappyPath([...sequence]);
    }
  }

  function fullRender(variants: Variant[]): void {
    host.replaceChildren();
    expanded = false;

    // Phase 24 polish — 3-column header above the variant rows.
    // Uses the same CSS grid template as the row, so labels sit
    // directly above their columns: pin (Happy path) | checkbox +
    // count (Cases) | percentage (%). Hover-title on each cell
    // explains what the column carries.
    const header = document.createElement("div");
    header.className = "mining-lib-panel-header";
    const headerCells: Array<[string, string, string]> = [
      ["happy", "Happy path", "Pin the variant you want highlighted as the canonical flow"],
      [
        "cases",
        "Cases",
        "How many cases follow this variant (and whether it's included in the filter)",
      ],
      ["pct", "%", "Percentage of the total case set"],
    ];
    for (const [key, label, hoverTitle] of headerCells) {
      const cell = document.createElement("span");
      cell.className = `mining-lib-panel-header-cell mining-lib-panel-header-${key}`;
      cell.textContent = label;
      cell.title = hoverTitle;
      header.appendChild(cell);
    }
    host.appendChild(header);

    if (variants.length === 0) return;

    const filter = hooks.getActiveFilter();
    for (const v of variants) {
      const sig = variantSignature(v.sequence);
      const row = document.createElement("label");
      row.className = "mining-lib-panel-row";
      // Tooltip = the activity sequence only. Count + % are already
      // visible in the row, so repeating them in the title is noise.
      // `>` separator matches the user's mental model for "states
      // between arrows" and stays neutral across themes.
      row.title = v.sequence.join(" > ");

      // Phase 24 — pin button comes BEFORE the checkbox so the
      // happy-path designation reads as a primary action on the row.
      // `aria-pressed` + `aria-label` get their final values from
      // `syncPinState()` at the end of fullRender; we set safe
      // defaults here to keep the DOM well-formed in between.
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "mining-lib-variant-pin";
      pin.dataset.signature = sig;
      pin.setAttribute("aria-pressed", "false");
      pin.setAttribute("aria-label", "Set as happy path");
      setIcon(pin, "target");
      // The pin's click toggles happy-path designation. Stop
      // propagation so the wrapping `<label>` does not also fire the
      // checkbox's change event in browsers / jsdom where the label
      // activation hands the click to its first <input>.
      const capturedSequence = v.sequence;
      pin.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onPinClick(capturedSequence);
      });
      row.appendChild(pin);

      // The "Cases" grid cell groups the checkbox + count together —
      // they answer the same question ("which cases are included, and
      // how many?"). The percentage sits in its own cell so it
      // right-aligns under the "%" header.
      const casesCell = document.createElement("span");
      casesCell.className = "mining-lib-panel-row-cases";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.signature = sig;
      checkbox.checked = filter === null || filter.includes(sig);
      checkbox.addEventListener("change", onCheckboxChange);
      casesCell.appendChild(checkbox);

      const count = document.createElement("span");
      count.className = "mining-lib-panel-row-count";
      count.textContent = String(v.count);
      casesCell.appendChild(count);

      row.appendChild(casesCell);

      const pct = document.createElement("span");
      pct.className = "mining-lib-panel-row-pct";
      pct.textContent = `${v.percentage.toFixed(1)}%`;
      row.appendChild(pct);

      host.appendChild(row);
    }

    // List-level actions in one row at the bottom: "All" / "None"
    // (which variants are checked) and the optional "Show all (N) /
    // Show top K" expander (which variants are visible). Grouped
    // because both answer "what do I see / what do I check?" — and
    // moving them below the rows lets the header sit directly above
    // the list, saving a row of vertical chrome.
    const bulk = document.createElement("div");
    bulk.className = "mining-lib-panel-bulk";

    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "mining-lib-panel-bulk-all";
    allBtn.textContent = "All";
    allBtn.addEventListener("click", onSelectAllClick);
    bulk.appendChild(allBtn);

    const noneBtn = document.createElement("button");
    noneBtn.type = "button";
    noneBtn.className = "mining-lib-panel-bulk-none";
    noneBtn.textContent = "None";
    noneBtn.addEventListener("click", onSelectNoneClick);
    bulk.appendChild(noneBtn);

    if (variants.length > topK) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mining-lib-panel-show-all";
      button.addEventListener("click", onExpanderClick);
      bulk.appendChild(button);
    }

    host.appendChild(bulk);

    applyVisibility();
    // Sync pin pressed-state + pinned-row class against the current
    // happy path. Done after the rows are in the DOM so the helper
    // can read each row's signature off `pin.dataset.signature`.
    syncPinState();
  }

  function update(): void {
    if (destroyed) return;
    const variants = hooks.getVariants();
    const key = signaturesKey(variants);
    if (key !== lastSignaturesKey) {
      lastSignaturesKey = key;
      fullRender(variants);
    } else {
      syncCheckboxState();
    }
  }

  // Initial render
  const initialVariants = hooks.getVariants();
  lastSignaturesKey = signaturesKey(initialVariants);
  fullRender(initialVariants);

  return {
    update,
    setTopK(k: number): void {
      if (destroyed) return;
      if (!Number.isInteger(k) || k < 1) {
        throw new TypeError("variantPanel.setTopK: k must be a positive integer");
      }
      topK = k;
      const total = rows().length;
      const existingButton = host.querySelector<HTMLButtonElement>(
        "button.mining-lib-panel-show-all",
      );
      if (total > topK && !existingButton) {
        // Append into the action row at the bottom (created in
        // fullRender). If the row doesn't exist yet (zero variants
        // at first render), there's nothing to expand anyway, so
        // skip silently.
        const bulk = host.querySelector<HTMLDivElement>(".mining-lib-panel-bulk");
        if (bulk) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "mining-lib-panel-show-all";
          button.addEventListener("click", onExpanderClick);
          bulk.appendChild(button);
        }
      }
      applyVisibility();
    },
    destroy(): void {
      destroyed = true;
      host.replaceChildren();
      lastSignaturesKey = null;
    },
  };
}
