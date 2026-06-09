import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiagramHandle } from "./diagramTypes.js";
import { DEFAULT_CONTROLS } from "./parseControls.js";
import { createToolbar, type ToolbarInstance } from "./toolbar.js";

function makeStubHandle(): DiagramHandle {
  return {
    render: vi.fn(),
    setCountMode: vi.fn(),
    getCountMode: () => "absolute",
    setTheme: vi.fn(),
    getTheme: () => ({ dark: false }) as ReturnType<DiagramHandle["getTheme"]>,
    setPreset: vi.fn(),
    getTransform: () => ({ k: 1, x: 0, y: 0 }),
    zoomTo: vi.fn(),
    resetView: vi.fn(),
    setVariantFilter: vi.fn(),
    getVariantFilter: () => null,
    setFilters: vi.fn(),
    getFilters: () => [],
    select: vi.fn(),
    getSelected: () => null,
    setHappyPathOverlay: vi.fn(),
    getHappyPathOverlay: () => false,
    setControls: vi.fn(),
    destroy: vi.fn(),
  } as unknown as DiagramHandle;
}

function makeRoot(): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return root;
}

let toolbar: ToolbarInstance | null = null;

afterEach(() => {
  toolbar?.destroy();
  toolbar = null;
  document.body.replaceChildren();
});

describe("createToolbar — narrow primary pill (three triggers)", () => {
  it("emits three triggers in order: Mode, Variants, Filters", () => {
    const root = makeRoot();
    toolbar = createToolbar({
      root,
      handle: makeStubHandle(),
      initialCountMode: "absolute",
      initialThemeDark: false,
      initialRankdir: "TB",
      initialZoomScale: 1,
      controls: DEFAULT_CONTROLS,
      primary: "pill",
    });
    const triggers = Array.from(
      root.querySelectorAll<HTMLButtonElement>(".mining-lib-pill-primary button[data-popover]"),
    );
    expect(triggers.map((t) => t.dataset.popover)).toEqual(["mode", "variants", "filters"]);
  });

  it("getVariantsTrigger returns the Variants button at narrow widths", () => {
    const root = makeRoot();
    toolbar = createToolbar({
      root,
      handle: makeStubHandle(),
      initialCountMode: "absolute",
      initialThemeDark: false,
      initialRankdir: "TB",
      initialZoomScale: 1,
      controls: DEFAULT_CONTROLS,
      primary: "pill",
    });
    expect(toolbar.getVariantsTrigger()).not.toBeNull();
    expect(toolbar.getVariantsTrigger()?.dataset.popover).toBe("variants");
  });

  it("getVariantsTrigger returns null at desktop (primary=rails)", () => {
    const root = makeRoot();
    toolbar = createToolbar({
      root,
      handle: makeStubHandle(),
      initialCountMode: "absolute",
      initialThemeDark: false,
      initialRankdir: "TB",
      initialZoomScale: 1,
      controls: DEFAULT_CONTROLS,
      primary: "rails",
    });
    expect(toolbar.getVariantsTrigger()).toBeNull();
    expect(toolbar.getFiltersTrigger()).toBeNull();
  });
});

describe("createToolbar — export (download) trigger", () => {
  function setup(primary: "pill" | "rails"): HTMLElement {
    const root = makeRoot();
    toolbar = createToolbar({
      root,
      handle: makeStubHandle(),
      initialCountMode: "absolute",
      initialThemeDark: false,
      initialRankdir: "TB",
      initialZoomScale: 1,
      controls: DEFAULT_CONTROLS,
      primary,
    });
    return root;
  }

  it("enables the download button (no longer the Phase-14 disabled stub)", () => {
    setup("pill");
    const btn = toolbar?.getExportTrigger() ?? null;
    expect(btn).not.toBeNull();
    expect(btn?.disabled).toBe(false);
  });

  it("titles the download button 'Export image'", () => {
    setup("pill");
    expect(toolbar?.getExportTrigger()?.title).toBe("Export image");
  });

  it("exposes the export trigger at desktop too (it lives in the utilities pill)", () => {
    setup("rails");
    expect(toolbar?.getExportTrigger()).not.toBeNull();
    expect(toolbar?.getExportTrigger()?.dataset.popover).toBe("export");
  });
});

