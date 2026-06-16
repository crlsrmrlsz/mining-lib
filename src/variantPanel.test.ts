import { afterEach, describe, expect, it, vi } from "vitest";
import { variantSignature } from "./getVariants.js";
import type { Variant } from "./types.js";
import { createVariantPanel, type VariantPanelHooks } from "./variantPanel.js";

function makeVariants(...sequences: string[][]): Variant[] {
  const total = sequences.length;
  return sequences.map((seq) => ({
    sequence: seq,
    count: 1,
    percentage: total === 0 ? 0 : (1 / total) * 100,
  }));
}

function makeHooks(
  initial: { variants?: Variant[]; filter?: string[] | null; happyPath?: string[] | null } = {},
): VariantPanelHooks & {
  variants: Variant[];
  filter: string[] | null;
  happyPath: string[] | null;
  setActiveFilter: ReturnType<typeof vi.fn>;
  setHappyPath: ReturnType<typeof vi.fn>;
} {
  const state = {
    variants: initial.variants ?? [],
    filter: initial.filter ?? null,
    happyPath: initial.happyPath ?? null,
  };
  const setActiveFilter = vi.fn((sigs: string[] | null) => {
    state.filter = sigs;
  });
  const setHappyPath = vi.fn((seq: string[] | null) => {
    state.happyPath = seq === null ? null : [...seq];
  });
  return {
    get variants() {
      return state.variants;
    },
    set variants(v: Variant[]) {
      state.variants = v;
    },
    get filter() {
      return state.filter;
    },
    set filter(f: string[] | null) {
      state.filter = f;
    },
    get happyPath() {
      return state.happyPath;
    },
    set happyPath(p: string[] | null) {
      state.happyPath = p;
    },
    getVariants: () => state.variants,
    getActiveFilter: () => state.filter,
    setActiveFilter,
    getHappyPath: () => state.happyPath,
    setHappyPath,
  };
}

function makeHost(): HTMLDivElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createVariantPanel — construction", () => {
  it("decorates the host with class + part attributes", () => {
    const host = makeHost();
    const hooks = makeHooks();
    createVariantPanel(host, hooks, { topK: 5 });
    expect(host.classList.contains("mining-lib-panel")).toBe(true);
    expect(host.getAttribute("part")).toBe("controls");
  });

  it("renders a 3-column header (Happy path | Cases | %) and no redundant 'Variants' title", () => {
    const host = makeHost();
    const hooks = makeHooks({ variants: makeVariants(["a"]) });
    createVariantPanel(host, hooks, { topK: 5 });
    // The "Variants" title is dropped — the popover trigger that
    // hosts the panel already names it.
    expect(host.querySelector(".mining-lib-panel-title")).toBeNull();
    // The header carries three labeled cells whose grid columns match
    // the row columns below: pin | checkbox+count | percentage.
    const header = host.querySelector(".mining-lib-panel-header");
    expect(header).not.toBeNull();
    expect(header?.querySelector(".mining-lib-panel-header-happy")?.textContent).toBe("Happy path");
    expect(header?.querySelector(".mining-lib-panel-header-cases")?.textContent).toBe("Cases");
    expect(header?.querySelector(".mining-lib-panel-header-pct")?.textContent).toBe("%");
  });

  it("renders the 3-column header when variants are present", () => {
    const host = makeHost();
    const hooks = makeHooks({ variants: makeVariants(["a"], ["b"]) });
    createVariantPanel(host, hooks, { topK: 5 });
    expect(host.querySelector(".mining-lib-panel-title")).toBeNull();
    expect(host.querySelector(".mining-lib-panel-header")).not.toBeNull();
  });

  it("renders bulk 'All' / 'None' buttons when variants are present", () => {
    const host = makeHost();
    const hooks = makeHooks({ variants: makeVariants(["a"], ["b"]) });
    createVariantPanel(host, hooks, { topK: 5 });
    expect(host.querySelector("button.mining-lib-panel-bulk-all")?.textContent).toBe("All");
    expect(host.querySelector("button.mining-lib-panel-bulk-none")?.textContent).toBe("None");
  });

  it("renders no rows / no bulk buttons when variants is empty", () => {
    const host = makeHost();
    const hooks = makeHooks({ variants: [] });
    createVariantPanel(host, hooks, { topK: 5 });
    expect(host.querySelectorAll("input[type='checkbox']").length).toBe(0);
    expect(host.querySelector("button.mining-lib-panel-bulk-all")).toBeNull();
  });
});

