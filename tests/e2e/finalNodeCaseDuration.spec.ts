import { expect, type Page, test } from "@playwright/test";

const SVG = "#mount mining-lib-diagram svg.mining-lib-svg";
const PRIMARY = "#mount mining-lib-diagram .mining-lib-pill-primary";
const TERMINAL_GROUP = "#mount mining-lib-diagram g.mining-lib-node-terminal";
const TERMINAL_TEXT = "#mount mining-lib-diagram text.mining-lib-node-terminal-text";
const VARIANT_CHECKBOX = "#mount mining-lib-diagram input[type='checkbox'][data-signature]";

const MODE_TRIGGER = `${PRIMARY} button[data-popover="mode"]`;
const VARIANTS_TRIGGER = `${PRIMARY} button[data-popover="variants"]`;
const MEAN_CHIP =
  '.mining-lib-popover .mining-lib-mode-section[data-section="time"] button[data-mode="meanDuration"]';
const MEDIAN_CHIP =
  '.mining-lib-popover .mining-lib-mode-section[data-section="time"] button[data-mode="medianDuration"]';
const ABS_CHIP =
  '.mining-lib-popover .mining-lib-mode-section[data-section="count"] button[data-mode="absolute"]';

const RED = "#ef4444";

async function switchToMode(page: Page, chipSelector: string): Promise<void> {
  await page.locator(MODE_TRIGGER).click();
  await page.locator(chipSelector).click();
  await page.locator(".mining-lib-popover").waitFor({ state: "hidden" });
}

test("Scenario 1 — terminal labels appear in time modes, disappear in count modes", async ({
  page,
}) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=900&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  await expect(page.locator(SVG)).toHaveAttribute("data-count-mode", "absolute");
  await expect(page.locator(TERMINAL_GROUP)).toHaveCount(0);

  // Switch to Mean — at least one terminal node shows the secondary label.
  await switchToMode(page, MEAN_CHIP);
  await expect(page.locator(SVG)).toHaveAttribute("data-count-mode", "meanDuration");
  const meanCount = await page.locator(TERMINAL_GROUP).count();
  expect(meanCount).toBeGreaterThan(0);

  // Each terminal group: exactly one inline svg (the bullseye icon) + one text.
  const first = page.locator(TERMINAL_GROUP).first();
  await expect(first.locator("svg")).toHaveCount(1);
  await expect(first.locator("text.mining-lib-node-terminal-text")).toHaveCount(1);

  // Capture the Mean text for the next comparison.
  const meanTexts = await page.locator(TERMINAL_TEXT).allTextContents();
  for (const t of meanTexts) {
    expect(t.trim()).toMatch(/^\d+(\.\d)?\s(s|m|h|d)$/);
  }

  // Switch to Median — same set of terminals, but at least one text changes.
  await switchToMode(page, MEDIAN_CHIP);
  await expect(page.locator(SVG)).toHaveAttribute("data-count-mode", "medianDuration");
  await expect(page.locator(TERMINAL_GROUP)).toHaveCount(meanCount);
  const medianTexts = await page.locator(TERMINAL_TEXT).allTextContents();
  expect(medianTexts).not.toEqual(meanTexts);

  // Back to Abs — every secondary label disappears.
  await switchToMode(page, ABS_CHIP);
  await expect(page.locator(SVG)).toHaveAttribute("data-count-mode", "absolute");
  await expect(page.locator(TERMINAL_GROUP)).toHaveCount(0);
});

test("Scenario 2 — variant filter changes terminal set / durations on the rendered diagram", async ({
  page,
}) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=900&h=720");
  await switchToMode(page, MEAN_CHIP);
  const beforeTexts = await page.locator(TERMINAL_TEXT).allTextContents();
  const beforeCount = beforeTexts.length;
  expect(beforeCount).toBeGreaterThan(0);

  // Open Variants popover and uncheck everything but the first variant.
  await page.locator(VARIANTS_TRIGGER).click();
  await page.waitForFunction(() => {
    const el = document.querySelector("#mount mining-lib-diagram");
    return Boolean(el?.shadowRoot?.querySelector("input[type='checkbox'][data-signature]"));
  });
  const checkboxes = page.locator(VARIANT_CHECKBOX);
  const variantCount = await checkboxes.count();
  for (let i = 1; i < variantCount; i += 1) {
    await checkboxes.nth(i).uncheck();
  }
  await page.keyboard.press("Escape");
  await page.locator(".mining-lib-popover").waitFor({ state: "hidden" });

  // After narrowing to one variant: terminal set is smaller and/or
  // texts differ — either way the diagram visibly recomputed.
  const afterTexts = await page.locator(TERMINAL_TEXT).allTextContents();
  const sameContent = JSON.stringify(beforeTexts) === JSON.stringify(afterTexts);
  expect(sameContent).toBe(false);
  expect(afterTexts.length).toBeGreaterThan(0);
  expect(afterTexts.length).toBeLessThanOrEqual(beforeCount);
});

