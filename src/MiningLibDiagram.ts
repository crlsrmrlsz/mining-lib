import { mountDiagram, validateZoomConfig } from "./createDiagram.js";
import type { CreateDiagramConfig, DiagramHandle, ZoomConfig } from "./diagramTypes.js";
import miningLibCss from "./mining-lib.css?inline";
import { type ControlsConfig, parseControls } from "./parseControls.js";
import { isPresetName, type PresetName } from "./presets.js";
import type { Theme } from "./theme.js";
import type { CountMode, Dfg, EventLog } from "./types.js";

const VALID_MODES: readonly CountMode[] = [
  "absolute",
  "case",
  "meanRepetitions",
  "maxRepetitions",
  "meanDuration",
  "medianDuration",
];

const sharedSheet = new CSSStyleSheet();
sharedSheet.replaceSync(miningLibCss);

export class MiningLibDiagram extends HTMLElement {
  static readonly observedAttributes = [
    "theme",
    "count-mode",
    "variant-top-k",
    "preset",
    "controls",
    "trace-case",
    "rankdir",
  ];

  #log: EventLog | null = null;
  #dfg: Dfg | null = null;
  #theme: Theme | undefined = undefined;
  #countMode: CountMode | undefined = undefined;
  #zoom: ZoomConfig | undefined = undefined;
  #variantTopK = 5;
  #preset: PresetName | undefined = undefined;
  #controls: ControlsConfig | undefined = undefined;
  #happyPathVariant: string[] | undefined = undefined;
  #traceCase: string | undefined = undefined;
  #rankdir: "LR" | "TB" | undefined = undefined;
  #handle: DiagramHandle | null = null;
  #setVariantTopK: ((k: number) => void) | null = null;
  #shadow: ShadowRoot | null = null;
  #reflecting = false;