describe("createVariantPanel — bulk buttons", () => {
  it("clicking 'All' calls setActiveFilter(null)", () => {
    const host = makeHost();
    const hooks = makeHooks({
      variants: makeVariants(["a"], ["b"], ["c"]),
      filter: [variantSignature(["a"])],
    });
    createVariantPanel(host, hooks, { topK: 5 });
    host.querySelector<HTMLButtonElement>("button.mining-lib-panel-bulk-all")?.click();
    expect(hooks.setActiveFilter).toHaveBeenCalledWith(null);
  });

  it("clicking 'None' calls setActiveFilter([])", () => {
    const host = makeHost();
    const hooks = makeHooks({ variants: makeVariants(["a"], ["b"]) });
    createVariantPanel(host, hooks, { topK: 5 });
    host.querySelector<HTMLButtonElement>("button.mining-lib-panel-bulk-none")?.click();
    expect(hooks.setActiveFilter).toHaveBeenLastCalledWith([]);
  });
});

describe("createVariantPanel — rows", () => {
  it("renders one label + checkbox row per variant", () => {
    const host = makeHost();
    const variants = makeVariants(["a", "b"], ["c"], ["d", "e", "f"]);
    const hooks = makeHooks({ variants });
    createVariantPanel(host, hooks, { topK: 5 });

    const rows = host.querySelectorAll("label");
    expect(rows.length).toBe(3);
    const checkboxes = host.querySelectorAll("input[type='checkbox']");
    expect(checkboxes.length).toBe(3);
  });

  it("each checkbox carries data-signature equal to variantSignature(sequence)", () => {
    const host = makeHost();
    const variants = makeVariants(["a", "b"], ["c"]);
    const hooks = makeHooks({ variants });
    createVariantPanel(host, hooks, { topK: 5 });

    const checkboxes = host.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    expect(checkboxes[0]?.dataset.signature).toBe(variantSignature(["a", "b"]));
    expect(checkboxes[1]?.dataset.signature).toBe(variantSignature(["c"]));
  });

  it("row title shows the activity sequence joined by ' > ' (no count or % duplication)", () => {
    const host = makeHost();
    const variants: Variant[] = [
      { sequence: ["submitted", "review", "approved"], count: 5, percentage: 50 },
    ];
    const hooks = makeHooks({ variants });
    createVariantPanel(host, hooks, { topK: 5 });

    const label = host.querySelector("label");
    const title = label?.getAttribute("title") ?? "";
    expect(title).toBe("submitted > review > approved");
    expect(title).not.toContain("cases");
    expect(title).not.toContain("%");
  });

  it("row text contains count and percentage", () => {
    const host = makeHost();
    const variants: Variant[] = [{ sequence: ["a"], count: 234, percentage: 23.4 }];
    const hooks = makeHooks({ variants });
    createVariantPanel(host, hooks, { topK: 5 });

    const label = host.querySelector("label");
    const text = label?.textContent ?? "";
    expect(text).toContain("234");
    expect(text).toContain("23.4");
  });

  it("default selection: all checkboxes checked when filter is null", () => {
    const host = makeHost();
    const variants = makeVariants(["a"], ["b"], ["c"]);
    const hooks = makeHooks({ variants, filter: null });
    createVariantPanel(host, hooks, { topK: 5 });

    const checkboxes = host.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    for (const cb of checkboxes) expect(cb.checked).toBe(true);
  });

  it("with active filter, only matching checkboxes are checked", () => {
    const host = makeHost();
    const variants = makeVariants(["a"], ["b"], ["c"]);
    const hooks = makeHooks({
      variants,
      filter: [variantSignature(["a"]), variantSignature(["c"])],
    });
    createVariantPanel(host, hooks, { topK: 5 });

    const checkboxes = host.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    expect(checkboxes[0]?.checked).toBe(true);
    expect(checkboxes[1]?.checked).toBe(false);
    expect(checkboxes[2]?.checked).toBe(true);
  });
});

