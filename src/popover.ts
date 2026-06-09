export type PopoverInstance = {
  readonly element: HTMLDivElement;
  destroy(): void;
};

export type PopoverOptions = {
  root: ShadowRoot | HTMLElement;
  themeHost: HTMLElement;
  anchor: HTMLElement;
  onDismiss(): void;
  part?: string;
  /** Accessible name announced when the popover opens (role="dialog"). */
  ariaLabel?: string;
};

export function createPopover(opts: PopoverOptions): PopoverInstance {
  const { root, themeHost, anchor, onDismiss, part, ariaLabel } = opts;

  const popover = document.createElement("div");
  popover.className = "mining-lib-popover";
  // Accessibility (Phase 38-II B3): a labelled dialog so screen readers
  // announce the popover and its purpose on open.
  popover.setAttribute("role", "dialog");
  if (ariaLabel) popover.setAttribute("aria-label", ariaLabel);
  if (part) popover.setAttribute("part", part);

  const MARGIN = 12;
  const GAP = 4;

  // Clamp the popover inside the host on BOTH axes, using its *rendered* size.
  // This must run after the content panel/menu is parented in — callers add
  // that content only after `createPopover` returns, so the size isn't known
  // yet at construction. The ResizeObserver below re-runs this the moment the
  // content lands (and on any later content resize), which is what keeps a
  // wide Filters panel or a bottom-anchored Export menu from spilling
  // off-screen. `getBoundingClientRect` is read live each call so the clamp
  // tracks the trigger/host even if they have moved.
  const position = (): void => {
    const triggerRect = anchor.getBoundingClientRect();
    const hostRect = themeHost.getBoundingClientRect();
    popover.style.maxHeight = `${Math.max(120, Math.floor(hostRect.height * 0.6))}px`;

    // `width: max-content` means the rendered size depends on content; read it
    // back rather than assume. Fallbacks guard the degenerate zero-size case.
    const popWidth = popover.offsetWidth || 220;
    const popHeight = popover.offsetHeight || 120;

    // Horizontal: anchor to the trigger's left edge, then slide left so the
    // right edge keeps a MARGIN gap from the host's right edge.
    const desiredLeft = triggerRect.left - hostRect.left;
    const maxLeft = Math.max(MARGIN, hostRect.width - popWidth - MARGIN);
    popover.style.left = `${Math.max(MARGIN, Math.min(desiredLeft, maxLeft))}px`;

    // Vertical: prefer opening below the trigger. If that overflows the host
    // bottom and there's more room above (the Export/utilities trigger sits on
    // the bottom-anchored pill at narrow widths), flip to open upward. Then
    // clamp into [MARGIN, host-bottom - MARGIN] so it never leaves the host.
    const below = triggerRect.bottom - hostRect.top + GAP;
    const above = triggerRect.top - hostRect.top - GAP - popHeight;
    const spaceBelow = hostRect.height - (triggerRect.bottom - hostRect.top);
    const spaceAbove = triggerRect.top - hostRect.top;
    const flipUp = below + popHeight > hostRect.height - MARGIN && spaceAbove > spaceBelow;
    const desiredTop = flipUp ? above : below;
    const maxTop = Math.max(MARGIN, hostRect.height - popHeight - MARGIN);
    popover.style.top = `${Math.max(MARGIN, Math.min(desiredTop, maxTop))}px`;
  };

  // The popover is `width: max-content`, so positioning needs the rendered
  // size. Append, then position. Visibility is held at `hidden` during the
  // first measure and cleared once it lands — measurement still works because
  // `visibility: hidden` retains layout — so the reveal is never observed at a
  // half-computed position.
  popover.style.visibility = "hidden";
  root.appendChild(popover);
  position();
  popover.style.visibility = "";
  // WebKit defers the style recalc triggered by the hidden→visible flip
  // above. Callers append the popover's content (the Filters / Variants
  // panel) immediately after — and because `visibility` inherits, that
  // content would pick up the *stale* `hidden` and stay
  // computed-hidden until the next reflow, even though it paints. That
  // breaks Playwright's visibility actionability and screen-reader
  // semantics on WebKit (Chromium/Gecko recompute eagerly, so they never
  // saw it). Force the recalc to commit the visible state now, before any
  // child is parented in. `getComputedStyle` flushes pending style on all
  // engines; the read is the side effect.
  void getComputedStyle(popover).visibility;

  let destroyed = false;

  // Re-clamp whenever the popover's own size changes. The decisive case is the
  // synchronous content parenting that every caller does right after this
  // function returns (an empty 120 px envelope becomes a ~300 px panel): the
  // observer fires before paint and corrects the position, so the panel never
  // shows up half off-screen. It also covers later content growth (expanding a
  // filter section, chips wrapping). Re-clamping only writes `top`/`left`, which
  // doesn't change the observed size, so there is no feedback loop. Guarded like
  // the host observer in createDiagram: jsdom (unit tests) has no ResizeObserver,
  // and the initial synchronous `position()` above already places the popover.
  const resizeObserver =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          if (destroyed) return;
          position();
        })
      : null;
  resizeObserver?.observe(popover);

  const onPointer = (event: Event): void => {
    if (destroyed) return;
    const path = event.composedPath();
    if (path.includes(popover) || path.includes(anchor)) return;
    onDismiss();
  };
  // Capture phase so we react before app-level click handlers can move
  // focus or rerender — matches the "click-outside dismisses" intent.
  document.addEventListener("pointerdown", onPointer, true);

  return {
    element: popover,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      resizeObserver?.disconnect();
      document.removeEventListener("pointerdown", onPointer, true);
      popover.remove();
    },
  };
}
