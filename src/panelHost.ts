/**
 * Tiny re-parenting helper used by `variantsPanel.setHost` and
 * `filtersPanel.setHost` to move themselves between the desktop rail
 * body and the narrow popover content host when the form factor flips.
 *
 * The DOM moves a node natively on `appendChild` from a different
 * parent — no clone, no rebuild — so the panel's internal state
 * (checkbox ticks, chip elements, event listeners) survives the move.
 */
export function reparent<T extends HTMLElement>(node: T, host: HTMLElement): T {
  host.appendChild(node);
  return node;
}