describe("createVariantPanel — top-K + expander", () => {
  it("with topK >= total: no expander, all rows visible", () => {
    const host = makeHost();
    const variants = makeVariants(["a"], ["b"]);
    const hooks = makeHooks({ variants });
    createVariantPanel(host, hooks, { topK: 5 });

    const button = host.querySelector("button.mining-lib-panel-show-all");
    expect(button).toBeNull();
    const rows = host.querySelectorAll<HTMLLabelElement>("label");
    for (const r of rows) expect(r.hidden).toBe(false);
  });

  it("with topK=2 and 4 variants: rows 2,3 hidden; expander present", () => {
    const host = makeHost();
    const variants = makeVariants(["a"], ["b"], ["c"], ["d"]);
    const hooks = makeHooks({ variants });
    createVariantPanel(host, hooks, { topK: 2 });

    const rows = host.querySelectorAll<HTMLLabelElement>("label");
    expect(rows[0]?.hidden).toBe(false);
    expect(rows[1]?.hidden).toBe(false);
    expect(rows[2]?.hidden).toBe(true);
    expect(rows[3]?.hidden).toBe(true);

    const button = host.querySelector("button.mining-lib-panel-show-all");
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain("Show all");
    expect(button?.textContent).toContain("4");
  });

  it("clicking expander unhides every row and toggles button text to 'Show top K'", () => {
    const host = makeHost();
    const variants = makeVariants(["a"], ["b"], ["c"], ["d"]);
    const hooks = makeHooks({ variants });
    createVariantPanel(host, hooks, { topK: 2 });

    const button = host.querySelector<HTMLButtonElement>("button.mining-lib-panel-show-all");
    button?.click();

    const rows = host.querySelectorAll<HTMLLabelElement>("label");
    for (const r of rows) expect(r.hidden).toBe(false);
    expect(button?.textContent).toContain("Show top");
    expect(button?.textContent).toContain("2");
  });

  it("clicking the expander twice collapses back to top-K", () => {
    const host = makeHost();
    const variants = makeVariants(["a"], ["b"], ["c"], ["d"]);
    const hooks = makeHooks({ variants });
    createVariantPanel(host, hooks, { topK: 2 });

    const button = host.querySelector<HTMLButtonElement>("button.mining-lib-panel-show-all");
    button?.click();
    button?.click();

    const rows = host.querySelectorAll<HTMLLabelElement>("label");
    expect(rows[0]?.hidden).toBe(false);
    expect(rows[1]?.hidden).toBe(false);
    expect(rows[2]?.hidden).toBe(true);
    expect(rows[3]?.hidden).toBe(true);
  });

  it("expander does not change checked state of any row", () => {
    const host = makeHost();
    const variants = makeVariants(["a"], ["b"], ["c"], ["d"]);
    const hooks = makeHooks({ variants });
    createVariantPanel(host, hooks, { topK: 2 });

    const before = Array.from(
      host.querySelectorAll<HTMLInputElement>("input[type='checkbox']"),
    ).map((cb) => cb.checked);
    host.querySelector<HTMLButtonElement>("button.mining-lib-panel-show-all")?.click();
    const after = Array.from(host.querySelectorAll<HTMLInputElement>("input[type='checkbox']")).map(
      (cb) => cb.checked,
    );

    expect(after).toEqual(before);
  });
});

