import { afterEach, describe, expect, it, vi } from "vitest";
import { createPopover } from "./popover.js";

function setup() {
  const themeHost = document.createElement("div");
  themeHost.style.position = "relative";
  themeHost.style.width = "1000px";
  themeHost.style.height = "600px";
  document.body.appendChild(themeHost);
  const anchor = document.createElement("button");
  anchor.type = "button";
  anchor.textContent = "trigger";
  themeHost.appendChild(anchor);
  return { themeHost, anchor };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createPopover", () => {
  it("appends a popover to the root and returns its element", () => {
    const { themeHost, anchor } = setup();
    const onDismiss = vi.fn();
    const popover = createPopover({ root: themeHost, themeHost, anchor, onDismiss });
    expect(popover.element).toBeInstanceOf(HTMLDivElement);
    expect(themeHost.contains(popover.element)).toBe(true);
  });

  it("dismisses on a pointerdown outside the popover and the anchor", () => {
    const { themeHost, anchor } = setup();
    const onDismiss = vi.fn();
    createPopover({ root: themeHost, themeHost, anchor, onDismiss });
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does NOT dismiss when the user clicks inside the popover", () => {
    const { themeHost, anchor } = setup();
    const onDismiss = vi.fn();
    const popover = createPopover({ root: themeHost, themeHost, anchor, onDismiss });
    const child = document.createElement("span");
    popover.element.appendChild(child);
    child.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("does NOT dismiss when the user clicks the anchor (toolbar handles toggling)", () => {
    const { themeHost, anchor } = setup();
    const onDismiss = vi.fn();
    createPopover({ root: themeHost, themeHost, anchor, onDismiss });
    anchor.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("destroy() removes the popover and stops dismiss-listening", () => {
    const { themeHost, anchor } = setup();
    const onDismiss = vi.fn();
    const popover = createPopover({ root: themeHost, themeHost, anchor, onDismiss });
    popover.destroy();
    expect(themeHost.contains(popover.element)).toBe(false);
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("anchors top + left relative to the host", () => {
    const { themeHost, anchor } = setup();
    // jsdom returns 0×0 rects; this just exercises the math without
    // exploding. We assert the values are finite numbers in pixels.
    const popover = createPopover({
      root: themeHost,
      themeHost,
      anchor,
      onDismiss: () => {
        /* noop */
      },
    });
    expect(popover.element.style.top).toMatch(/^-?\d+(\.\d+)?px$/);
    expect(popover.element.style.left).toMatch(/^-?\d+(\.\d+)?px$/);
    expect(popover.element.style.maxHeight).toMatch(/^\d+px$/);
  });

  it("part attribute is set when provided", () => {
    const { themeHost, anchor } = setup();
    const popover = createPopover({
      root: themeHost,
      themeHost,
      anchor,
      onDismiss: () => {
        /* noop */
      },
      part: "popover",
    });
    expect(popover.element.getAttribute("part")).toBe("popover");
  });

  it("stays visibility:hidden at append-time, cleared after positioning", () => {
    const { themeHost, anchor } = setup();
    const visibilityAtAppend: string[] = [];
    const originalAppendChild = themeHost.appendChild.bind(themeHost);
    themeHost.appendChild = ((node: Node): Node => {
      if (node instanceof HTMLDivElement) {
        visibilityAtAppend.push(node.style.visibility);
      }
      return originalAppendChild(node);
    }) as typeof themeHost.appendChild;

    const popover = createPopover({
      root: themeHost,
      themeHost,
      anchor,
      onDismiss: () => {
        /* noop */
      },
    });

    expect(visibilityAtAppend).toEqual(["hidden"]);
    expect(popover.element.style.visibility).toBe("");
  });

  it("opens upward when a bottom-anchored trigger would overflow downward", () => {
    const { themeHost, anchor } = setup();
    const rect = (r: Partial<DOMRect>): DOMRect =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
        ...r,
      }) as DOMRect;
    // Host 400×600 at the origin; trigger pinned to the bottom edge — opening
    // downward would spill past the host bottom, so it must flip up.
    vi.spyOn(themeHost, "getBoundingClientRect").mockReturnValue(
      rect({ width: 400, height: 600, right: 400, bottom: 600 }),
    );
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(
      rect({ top: 560, left: 300, right: 380, bottom: 590, width: 80, height: 30 }),
    );

    const popover = createPopover({
      root: themeHost,
      themeHost,
      anchor,
      onDismiss: () => {
        /* noop */
      },
    });

    // Flipped above the trigger: top lands well above the trigger's bottom (590).
    expect(Number.parseFloat(popover.element.style.top)).toBeLessThan(560);
  });

  it("re-clamps through a ResizeObserver when one is available", () => {
    const callbacks: Array<() => void> = [];
    class FakeResizeObserver {
      constructor(cb: () => void) {
        callbacks.push(cb);
      }
      observe(): void {
        /* no-op */
      }
      disconnect(): void {
        /* no-op */
      }
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    try {
      const { themeHost, anchor } = setup();
      const popover = createPopover({
        root: themeHost,
        themeHost,
        anchor,
        onDismiss: () => {
          /* noop */
        },
      });
      // The observer is wired (the `typeof ResizeObserver !== "undefined"` path).
      expect(callbacks).toHaveLength(1);
      // Firing it re-runs the clamp — the decisive content-mounted correction.
      callbacks[0]?.();
      expect(popover.element.style.left).toMatch(/px$/);
      // destroy() disconnects the observer (the non-null branch).
      popover.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
