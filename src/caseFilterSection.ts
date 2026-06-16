/**
 * Case-filter section (Phase 27 follow-up — 2026-05-22; combobox
 * upgrade 2026-05-22b).
 *
 * Mounts inside the Filters popover below the date-range section.
 * A custom combobox: text input + chevron button + popup `<ul>` of
 * case IDs.
 *
 *  - Click chevron       → popup opens with the full list.
 *  - Type in the input   → popup filters live (case-insensitive
 *                          substring); popup auto-opens.
 *  - Click an item       → commits + closes popup.
 *  - Enter on valid id   → commits.
 *  - Enter on empty      → onClear.
 *  - Enter on invalid id → shows hint, no commit.
 *  - Escape              → closes popup.
 *
 * The custom combobox replaces the previous `<input list>` +
 * `<datalist>` because the native datalist's dropdown affordance
 * varies by browser (Chrome shows a subtle ▼; Firefox shows
 * nothing). The chevron + popup gives consistent behaviour.
 */
import type { EventLog } from "./types.js";

export type CaseFilterSectionHooks = {
  getLog(): EventLog;
  /** Current case-id clause's selected id, or null. Single-id only. */
  getCaseId(): string | null;
  /** User committed a valid case id. */
  onCommit(caseId: string): void;
  /** User cleared the case filter (emptied the input). */
  onClear(): void;
};

export type CaseFilterSectionInstance = {
  element: HTMLElement;
  update(): void;
  setHooks(hooks: Partial<CaseFilterSectionHooks>): void;
  destroy(): void;
};

const NOOP_HOOKS: CaseFilterSectionHooks = {
  getLog: () => ({
    cases: new Map(),
    events: [],
    schema: { caseAttributes: [], eventAttributes: [], columnTypes: {} },
  }),
  getCaseId: () => null,
  onCommit: () => undefined,
  onClear: () => undefined,
};

export function createCaseFilterSection(
  initialHooks: CaseFilterSectionHooks,
): CaseFilterSectionInstance {
  let hooks = initialHooks;
  const element = document.createElement("div");
  element.className = "mining-lib-case-section-mount";

  let outsideClickHandler: ((event: MouseEvent) => void) | null = null;

  function build(): void {
    const log = hooks.getLog();
    const ids = [...log.cases.keys()].sort();
    const active = hooks.getCaseId();
    const empty = ids.length === 0;

    // Tear down any prior outside-click handler before rebuilding —
    // `update()` may swap the DOM, and we don't want a stale handler
    // pinning the previous popup open.
    if (outsideClickHandler !== null) {
      document.removeEventListener("click", outsideClickHandler, true);
      outsideClickHandler = null;
    }

    const details = document.createElement("details");
    details.className = "mining-lib-case-section";
    details.open = true;

    const summary = document.createElement("summary");
    summary.textContent = active !== null ? "Case · active" : "Case";
    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "mining-lib-case-body";

    // Combobox: input + chevron + popup, wrapped in a `position:
    // relative` container so the popup anchors to it.
    const combobox = document.createElement("div");
    combobox.className = "mining-lib-case-combobox";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "mining-lib-case-input";
    input.placeholder = "Case ID";
    input.value = active ?? "";
    input.disabled = empty;
    input.autocomplete = "off";
    combobox.appendChild(input);

    const chevron = document.createElement("button");
    chevron.type = "button";
    chevron.className = "mining-lib-case-chevron";
    chevron.setAttribute("aria-label", "Toggle case list");
    chevron.textContent = "▼";
    chevron.disabled = empty;
    combobox.appendChild(chevron);

    const popup = document.createElement("ul");
    popup.className = "mining-lib-case-popup";
    popup.hidden = true;
    popup.setAttribute("role", "listbox");
    for (const id of ids) {
      const li = document.createElement("li");
      li.className = "mining-lib-case-popup-item";
      li.dataset.value = id;
      li.textContent = id;
      li.setAttribute("role", "option");
      popup.appendChild(li);
    }
    combobox.appendChild(popup);

    body.appendChild(combobox);

    const hint = document.createElement("div");
    hint.className = "mining-lib-case-hint";
    hint.hidden = true;
    body.appendChild(hint);

    if (empty) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "mining-lib-case-empty-msg";
      emptyMsg.textContent = "No cases in current filter";
      body.appendChild(emptyMsg);
    }

    function openPopup(): void {
      popup.hidden = false;
      applyFilter(input.value);
    }
    function closePopup(): void {
      popup.hidden = true;
    }
    function togglePopup(): void {
      if (popup.hidden) openPopup();
      else closePopup();
    }
    function applyFilter(raw: string): void {
      const q = raw.trim().toLowerCase();
      for (const li of popup.querySelectorAll<HTMLLIElement>("li.mining-lib-case-popup-item")) {
        const value = li.dataset.value ?? "";
        li.hidden = q.length > 0 && !value.toLowerCase().includes(q);
      }
    }

    function tryCommit(raw: string): void {
      const value = raw.trim();
      if (value.length === 0) {
        hint.hidden = true;
        closePopup();
        hooks.onClear();
        return;
      }
      if (!log.cases.has(value)) {
        hint.textContent = "No such case in current filter";
        hint.hidden = false;
        return;
      }
      hint.hidden = true;
      hint.textContent = "";
      closePopup();
      // No-op if the user re-committed the same id (avoids redundant
      // setFilters calls + re-renders).
      if (value === active) return;
      hooks.onCommit(value);
    }

    chevron.addEventListener("click", (e) => {
      e.stopPropagation();
      if (empty) return;
      togglePopup();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        tryCommit(input.value);
        return;
      }
      if (e.key === "Escape") {
        closePopup();
      }
    });

    input.addEventListener("input", () => {
      // Auto-open the popup so the filtered list is visible as the
      // user narrows down.
      openPopup();
    });

    popup.addEventListener("click", (e) => {
      const target = e.target as HTMLElement | null;
      const li = target?.closest<HTMLLIElement>("li.mining-lib-case-popup-item");
      if (li === null || li === undefined) return;
      const value = li.dataset.value ?? "";
      input.value = value;
      tryCommit(value);
    });

    // Outside-click dismiss. Capture-phase so it runs before child
    // handlers swallow the event.
    outsideClickHandler = (event) => {
      if (popup.hidden) return;
      const target = event.target as Node | null;
      if (target !== null && combobox.contains(target)) return;
      closePopup();
    };
    document.addEventListener("click", outsideClickHandler, true);

    details.appendChild(body);
    element.replaceChildren(details);
  }

  function update(): void {
    build();
  }

  return {
    element,
    update,
    setHooks(next: Partial<CaseFilterSectionHooks>): void {
      hooks = { ...NOOP_HOOKS, ...hooks, ...next };
    },
    destroy(): void {
      if (outsideClickHandler !== null) {
        document.removeEventListener("click", outsideClickHandler, true);
        outsideClickHandler = null;
      }
      element.remove();
      hooks = NOOP_HOOKS;
    },
  };
}