  connectedCallback(): void {
    if (this.#handle) return;
    if (!this.#shadow) {
      this.#shadow = this.attachShadow({ mode: "open" });
      this.#shadow.adoptedStyleSheets = [sharedSheet];
    }
    const config: CreateDiagramConfig = { variantTopK: this.#variantTopK };
    if (this.#countMode !== undefined) config.countMode = this.#countMode;
    if (this.#zoom !== undefined) config.zoom = this.#zoom;
    if (this.#theme !== undefined) config.theme = this.#theme;
    if (this.#preset !== undefined) config.preset = this.#preset;
    if (this.#controls !== undefined) config.controls = this.#controls;
    if (this.#happyPathVariant !== undefined) config.happyPathVariant = this.#happyPathVariant;
    if (this.#traceCase !== undefined) config.traceCase = this.#traceCase;
    if (this.#rankdir !== undefined) config.rankdir = this.#rankdir;
    const mounted = mountDiagram(this.#shadow, this, config);
    this.#handle = mounted.handle;
    this.#setVariantTopK = mounted.setVariantTopK;
    if (this.#dfg) {
      this.#handle.render(this.#dfg, this.#log ?? undefined);
    }
  }

  disconnectedCallback(): void {
    if (!this.#handle) return;
    this.#handle.destroy();
    this.#handle = null;
    this.#setVariantTopK = null;
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
    if (this.#reflecting) return;
    if (name === "theme") {
      // Phase 36 fix: same upgrade-queue corruption as preset — go
      // straight to the private field + handle call, skip the setter's
      // setAttribute reflection.
      if (newValue === "light" || newValue === "dark") {
        const normalized: Theme = { dark: newValue === "dark" };
        this.#theme = normalized;
        if (this.#handle) this.#handle.setTheme(normalized);
      } else if (newValue === null) {
        this.#theme = undefined;
      }
    } else if (name === "count-mode") {
      if (newValue && (VALID_MODES as readonly string[]).includes(newValue)) {
        this.countMode = newValue as CountMode;
      }
    } else if (name === "variant-top-k") {
      if (newValue === null) return;
      const parsed = Number(newValue);
      if (Number.isInteger(parsed) && parsed >= 1) {
        this.variantTopK = parsed;
      }
    } else if (name === "preset") {
      // Phase 36 fix: write the private field directly instead of
      // calling `this.preset = newValue`. The setter's `setAttribute`
      // reflection corrupts the custom-element upgrade reaction queue
      // — subsequent attributes in `observedAttributes` (controls,
      // trace-case, rankdir) silently skip their callbacks. Direct
      // field write avoids the reflection round-trip since the
      // attribute is already on the element.
      if (newValue === null) {
        this.#preset = undefined;
        if (this.#handle) this.#handle.setPreset("default");
      } else if (isPresetName(newValue)) {
        this.#preset = newValue;
        if (this.#handle) this.#handle.setPreset(newValue);
      }
    } else if (name === "controls") {
      // controls is read at mount time only — runtime changes require
      // re-mount (the shadow tree is rebuilt on disconnect/connect).
      this.#controls = parseControls(newValue);
    } else if (name === "trace-case") {
      // Phase 27 — attribute reflects to the trace pin. Empty / null
      // attribute → clear; non-empty → pin (creating the panel + the
      // overlay on next draw).
      if (newValue === null || newValue.length === 0) {
        this.traceCase = undefined;
      } else {
        this.traceCase = newValue;
      }
    } else if (name === "rankdir") {
      // Phase 37 — rankdir is runtime-switchable. Write the field and call
      // the handle directly (NOT via the property setter — its setAttribute
      // reflection corrupts the upgrade reaction queue; same reason the
      // preset / theme branches above bypass their setters).
      if (newValue === "LR" || newValue === "TB") {
        this.#rankdir = newValue;
        if (this.#handle) this.#handle.setRankdir(newValue);
      } else if (newValue === null) {
        this.#rankdir = undefined;
      }
    }
  }

  get log(): EventLog | null {
    return this.#log;
  }
  set log(value: EventLog | null) {
    this.#log = value;
    if (this.#handle && this.#dfg) {
      this.#handle.render(this.#dfg, this.#log ?? undefined);
    }
  }

  get dfg(): Dfg | null {
    return this.#dfg;
  }
  set dfg(value: Dfg | null) {
    this.#dfg = value;
    if (this.#handle && this.#dfg) {
      this.#handle.render(this.#dfg, this.#log ?? undefined);
    }
  }

  get theme(): Theme | undefined {
    return this.#theme;
  }
  set theme(value: Theme | "light" | "dark" | undefined) {
    let normalized: Theme | undefined;
    let attrValue: string | null = null;
    if (value === "light") {
      normalized = { dark: false };
      attrValue = "light";
    } else if (value === "dark") {
      normalized = { dark: true };
      attrValue = "dark";
    } else {
      normalized = value;
    }
    this.#theme = normalized;
    if (this.#handle && normalized) {
      this.#handle.setTheme(normalized);
    }
    if (attrValue !== null) {
      this.#reflecting = true;
      this.setAttribute("theme", attrValue);
      this.#reflecting = false;
    }
  }

  get countMode(): CountMode | undefined {
    return this.#countMode;
  }
  set countMode(value: CountMode) {
    this.#countMode = value;
    if (this.#handle) {
      this.#handle.setCountMode(value);
    }
    this.#reflecting = true;
    this.setAttribute("count-mode", value);
    this.#reflecting = false;
  }

  get variantTopK(): number {
    return this.#variantTopK;
  }
  set variantTopK(value: number) {
    if (!Number.isInteger(value) || value < 1) {
      throw new TypeError(
        `MiningLibDiagram.variantTopK: must be a positive integer, got ${String(value)}`,
      );
    }
    this.#variantTopK = value;
    this.#setVariantTopK?.(value);
    this.#reflecting = true;
    this.setAttribute("variant-top-k", String(value));
    this.#reflecting = false;
  }

  get preset(): PresetName | undefined {
    return this.#preset;
  }
  set preset(value: PresetName | undefined) {
    if (value !== undefined && !isPresetName(value)) {
      throw new TypeError(
        `MiningLibDiagram.preset: must be one of "default" | "linear" | "paper", got ${String(value)}`,
      );
    }
    this.#preset = value;
    if (this.#handle && value !== undefined) {
      this.#handle.setPreset(value);
    }
    this.#reflecting = true;
    if (value === undefined) {
      this.removeAttribute("preset");
    } else {
      this.setAttribute("preset", value);
    }
    this.#reflecting = false;
  }

  get happyPathVariant(): string[] | undefined {
    return this.#happyPathVariant === undefined ? undefined : [...this.#happyPathVariant];
  }
  set happyPathVariant(value: string[] | undefined) {
    if (value === undefined) {
      this.#happyPathVariant = undefined;
      this.#handle?.setHappyPathVariant(null);
      return;
    }
    if (!Array.isArray(value)) {
      throw new TypeError("MiningLibDiagram.happyPathVariant: must be a string[] or undefined");
    }
    this.#happyPathVariant = [...value];
    this.#handle?.setHappyPathVariant(this.#happyPathVariant);
  }

  get traceCase(): string | undefined {
    return this.#traceCase;
  }
  set traceCase(value: string | undefined) {
    if (value === undefined) {
      this.#traceCase = undefined;
      this.#handle?.setTraceCase(null);
      if (!this.#reflecting) {
        this.#reflecting = true;
        this.removeAttribute("trace-case");
        this.#reflecting = false;
      }
      return;
    }
    if (typeof value !== "string" || value.length === 0) {
      throw new TypeError("MiningLibDiagram.traceCase: must be a non-empty string or undefined");
    }
    this.#traceCase = value;
    this.#handle?.setTraceCase(value);
    if (!this.#reflecting) {
      this.#reflecting = true;
      this.setAttribute("trace-case", value);
      this.#reflecting = false;
    }
  }

  get rankdir(): "LR" | "TB" | undefined {
    return this.#rankdir;
  }
  set rankdir(value: "LR" | "TB" | undefined) {
    if (value !== undefined && value !== "LR" && value !== "TB") {
      throw new TypeError(`MiningLibDiagram.rankdir: must be "LR" or "TB", got ${String(value)}`);
    }
    this.#rankdir = value;
    // Phase 37 — rankdir is now runtime-switchable: drive the live relayout
    // through the handle (mirrors countMode / preset). undefined just clears
    // the attribute; the handle keeps its current direction.
    if (this.#handle && value !== undefined) {
      this.#handle.setRankdir(value);
    }
    this.#reflecting = true;
    if (value === undefined) {
      this.removeAttribute("rankdir");
    } else {
      this.setAttribute("rankdir", value);
    }
    this.#reflecting = false;
  }

  get zoom(): ZoomConfig | undefined {
    return this.#zoom;
  }
  set zoom(value: ZoomConfig | undefined) {
    validateZoomConfig(value);
    if (this.#handle) {
      console.warn(
        "MiningLibDiagram: zoom can only be set before the element is connected; subsequent updates are ignored.",
      );
      return;
    }
    this.#zoom = value;
  }

  get handle(): DiagramHandle {
    if (!this.#handle) {
      throw new Error(
        "MiningLibDiagram: not connected — append the element to the DOM before reading .handle",
      );
    }
    return this.#handle;
  }
}

export function registerMiningLibDiagram(): void {
  if (!customElements.get("mining-lib-diagram")) {
    customElements.define("mining-lib-diagram", MiningLibDiagram);
  }
}
