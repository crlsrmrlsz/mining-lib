/**
 * Lucide-style line icons for the chrome (Mode pill, utilities pill,
 * zoom pill). Each entry is the inline SVG markup as a string —
 * embedders see no extra dependency. The paths are taken from the
 * MIT-licensed Lucide icon set (https://lucide.dev) and kept at
 * Lucide's canonical 24×24 viewBox so the visual weight stays
 * consistent across glyphs.
 *
 * `currentColor` on stroke makes every icon inherit the button's
 * text colour, so theme tokens (`--mining-node-text`,
 * `--mining-accent-fg`) flow through unchanged.
 */

const SVG_BASE =
  'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

export type IconName =
  | "sigma"
  | "clock"
  | "rotateCcw"
  | "download"
  | "moon"
  | "sun"
  | "plus"
  | "minus"
  | "route"
  | "filter"
  | "target"
  | "layoutVertical"
  | "layoutHorizontal";

export const ICONS: Record<IconName, string> = {
  // Count / sum / total — capital sigma drawn as a chevron.
  sigma: `<svg ${SVG_BASE}><path d="M18 7V5a2 2 0 0 0-2-2H6l8 9-8 9h10a2 2 0 0 0 2-2v-2"/></svg>`,
  // Time — clock face with the hands at 10-past.
  clock: `<svg ${SVG_BASE}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  // Reset view — counterclockwise rotation arrow.
  rotateCcw: `<svg ${SVG_BASE}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`,
  // Export / download.
  download: `<svg ${SVG_BASE}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
  // Toggle to dark theme.
  moon: `<svg ${SVG_BASE}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
  // Toggle to light theme.
  sun: `<svg ${SVG_BASE}><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
  // Zoom in.
  plus: `<svg ${SVG_BASE}><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
  // Zoom out.
  minus: `<svg ${SVG_BASE}><path d="M5 12h14"/></svg>`,
  // Variants tab — a route with stop markers (start + end circles).
  route: `<svg ${SVG_BASE}><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>`,
  // Filters tab — funnel.
  filter: `<svg ${SVG_BASE}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
  // Selection tab — bullseye / target.
  target: `<svg ${SVG_BASE}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  // Layout direction — two nodes stacked top-to-bottom (vertical / TB flow).
  layoutVertical: `<svg ${SVG_BASE}><rect x="8" y="2" width="8" height="6" rx="1"/><rect x="8" y="16" width="8" height="6" rx="1"/><path d="M12 8v8"/><path d="m9 13 3 3 3-3"/></svg>`,
  // Layout direction — two nodes side by side, left-to-right (horizontal / LR flow).
  layoutHorizontal: `<svg ${SVG_BASE}><rect x="2" y="8" width="6" height="8" rx="1"/><rect x="16" y="8" width="6" height="8" rx="1"/><path d="M8 12h8"/><path d="m13 9 3 3-3 3"/></svg>`,
};

/**
 * Replace a button's contents with the named icon. Sets a
 * `data-icon` attribute so tests can identify the active glyph
 * without inspecting the DOM tree.
 *
 * The SVG markup is parsed once per icon into a cached
 * `<template>` element; every subsequent set deep-clones the
 * parsed fragment via `cloneNode(true)`. `replaceChildren`
 * swaps the contents atomically (one DOM mutation, not N
 * removeChild calls).
 */
const templateCache = new Map<IconName, HTMLTemplateElement>();

export function setIcon(el: HTMLElement, name: IconName): void {
  let template = templateCache.get(name);
  if (template === undefined) {
    template = document.createElement("template");
    template.innerHTML = ICONS[name];
    templateCache.set(name, template);
  }
  el.dataset.icon = name;
  el.replaceChildren(template.content.cloneNode(true));
}
