/**
 * Variants panel (Phase 22).
 *
 * A thin `<details>` wrapper that owns the collapsible "Variants"
 * section in the chrome. The actual variant checkbox list is owned by
 * `createVariantPanel` (singular, from `variantPanel.ts`) and mounts
 * into `variantHost` — so this module is purely the section shell +
 * lifecycle plumbing (re-parent between rail body and narrow popover).
 *
 * Split out from `filtersPanel.ts` so the chrome can mount it as a
 * sibling of the slimmed `createFiltersPanel` (Active chips row).
 * `▾ Variants` is its own primary-pill trigger at narrow widths; in
 * the desktop rail the two panels stack with a divider between them.
 */
import { reparent } from "./panelHost.js";

export type VariantsPanelInstance = {
  /** Root `<details>` element. Move with `setHost(newHost)`. */
  element: HTMLElement;
  /** Empty container where `createVariantPanel(host, …)` mounts. */
  variantHost: HTMLElement;
  /** Re-parent under `newHost` without rebuilding internal state. */
  setHost(newHost: HTMLElement): void;
  destroy(): void;
};

export function createVariantsPanel(host: HTMLElement): VariantsPanelInstance {
  // Plain `<div>` since the popover trigger already names the section
  // ("▾ Variants"). The earlier `<details><summary>Variants</summary>`
  // duplicated that label inside the popover; the disclosure
  // collapse isn't needed because the popover itself opens/closes.
  const element = document.createElement("div");
  element.className = "mining-lib-variants-panel";
  element.setAttribute("part", "variants-panel");

  const variantHost = document.createElement("div");
  variantHost.className = "mining-lib-filters-variants-host";
  element.appendChild(variantHost);

  host.appendChild(element);

  return {
    element,
    variantHost,
    setHost(newHost: HTMLElement): void {
      reparent(element, newHost);
    },
    destroy(): void {
      element.remove();
    },
  };
}
