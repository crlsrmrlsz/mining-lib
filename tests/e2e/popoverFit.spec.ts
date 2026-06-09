import { expect, type Locator, type Page, test } from "@playwright/test";

/**
 * Popover containment test.
 *
 * A trigger-anchored popover (Mode / Variants / Filters / Export) must never
 * spill past the host's right (or left) edge — otherwise its panel renders
 * half off-screen and is unreachable, which is exactly what happened to the
 * Filters popover on narrow hosts: its trigger sits at the right end of the
 * primary pill, and `createPopover` measured the *empty* envelope's width
 * before the panel content was parented in, so the right-edge clamp used a
 * stale ~120 px width and let the real ~300 px panel overflow.
 *
 * The contract under test: with the host pinned narrow (where the Filters
 * trigger is hard against the right edge), every opened popover's bounding
 * box stays within the host's bounding box.
 */

const HOST = "#mount mining-lib-diagram";
const SVG = `${HOST} svg.mining-lib-svg`;

type AttributeValue = string | number | boolean | null;
type FilterClause = { kind: "attribute"; attribute: string; values: AttributeValue[] };

type BBox = { x: number; y: number; width: number; height: number };

function within(child: BBox, parent: BBox, tolerancePx = 1): boolean {
  return (
    child.x >= parent.x - tolerancePx &&
    child.y >= parent.y - tolerancePx &&
    child.x + child.width <= parent.x + parent.width + tolerancePx &&
    child.y + child.height <= parent.y + parent.height + tolerancePx
  );
}

async function box(locator: Locator): Promise<BBox> {
  const b = await locator.boundingBox();
  if (!b) throw new Error("expected a bounding box");
  return b;
}

async function setFilters(page: Page, clauses: FilterClause[]): Promise<void> {
  await page.evaluate((cl) => {
    (
      window as unknown as { __diagram: { setFilters(c: FilterClause[]): void } }
    ).__diagram.setFilters(cl);
  }, clauses);
}

// 320 px host (the narrowest the showcase phone column reaches). The viewport
// is a touch wider so the host is not itself clipped by the window.
test.use({ viewport: { width: 360, height: 720 } });

const POPOVERS: Array<{ name: string; triggerSelector: string }> = [
  { name: "filters", triggerSelector: 'button[data-popover="filters"]' },
  { name: "variants", triggerSelector: 'button[data-popover="variants"]' },
  { name: "mode", triggerSelector: 'button[data-popover="mode"]' },
  { name: "export", triggerSelector: 'button[data-popover="export"]' },
];

for (const { name, triggerSelector } of POPOVERS) {
  test(`popover fit: ${name} popover stays within the host on a narrow host`, async ({ page }) => {
    await page.goto("/phase14.built.html?fixture=n1000-realistic&w=320&h=640");
    await expect(page.locator(SVG)).toBeVisible();

    // Active filter → the Filters panel carries an Active-chips row, the
    // state that makes the panel widest (faithful to the reported bug).
    await setFilters(page, [{ kind: "attribute", attribute: "case:priority", values: ["high"] }]);

    const trigger = page.locator(`${HOST} ${triggerSelector}`);
    await expect(trigger).toBeVisible();
    await trigger.click();

    const popover = page.locator(`${HOST} .mining-lib-popover`);
    await expect(popover).toBeVisible();

    const hostBox = await box(page.locator(HOST));
    const popBox = await box(popover);

    expect(
      within(popBox, hostBox, 1),
      `${name} popover escapes host: popover=${JSON.stringify(popBox)} host=${JSON.stringify(hostBox)}`,
    ).toBe(true);
  });
}