test("Scenario 3 — embedder override on --mining-time-ramp-high flips slowest terminal toward red", async ({
  page,
}) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=900&h=720");

  await page.evaluate((red) => {
    const styleEl = document.createElement("style");
    styleEl.textContent = `mining-lib-diagram { --mining-time-ramp-high: ${red} !important; }`;
    document.head.appendChild(styleEl);
  }, RED);

  await switchToMode(page, MEAN_CHIP);
  await expect(page.locator(SVG)).toHaveAttribute("data-count-mode", "meanDuration");
  await expect(page.locator(TERMINAL_GROUP).first()).toBeVisible();

  // At least one terminal group's resolved colour is in the red family
  // (R channel > 200, G and B both < 100). Confirms the override
  // flowed through to the inline `color` attribute via the renderer's
  // getComputedStyle reads.
  const redFamilyPresent = await page.locator(TERMINAL_GROUP).evaluateAll((els) =>
    els.some((el) => {
      const color = el.getAttribute("color") ?? "";
      const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!match) return false;
      const r = Number(match[1]);
      const g = Number(match[2]);
      const b = Number(match[3]);
      return r > 200 && g < 100 && b < 100;
    }),
  );
  expect(redFamilyPresent).toBe(true);
});

test("Scenario 4 — single-event case renders '0 s' with no console errors", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/control-bar.built.html?fixture=n5-fixture");
  await expect(page.locator(SVG)).toBeVisible();

  // Replace the rendered log with a one-event log built inline.
  await page.evaluate(() => {
    const csv = [
      "case:concept:name,concept:name,time:timestamp,org:resource,lifecycle:transition",
      "solo,finish,2024-01-01 10:00:00-05:00,,complete",
    ].join("\n");
    const win = window as unknown as {
      MiningLib: {
        parseCsv: (text: string) => { log: unknown };
        buildDfg: (log: unknown) => unknown;
      };
      __diagram: { render: (dfg: unknown, log: unknown) => void };
    };
    const { log } = win.MiningLib.parseCsv(csv);
    const dfg = win.MiningLib.buildDfg(log);
    win.__diagram.render(dfg, log);
  });

  await switchToMode(page, MEAN_CHIP);
  const texts = await page.locator(TERMINAL_TEXT).allTextContents();
  expect(texts).toContain("0 s");
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("Scenario 5 — programmatic getTerminalNodeDurations matches the rendered label", async ({
  page,
}) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=900&h=720");
  await switchToMode(page, MEAN_CHIP);

  // Walk every visible terminal label in the DOM (against the page's
  // current filter state) and confirm the helper, called against the
  // *same filtered log* the handle exposes, produces the same number.
  const parity = await page.evaluate(async () => {
    function formatDuration(ms: number): string {
      if (ms === 0) return "0 s";
      const day = 86_400_000;
      const hour = 3_600_000;
      const minute = 60_000;
      const second = 1_000;
      if (ms >= day) return `${(ms / day).toFixed(1)} d`;
      if (ms >= hour) return `${(ms / hour).toFixed(1)} h`;
      if (ms >= minute) return `${(ms / minute).toFixed(1)} m`;
      return `${(ms / second).toFixed(1)} s`;
    }
    type CaseShape = { id: string; events: { activity: string }[]; attributes: unknown };
    type LogShape = {
      cases: Map<string, CaseShape>;
      events: { activity: string }[];
      schema: unknown;
    };
    type Lib = {
      parseCsv: (text: string) => { log: LogShape };
      buildDfg: (log: LogShape) => unknown;
      getTerminalNodeDurations: (
        dfg: unknown,
        log: LogShape,
      ) => Map<string, { mean: number; median: number; count: number }>;
    };
    const lib = (window as unknown as { MiningLib: Lib }).MiningLib;
    const handle = (
      window as unknown as {
        __diagram: { getVariantFilter(): string[] | null };
      }
    ).__diagram;
    const res = await fetch("/runs/n1000-realistic/events.csv");
    const csv = await res.text();
    const { log } = lib.parseCsv(csv);

    // Reproduce the page's variant filter (default top-K=5) by hand
    // so the helper's view of "terminals" matches what's rendered.
    const sigs = handle.getVariantFilter();
    const filtered: LogShape =
      sigs === null
        ? log
        : (() => {
            const allowed = new Set(sigs);
            const newCases = new Map<string, CaseShape>();
            const newEvents: { activity: string }[] = [];
            for (const [id, c] of log.cases) {
              const sig = JSON.stringify(c.events.map((e) => e.activity));
              if (!allowed.has(sig)) continue;
              newCases.set(id, c);
              for (const e of c.events) newEvents.push(e);
            }
            return { cases: newCases, events: newEvents, schema: log.schema };
          })();
    const dfg = lib.buildDfg(filtered);
    const durs = lib.getTerminalNodeDurations(dfg, filtered);

    const rows: {
      activity: string;
      rendered: string | null;
      expected: string;
      meanMs: number;
    }[] = [];
    const host = document.querySelector("mining-lib-diagram");
    const root = host?.shadowRoot;
    const terminalNodes = root?.querySelectorAll("g.mining-lib-node-terminal") ?? [];
    for (const tg of terminalNodes) {
      const parent = tg.closest("g.mining-lib-node");
      const activity = parent?.getAttribute("data-activity");
      if (!activity) continue;
      const text = tg.querySelector("text.mining-lib-node-terminal-text")?.textContent ?? null;
      const agg = durs.get(activity);
      if (!agg) {
        rows.push({ activity, rendered: text, expected: "<helper missing>", meanMs: -1 });
        continue;
      }
      rows.push({
        activity,
        rendered: text,
        expected: formatDuration(agg.mean),
        meanMs: agg.mean,
      });
    }
    return rows;
  });

  expect(parity.length).toBeGreaterThan(0);
  for (const row of parity) {
    expect(row.rendered, `terminal "${row.activity}"`).toBe(row.expected);
  }
});