describe("createVariantPanel — action row layout", () => {
  it("All / None / Show all share one .mining-lib-panel-bulk container at the bottom", () => {
    const host = makeHost();
    // 4 variants with topK=2 so the Show all expander is rendered.
    const hooks = makeHooks({ variants: makeVariants(["a"], ["b"], ["c"], ["d"]) });
    createVariantPanel(host, hooks, { topK: 2 });

    const bulk = host.querySelector(".mining-lib-panel-bulk");
    expect(bulk).not.toBeNull();
    // All three buttons live inside the same container — single row.
    expect(bulk?.querySelector("button.mining-lib-panel-bulk-all")).not.toBeNull();
    expect(bulk?.querySelector("button.mining-lib-panel-bulk-none")).not.toBeNull();
    expect(bulk?.querySelector("button.mining-lib-panel-show-all")).not.toBeNull();
  });

  it("the action row sits AFTER every variant row in document order", () => {
    const host = makeHost();
    const hooks = makeHooks({ variants: makeVariants(["a"], ["b"], ["c"]) });
    createVariantPanel(host, hooks, { topK: 5 });

    const bulk = host.querySelector(".mining-lib-panel-bulk");
    const rows = host.querySelectorAll<HTMLLabelElement>("label.mining-lib-panel-row");
    expect(bulk).not.toBeNull();
    expect(rows.length).toBeGreaterThan(0);
    const lastRow = rows[rows.length - 1] as HTMLLabelElement;
    // DOCUMENT_POSITION_FOLLOWING (4) → second arg comes after.
    if (bulk && lastRow) {
      expect(lastRow.compareDocumentPosition(bulk) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("setTopK that crosses into 'has expander' territory appends Show all into the existing action row", () => {
    const host = makeHost();
    const hooks = makeHooks({ variants: makeVariants(["a"], ["b"], ["c"]) });
    const panel = createVariantPanel(host, hooks, { topK: 5 });

    expect(host.querySelector("button.mining-lib-panel-show-all")).toBeNull();
    panel.setTopK(2);
    const bulk = host.querySelector(".mining-lib-panel-bulk");
    const showAll = host.querySelector("button.mining-lib-panel-show-all");
    expect(showAll).not.toBeNull();
    // Show all must be a child of the action row, not a sibling.
    expect(bulk?.contains(showAll as Node)).toBe(true);
  });
});

describe("createVariantPanel — checkbox toggle wiring", () => {
  it("unchecking one row calls setActiveFilter with the still-checked signatures", () => {
    const host = makeHost();
    const variants = makeVariants(["a"], ["b"], ["c"]);
    const hooks = makeHooks({ variants });
    createVariantPanel(host, hooks, { topK: 5 });

    const second = host.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[1];
    if (!second) throw new Error("second checkbox missing");
    second.checked = false;
    second.dispatchEvent(new Event("change"));

    expect(hooks.setActiveFilter).toHaveBeenCalledTimes(1);
    expect(hooks.setActiveFilter).toHaveBeenCalledWith([
      variantSignature(["a"]),
      variantSignature(["c"]),
    ]);
  });

  it("re-checking until all checked again calls setActiveFilter(null)", () => {
    const host = makeHost();
    const variants = makeVariants(["a"], ["b"]);
    const hooks = makeHooks({ variants, filter: [variantSignature(["a"])] });
    createVariantPanel(host, hooks, { topK: 5 });

    const second = host.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[1];
    if (!second) throw new Error("second checkbox missing");
    second.checked = true;
    second.dispatchEvent(new Event("change"));

    expect(hooks.setActiveFilter).toHaveBeenCalledWith(null);
  });

  it("unchecking all rows calls setActiveFilter([])", () => {
    const host = makeHost();
    const variants = makeVariants(["a"], ["b"]);
    const hooks = makeHooks({ variants });
    createVariantPanel(host, hooks, { topK: 5 });

    const checkboxes = host.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    for (const cb of checkboxes) {
      cb.checked = false;
      cb.dispatchEvent(new Event("change"));
    }

    expect(hooks.setActiveFilter).toHaveBeenLastCalledWith([]);
  });
});

describe("createVariantPanel — update()", () => {
  it("re-renders rows from scratch when the variants list changes", () => {
    const host = makeHost();
    const hooks = makeHooks({ variants: makeVariants(["a"], ["b"]) });
    const panel = createVariantPanel(host, hooks, { topK: 5 });
    expect(host.querySelectorAll("input[type='checkbox']").length).toBe(2);

    hooks.variants = makeVariants(["x"], ["y"], ["z"]);
    panel.update();

    expect(host.querySelectorAll("input[type='checkbox']").length).toBe(3);
    const sigs = Array.from(host.querySelectorAll<HTMLInputElement>("input[type='checkbox']")).map(
      (cb) => cb.dataset.signature,
    );
    expect(sigs).toEqual([
      variantSignature(["x"]),
      variantSignature(["y"]),
      variantSignature(["z"]),
    ]);
  });

  it("syncs checkbox :checked state when the variants list is unchanged but filter changed", () => {
    const host = makeHost();
    const hooks = makeHooks({ variants: makeVariants(["a"], ["b"], ["c"]), filter: null });
    const panel = createVariantPanel(host, hooks, { topK: 5 });

    const checkboxes = host.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    const before = checkboxes[0];

    hooks.filter = [variantSignature(["b"])];
    panel.update();

    const after = host.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[0];
    expect(after).toBe(before);
    expect(after?.checked).toBe(false);
    expect(host.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[1]?.checked).toBe(
      true,
    );
    expect(host.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[2]?.checked).toBe(
      false,
    );
  });

  it("an empty new variants list clears all rows", () => {
    const host = makeHost();
    const hooks = makeHooks({ variants: makeVariants(["a"]) });
    const panel = createVariantPanel(host, hooks, { topK: 5 });
    expect(host.querySelectorAll("input[type='checkbox']").length).toBe(1);

    hooks.variants = [];
    panel.update();

    expect(host.querySelectorAll("input[type='checkbox']").length).toBe(0);
  });
});

describe("createVariantPanel — setTopK", () => {
  it("setTopK(2) hides extra rows without re-rendering them", () => {
    const host = makeHost();
    const hooks = makeHooks({ variants: makeVariants(["a"], ["b"], ["c"], ["d"]) });
    const panel = createVariantPanel(host, hooks, { topK: 5 });

    const before = host.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[0];
    panel.setTopK(2);
    const after = host.querySelectorAll<HTMLInputElement>("input[type='checkbox']")[0];
    expect(after).toBe(before);

    const rows = host.querySelectorAll<HTMLLabelElement>("label");
    expect(rows[0]?.hidden).toBe(false);
    expect(rows[1]?.hidden).toBe(false);
    expect(rows[2]?.hidden).toBe(true);
    expect(rows[3]?.hidden).toBe(true);
    expect(host.querySelector("button.mining-lib-panel-show-all")).not.toBeNull();
  });

  it("setTopK to a larger K removes the expander", () => {
    const host = makeHost();
    const hooks = makeHooks({ variants: makeVariants(["a"], ["b"], ["c"]) });
    const panel = createVariantPanel(host, hooks, { topK: 2 });
    expect(host.querySelector("button.mining-lib-panel-show-all")).not.toBeNull();

    panel.setTopK(10);
    expect(host.querySelector("button.mining-lib-panel-show-all")).toBeNull();
    const rows = host.querySelectorAll<HTMLLabelElement>("label");
    for (const r of rows) expect(r.hidden).toBe(false);
  });
});

describe("createVariantPanel — destroy", () => {
  it("destroy() empties the host", () => {
    const host = makeHost();
    const hooks = makeHooks({ variants: makeVariants(["a"], ["b"]) });
    const panel = createVariantPanel(host, hooks, { topK: 5 });
    expect(host.children.length).toBeGreaterThan(0);

    panel.destroy();
    expect(host.children.length).toBe(0);
  });

  it("destroy() detaches the change listeners", () => {
    const host = makeHost();
    const hooks = makeHooks({ variants: makeVariants(["a"], ["b"]) });
    const panel = createVariantPanel(host, hooks, { topK: 5 });

    panel.destroy();
    // Synthetic change after destroy must not call setActiveFilter
    const stale = document.createElement("input");
    stale.type = "checkbox";
    stale.dispatchEvent(new Event("change"));
    expect(hooks.setActiveFilter).not.toHaveBeenCalled();
  });
});

describe("createVariantPanel — happy-path pin button (Phase 24)", () => {
  function pinButtons(host: HTMLElement): NodeListOf<HTMLButtonElement> {
    return host.querySelectorAll<HTMLButtonElement>("button.mining-lib-variant-pin");
  }

  it("each row carries a pin button with aria-pressed='false' by default", () => {
    const host = makeHost();
    const hooks = makeHooks({ variants: makeVariants(["a", "b"], ["a", "c"]) });
    createVariantPanel(host, hooks, { topK: 5 });
    const pins = pinButtons(host);
    expect(pins).toHaveLength(2);
    for (const pin of pins) {
      expect(pin.getAttribute("aria-pressed")).toBe("false");
      expect(pin.querySelector("svg")).not.toBeNull();
    }
  });

  it("pin button is rendered BEFORE the checkbox in its row", () => {
    const host = makeHost();
    const hooks = makeHooks({ variants: makeVariants(["a"]) });
    createVariantPanel(host, hooks, { topK: 5 });
    const row = host.querySelector<HTMLLabelElement>("label.mining-lib-panel-row");
    expect(row).not.toBeNull();
    const pin = row?.querySelector(".mining-lib-variant-pin");
    const checkbox = row?.querySelector("input[type='checkbox']");
    expect(pin).not.toBeNull();
    expect(checkbox).not.toBeNull();
    // DOCUMENT_POSITION_FOLLOWING (4) → second arg comes after first
    // in document order. The pin must precede the checkbox visually.
    if (pin && checkbox) {
      expect(pin.compareDocumentPosition(checkbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("clicking an unpinned row's pin calls setHappyPath with that sequence (defensive copy)", () => {
    const host = makeHost();
    const hooks = makeHooks({ variants: makeVariants(["a", "b"], ["a", "c"]) });
    createVariantPanel(host, hooks, { topK: 5 });
    const pin = pinButtons(host)[0] as HTMLButtonElement;
    pin.click();
    expect(hooks.setHappyPath).toHaveBeenCalledTimes(1);
    const seq = hooks.setHappyPath.mock.calls[0]?.[0] as string[];
    expect(seq).toEqual(["a", "b"]);
    // Defensive — the panel should hand the hook a fresh array.
    expect(seq).not.toBe(hooks.variants[0]?.sequence);
  });

  it("clicking the pinned row's pin clears the pin (setHappyPath(null))", () => {
    const host = makeHost();
    const hooks = makeHooks({
      variants: makeVariants(["a", "b"], ["a", "c"]),
      happyPath: ["a", "b"],
    });
    createVariantPanel(host, hooks, { topK: 5 });
    const pin = pinButtons(host)[0] as HTMLButtonElement;
    pin.click();
    expect(hooks.setHappyPath).toHaveBeenCalledTimes(1);
    expect(hooks.setHappyPath.mock.calls[0]?.[0]).toBeNull();
  });

  it("clicking pin B while A is pinned sets the pin to B in one call", () => {
    const host = makeHost();
    const hooks = makeHooks({
      variants: makeVariants(["a", "b"], ["a", "c"]),
      happyPath: ["a", "b"],
    });
    createVariantPanel(host, hooks, { topK: 5 });
    const pinB = pinButtons(host)[1] as HTMLButtonElement;
    pinB.click();
    expect(hooks.setHappyPath).toHaveBeenCalledTimes(1);
    expect(hooks.setHappyPath.mock.calls[0]?.[0]).toEqual(["a", "c"]);
  });

  it("pin click does NOT toggle the row's checkbox", () => {
    const host = makeHost();
    const hooks = makeHooks({ variants: makeVariants(["a", "b"]) });
    createVariantPanel(host, hooks, { topK: 5 });
    const row = host.querySelector<HTMLLabelElement>("label.mining-lib-panel-row");
    const cb = row?.querySelector<HTMLInputElement>("input[type='checkbox']");
    const before = cb?.checked;
    const pin = pinButtons(host)[0] as HTMLButtonElement;
    pin.click();
    expect(cb?.checked).toBe(before);
    expect(hooks.setActiveFilter).not.toHaveBeenCalled();
  });

  it("update() re-syncs aria-pressed and pinned-row class from getHappyPath()", () => {
    const host = makeHost();
    const hooks = makeHooks({
      variants: makeVariants(["a", "b"], ["a", "c"]),
      happyPath: null,
    });
    const panel = createVariantPanel(host, hooks, { topK: 5 });
    const pins = pinButtons(host);
    // No pin → all unpressed, no pinned-row class.
    expect(pins[0]?.getAttribute("aria-pressed")).toBe("false");
    expect(pins[1]?.getAttribute("aria-pressed")).toBe("false");
    expect(host.querySelector(".mining-lib-variant-row-pinned")).toBeNull();

    // Flip the external state and re-sync via update().
    hooks.happyPath = ["a", "c"];
    panel.update();
    const pinsAfter = pinButtons(host);
    expect(pinsAfter[0]?.getAttribute("aria-pressed")).toBe("false");
    expect(pinsAfter[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(
      host.querySelectorAll("label.mining-lib-panel-row.mining-lib-variant-row-pinned"),
    ).toHaveLength(1);
  });

  it("variantSignature equality drives the pinned state (not array identity)", () => {
    // The hook may return a fresh array each call; the panel must
    // match by signature, not by reference.
    const host = makeHost();
    const seq = ["a", "b"];
    let recall = 0;
    const hooks: VariantPanelHooks = {
      getVariants: () => makeVariants(seq, ["a", "c"]),
      getActiveFilter: () => null,
      setActiveFilter: () => undefined,
      // Each call returns a fresh structurally-equal array.
      getHappyPath: () => {
        recall += 1;
        return [...seq];
      },
      setHappyPath: () => undefined,
    };
    createVariantPanel(host, hooks, { topK: 5 });
    expect(recall).toBeGreaterThanOrEqual(1);
    const pins = pinButtons(host);
    expect(pins[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(pins[1]?.getAttribute("aria-pressed")).toBe("false");
  });
});