describe("createToolbar — Variants trigger label", () => {
  function setupNarrow(): HTMLElement {
    const root = makeRoot();
    toolbar = createToolbar({
      root,
      handle: makeStubHandle(),
      initialCountMode: "absolute",
      initialThemeDark: false,
      initialRankdir: "TB",
      initialZoomScale: 1,
      controls: DEFAULT_CONTROLS,
      primary: "pill",
    });
    return root;
  }

  it("reads `▾ Variants` (no suffix) by default", () => {
    const root = setupNarrow();
    const btn = root.querySelector<HTMLButtonElement>('button[data-popover="variants"]');
    // textContent collapses spans — the visible label is just the prefix.
    expect(btn?.textContent?.trim()).toBe("▾ Variants");
  });

  it("renders `▾ Variants · 3/8` for a partial tick", () => {
    const root = setupNarrow();
    if (toolbar === null) throw new Error("toolbar not built");
    toolbar.setVariantsTriggerLabel({ ticked: 3, total: 8 });
    const btn = root.querySelector<HTMLButtonElement>('button[data-popover="variants"]');
    expect(btn?.textContent?.replace(/\s+/g, " ").trim()).toBe("▾ Variants · 3/8");
  });

  it("drops the suffix back when ticked equals total (every variant active)", () => {
    const root = setupNarrow();
    if (toolbar === null) throw new Error("toolbar not built");
    toolbar.setVariantsTriggerLabel({ ticked: 3, total: 8 });
    toolbar.setVariantsTriggerLabel({ ticked: 8, total: 8 });
    const btn = root.querySelector<HTMLButtonElement>('button[data-popover="variants"]');
    expect(btn?.textContent?.trim()).toBe("▾ Variants");
  });

  it("drops the suffix when total is 0 (no log loaded)", () => {
    const root = setupNarrow();
    if (toolbar === null) throw new Error("toolbar not built");
    toolbar.setVariantsTriggerLabel({ ticked: 0, total: 0 });
    const btn = root.querySelector<HTMLButtonElement>('button[data-popover="variants"]');
    expect(btn?.textContent?.trim()).toBe("▾ Variants");
  });

  it("setVariantsTriggerLabel is a no-op when called against the desktop toolbar (no trigger)", () => {
    const root = makeRoot();
    toolbar = createToolbar({
      root,
      handle: makeStubHandle(),
      initialCountMode: "absolute",
      initialThemeDark: false,
      initialRankdir: "TB",
      initialZoomScale: 1,
      controls: DEFAULT_CONTROLS,
      primary: "rails",
    });
    expect(() => toolbar?.setVariantsTriggerLabel({ ticked: 1, total: 3 })).not.toThrow();
  });
});

describe("createToolbar — Filters trigger label", () => {
  function setupNarrow(): HTMLElement {
    const root = makeRoot();
    toolbar = createToolbar({
      root,
      handle: makeStubHandle(),
      initialCountMode: "absolute",
      initialThemeDark: false,
      initialRankdir: "TB",
      initialZoomScale: 1,
      controls: DEFAULT_CONTROLS,
      primary: "pill",
    });
    return root;
  }

  it("reads `▾ Filters` (no suffix) by default", () => {
    const root = setupNarrow();
    const btn = root.querySelector<HTMLButtonElement>('button[data-popover="filters"]');
    expect(btn?.textContent?.trim()).toBe("▾ Filters");
  });

  it("renders `▾ Filters · 2` for two active non-variant clauses", () => {
    const root = setupNarrow();
    if (toolbar === null) throw new Error("toolbar not built");
    toolbar.setFiltersTriggerLabel(2);
    const btn = root.querySelector<HTMLButtonElement>('button[data-popover="filters"]');
    expect(btn?.textContent?.replace(/\s+/g, " ").trim()).toBe("▾ Filters · 2");
  });

  it("drops the suffix when count returns to 0", () => {
    const root = setupNarrow();
    if (toolbar === null) throw new Error("toolbar not built");
    toolbar.setFiltersTriggerLabel(3);
    toolbar.setFiltersTriggerLabel(0);
    const btn = root.querySelector<HTMLButtonElement>('button[data-popover="filters"]');
    expect(btn?.textContent?.trim()).toBe("▾ Filters");
  });

  it("setFiltersTriggerLabel is a no-op against the desktop toolbar", () => {
    const root = makeRoot();
    toolbar = createToolbar({
      root,
      handle: makeStubHandle(),
      initialCountMode: "absolute",
      initialThemeDark: false,
      initialRankdir: "TB",
      initialZoomScale: 1,
      controls: DEFAULT_CONTROLS,
      primary: "rails",
    });
    expect(() => toolbar?.setFiltersTriggerLabel(5)).not.toThrow();
  });
});

describe("createToolbar — label suffix uses the trigger-count span (Phase 22 CSS hook)", () => {
  it("the count suffix is wrapped in `.mining-lib-trigger-count` so embedders can style it", () => {
    const root = makeRoot();
    toolbar = createToolbar({
      root,
      handle: makeStubHandle(),
      initialCountMode: "absolute",
      initialThemeDark: false,
      initialRankdir: "TB",
      initialZoomScale: 1,
      controls: DEFAULT_CONTROLS,
      primary: "pill",
    });
    toolbar.setVariantsTriggerLabel({ ticked: 3, total: 8 });
    toolbar.setFiltersTriggerLabel(2);

    const variantsCount = root.querySelector<HTMLElement>(
      'button[data-popover="variants"] .mining-lib-trigger-count',
    );
    const filtersCount = root.querySelector<HTMLElement>(
      'button[data-popover="filters"] .mining-lib-trigger-count',
    );
    expect(variantsCount?.textContent?.trim()).toBe("· 3/8");
    expect(filtersCount?.textContent?.trim()).toBe("· 2");
  });
});
