import { expect, type Locator, type Page, test } from "@playwright/test";

/**
 * Responsive collision-matrix test (Phase 28).
 *
 * Sweeps the host width across 8 breakpoints × 3 content states.
 * For each (width × state) cell, asserts:
 *   1. No pair of resident chrome surfaces has overlapping bounding boxes.
 *   2. Every visible surface fits within the host's bounding box.
 *
 * Resident chrome surfaces (selectors):
 *   - `.mining-lib-pill-primary`  (Mode / Variants / Filters trio)
 *   - `.mining-lib-pill-utilities` (reset / theme / export)
 *   - `.mining-lib-pill-zoom`     (− % +)
 *   - `.mining-lib-trace-panel`   (only mounted when a single-id
 *                                  caseId clause is active)
 *
 * The spec is written BEFORE the Phase-28 grid rewrite (TG4). Any
 * failures it surfaces are pre-existing collisions that the grid
 * rewrite is designed to make structurally impossible.
 */

const HOST = "#mount mining-lib-diagram";
const SVG = `${HOST} svg.mining-lib-svg`;

type AttributeValue = string | number | boolean | null;
type FilterClause =
  | { kind: "variant"; sequences: string[] }
  | { kind: "branch"; edge: [string, string] }
  | { kind: "node"; activity: string }
  | { kind: "resourceAt"; activity: string; resources: string[] }
  | { kind: "attribute"; attribute: string; values: AttributeValue[] }
  | { kind: "date"; from: string | null; to: string | null; anchor: "started" | "ended" }
  | { kind: "caseId"; caseIds: string[] };

const WIDTHS = [240, 320, 400, 480, 600, 800, 1000, 1400] as const;
type ContentState = "default" | "heavy" | "empty";
const STATES: ContentState[] = ["default", "heavy", "empty"];

const SURFACE_SELECTORS: Array<{ name: string; selector: string }> = [
  { name: "primary", selector: `${HOST} .mining-lib-pill-primary` },
  { name: "utilities", selector: `${HOST} .mining-lib-pill-utilities` },
  { name: "zoom", selector: `${HOST} .mining-lib-pill-zoom` },
  { name: "trace", selector: `${HOST} .mining-lib-trace-panel` },
];

type BBox = { x: number; y: number; width: number; height: number };

function overlaps(a: BBox, b: BBox): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

function within(child: BBox, parent: BBox, tolerancePx = 1): boolean {
  return (
    child.x >= parent.x - tolerancePx &&
    child.y >= parent.y - tolerancePx &&
    child.x + child.width <= parent.x + parent.width + tolerancePx &&
    child.y + child.height <= parent.y + parent.height + tolerancePx
  );
}

async function boxOrNull(locator: Locator): Promise<BBox | null> {
  if ((await locator.count()) === 0) return null;
  return locator.boundingBox();
}

async function setFilters(page: Page, clauses: FilterClause[]): Promise<void> {
  await page.evaluate((cl) => {
    (
      window as unknown as { __diagram: { setFilters(c: FilterClause[]): void } }
    ).__diagram.setFilters(cl);
  }, clauses);
}

async function setTraceCase(page: Page, caseId: string | null): Promise<void> {
  await page.evaluate((id) => {
    (
      window as unknown as { __diagram: { setTraceCase(c: string | null): void } }
    ).__diagram.setTraceCase(id);
  }, caseId);
}

async function setHappyPathVariant(page: Page, seq: string[] | null): Promise<void> {
  await page.evaluate((s) => {
    (
      window as unknown as {
        __diagram: { setHappyPathVariant(s: string[] | null): void };
      }
    ).__diagram.setHappyPathVariant(s);
  }, seq);
}

async function applyState(page: Page, state: ContentState): Promise<void> {
  // Reset to a known baseline before each state.
  await setTraceCase(page, null);
  await setHappyPathVariant(page, null);
  await setFilters(page, []);

  if (state === "default") return;

  if (state === "heavy") {
    // Pin a case + a happy path + add a couple of non-variant
    // clauses. This is the "lots of state showing in the chrome"
    // configuration that previously triggered overlap regressions.
    await setHappyPathVariant(page, ["submitted", "intake_validation", "rejected"]);
    await setTraceCase(page, "case_0042");
    return;
  }

  if (state === "empty") {
    // Impossible case-id clause → 0 cases in scope. Trace panel
    // does NOT mount in this state; chrome reduces to the three
    // primary pills + utilities + zoom.
    await setFilters(page, [{ kind: "caseId", caseIds: ["case_99999"] }]);
    return;
  }
}

for (const width of WIDTHS) {
  for (const state of STATES) {
    test(`responsive matrix: ${width}px × ${state}`, async ({ page }) => {
      await page.setViewportSize({ width: Math.max(width + 40, 360), height: 800 });
      await page.goto(`/phase14.built.html?fixture=n1000-realistic&w=${width}&h=720`);
      await expect(page.locator(SVG)).toBeVisible();
      await applyState(page, state);

      // Collect bounding boxes for the host + each resident surface.
      const hostBox = await page.locator(HOST).boundingBox();
      expect(hostBox, `host should have a bounding box at ${width}×${state}`).not.toBeNull();
      if (!hostBox) return;

      const boxes = new Map<string, BBox>();
      for (const surface of SURFACE_SELECTORS) {
        const box = await boxOrNull(page.locator(surface.selector));
        if (box !== null) boxes.set(surface.name, box);
      }

      // 1. No pair of resident chrome surfaces has overlapping bboxes.
      const names = [...boxes.keys()];
      for (let i = 0; i < names.length; i += 1) {
        for (let j = i + 1; j < names.length; j += 1) {
          const a = names[i] as string;
          const b = names[j] as string;
          const boxA = boxes.get(a) as BBox;
          const boxB = boxes.get(b) as BBox;
          expect(
            overlaps(boxA, boxB),
            `${a} overlaps ${b} at ${width}×${state}: ${JSON.stringify({ a: boxA, b: boxB })}`,
          ).toBe(false);
        }
      }

      // 2. Every visible surface sits within the host's content rect.
      // (Allow 1 px tolerance for sub-pixel rounding on borders.)
      for (const [name, box] of boxes) {
        expect(
          within(box, hostBox, 1),
          `${name} escapes host at ${width}×${state}: surface=${JSON.stringify(box)} host=${JSON.stringify(hostBox)}`,
        ).toBe(true);
      }

      // 3. State-specific sanity: trace panel mounted iff state === 'heavy'.
      if (state === "heavy") {
        expect(boxes.has("trace"), `trace panel should be mounted in heavy state`).toBe(true);
      } else {
        expect(boxes.has("trace"), `trace panel should NOT be mounted in ${state} state`).toBe(
          false,
        );
      }
    });
  }
}
