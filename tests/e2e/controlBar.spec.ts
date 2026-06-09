import { expect, type Page, test } from "@playwright/test";

const VIEWPORT = "#mount mining-lib-diagram svg .mining-lib-viewport";
const PRIMARY = "#mount mining-lib-diagram .mining-lib-pill-primary";
const UTILITIES = "#mount mining-lib-diagram .mining-lib-pill-utilities";
const ZOOM = "#mount mining-lib-diagram .mining-lib-pill-zoom";

async function getTransform(page: Page): Promise<{ k: number; x: number; y: number }> {
  return page.evaluate(() => {
    const handle = (
      window as unknown as {
        __diagram: { getTransform(): { k: number; x: number; y: number } };
      }
    ).__diagram;
    return handle.getTransform();
  });
}

test("Scenario · default render mounts all three pills with three category triggers", async ({
  page,
}) => {
  await page.goto("/phase14.built.html?w=400&h=720");
  await expect(page.locator(VIEWPORT)).toBeVisible();

  await expect(page.locator(PRIMARY)).toBeVisible();
  await expect(page.locator(UTILITIES)).toBeVisible();
  await expect(page.locator(ZOOM)).toBeVisible();

  // Phase 27 follow-up (2026-05-22): primary pill carries three
  // category triggers — Mode / Variants / Filters. The Case picker
  // lives inside the Filters popover as a section now.
  await expect(page.locator(`${PRIMARY} .mining-lib-pill-chip`)).toHaveCount(0);
  const modeBtn = page.locator(`${PRIMARY} button[data-popover="mode"]`);
  await expect(modeBtn).toHaveAttribute("data-icon", "sigma");
  await expect(page.locator(`${PRIMARY} button[data-popover="variants"]`)).toContainText(
    "▾ Variants",
  );
  await expect(page.locator(`${PRIMARY} button[data-popover="filters"]`)).toContainText(
    "▾ Filters",
  );

  // Variants / Filters triggers are enabled at narrow widths.
  await expect(page.locator(`${PRIMARY} button[data-popover="variants"]`)).toBeEnabled();
  await expect(page.locator(`${PRIMARY} button[data-popover="filters"]`)).toBeEnabled();

  // Phase 32: the export icon is now live — enabled, retitled, and
  // wired to the SVG / PNG download menu.
  const exportBtn = page.locator(`${UTILITIES} button[data-popover="export"]`);
  await expect(exportBtn).toBeEnabled();
  await expect(exportBtn).toHaveAttribute("title", "Export image");
});

test("Scenario · filters popover anchors under trigger; outside-click and Esc dismiss", async ({
  page,
}) => {
  await page.goto("/phase14.built.html?w=400&h=720");
  await expect(page.locator(VIEWPORT)).toBeVisible();

  const trigger = page.locator(`${PRIMARY} button[data-popover="filters"]`);
  await trigger.click();

  const popover = page.locator("#mount mining-lib-diagram .mining-lib-popover");
  await expect(popover).toBeVisible();

  // Phase 22: the ▾ Filters popover hosts ONLY the slim Filters panel
  // (Active chip row + Clear all). Variants live behind ▾ Variants.
  await expect(popover.locator(".mining-lib-filters-panel")).toBeVisible();
  await expect(popover.locator(".mining-lib-variants-panel")).toHaveCount(0);

  // Anchored beneath the trigger.
  const popoverBox = await popover.boundingBox();
  const triggerBox = await trigger.boundingBox();
  if (!popoverBox || !triggerBox) throw new Error("popover or trigger not measurable");
  expect(popoverBox.y).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height - 1);

  // Click outside dismisses.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect(popover).toHaveCount(0);

  // Re-open then dismiss with Esc.
  await trigger.click();
  await expect(popover).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
});

test("Scenario · variants popover anchors under ▾ Variants trigger; hosts the variant list", async ({
  page,
}) => {
  await page.goto("/phase14.built.html?w=400&h=720");
  await expect(page.locator(VIEWPORT)).toBeVisible();

  const trigger = page.locator(`${PRIMARY} button[data-popover="variants"]`);
  await trigger.click();

  const popover = page.locator("#mount mining-lib-diagram .mining-lib-popover");
  await expect(popover).toBeVisible();

  // Phase 22: ▾ Variants popover hosts the Variants panel only.
  await expect(popover.locator(".mining-lib-variants-panel")).toBeVisible();
  await expect(popover.locator(".mining-lib-filters-panel")).toHaveCount(0);
  const checkboxes = popover.locator(".mining-lib-variants-panel input[type='checkbox']");
  await expect(checkboxes.first()).toBeVisible();

  // Anchored beneath the trigger.
  const popoverBox = await popover.boundingBox();
  const triggerBox = await trigger.boundingBox();
  if (!popoverBox || !triggerBox) throw new Error("popover or trigger not measurable");
  expect(popoverBox.y).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height - 1);

  // Esc dismisses.
  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
});

test("Scenario · click a node selects it and mounts the floating selection pill", async ({
  page,
}) => {
  await page.goto("/phase14.built.html?w=400&h=720");
  await expect(page.locator(VIEWPORT)).toBeVisible();

  await page
    .locator('#mount mining-lib-diagram g.mining-lib-node[data-activity="review_in_progress"]')
    .click();

  // Class is on the matching SVG group.
  await expect(
    page.locator('#mount mining-lib-diagram g.mining-lib-node[data-activity="review_in_progress"]'),
  ).toHaveClass(/mining-lib-selected/);

  const pill = page.locator("#mount mining-lib-diagram .mining-lib-pill-selection");
  await expect(pill).toBeVisible();
  await expect(pill.locator(".mining-lib-pill-filter")).toHaveText("Filter to cases through this");

  // Esc clears selection — pill un-mounts.
  await page.keyboard.press("Escape");
  await expect(pill).toHaveCount(0);
});

test("Scenario · selecting an edge swaps the pill to the edge action label", async ({ page }) => {
  await page.goto("/phase14.built.html?w=400&h=720");
  await expect(page.locator(VIEWPORT)).toBeVisible();

  await page.evaluate(() => {
    (
      window as unknown as {
        __diagram: { select(t: { kind: "edge"; id: string }): void };
      }
    ).__diagram.select({ kind: "edge", id: "submitted→intake_validation" });
  });

  const pill = page.locator("#mount mining-lib-diagram .mining-lib-pill-selection");
  await expect(pill).toBeVisible();
  await expect(pill.locator(".mining-lib-pill-filter")).toHaveText(
    "Filter to cases through this branch",
  );
});

test("Scenario · theme toggle flips data-theme on host and svg", async ({ page }) => {
  await page.goto("/phase14.built.html?w=400&h=720");
  await expect(page.locator(VIEWPORT)).toBeVisible();

  await page.locator(`${UTILITIES} button[title="Toggle theme"]`).click();

  await expect(page.locator("#mount mining-lib-diagram")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("#mount mining-lib-diagram svg.mining-lib-svg")).toHaveAttribute(
    "data-theme",
    "dark",
  );
});

test("Scenario · linear preset at creation overlays accent on top", async ({ page }) => {
  await page.goto("/phase14.built.html?preset=linear&accent=ec4899&w=400&h=720");
  await expect(page.locator(VIEWPORT)).toBeVisible();

  const accent = await page.evaluate(() => {
    const el = document.querySelector("mining-lib-diagram") as HTMLElement;
    return el.style.getPropertyValue("--mining-accent").trim();
  });
  expect(accent).toBe("#ec4899");

  const preset = await page.evaluate(() =>
    (window as unknown as { __diagram: { getPreset(): string } }).__diagram.getPreset(),
  );
  expect(preset).toBe("linear");
});

test("Scenario · paper preset disables the canvas dot grid", async ({ page }) => {
  await page.goto("/phase14.built.html?preset=paper&w=400&h=720");
  await expect(page.locator(VIEWPORT)).toBeVisible();

  const gridDot = await page.evaluate(() => {
    const el = document.querySelector("mining-lib-diagram") as HTMLElement;
    return el.style.getPropertyValue("--mining-grid-dot").trim();
  });
  expect(gridDot).toBe("transparent");
});

test("Scenario · controls=none renders no UI but imperative API still works", async ({ page }) => {
  await page.goto("/phase14.built.html?controls=none&w=400&h=720");
  await expect(page.locator(VIEWPORT)).toBeVisible();

  // Pills are not visible.
  await expect(page.locator(PRIMARY)).toBeHidden();
  await expect(page.locator(UTILITIES)).toBeHidden();
  await expect(page.locator(ZOOM)).toBeHidden();

  // Selection pill never mounts.
  await expect(page.locator("#mount mining-lib-diagram .mining-lib-pill-selection")).toHaveCount(0);

  // Imperative selection still works and dispatches the select event.
  const detail = await page.evaluate(() => {
    return new Promise<unknown>((resolve) => {
      const el = document.querySelector("mining-lib-diagram") as HTMLElement;
      el.addEventListener("select", (ev) => resolve((ev as CustomEvent).detail), { once: true });
      (
        window as unknown as {
          __diagram: { select(t: { kind: "node"; id: string }): void };
        }
      ).__diagram.select({ kind: "node", id: "submitted" });
    });
  });
  expect(detail).toEqual({ kind: "node", id: "submitted" });
});

test("Scenario · selecting a node mounts the floating pill without reflowing the diagram", async ({
  page,
}) => {
  await page.goto("/phase14.built.html?w=400&h=720");
  await expect(page.locator(VIEWPORT)).toBeVisible();

  const before = await getTransform(page);

  await page
    .locator('#mount mining-lib-diagram g.mining-lib-node[data-activity="review_in_progress"]')
    .click();
  await expect(page.locator("#mount mining-lib-diagram .mining-lib-pill-selection")).toBeVisible();

  // The pill overlays the canvas; the diagram transform must not
  // change on selection.
  const after = await getTransform(page);
  expect(after.k).toBeCloseTo(before.k, 5);
  expect(after.x).toBeCloseTo(before.x, 5);
  expect(after.y).toBeCloseTo(before.y, 5);
});

test("Scenario · top pill cluster reserves a fit-to-view inset (no overlap with topmost node)", async ({
  page,
}) => {
  await page.goto("/phase14.built.html?w=400&h=720");
  await expect(page.locator(VIEWPORT)).toBeVisible();

  // The fit-to-view band excludes the top 48px reserved for the
  // primary/utilities pills. Every rendered node must lie strictly
  // below the primary pill's bottom edge.
  const primaryBottom = await page
    .locator(PRIMARY)
    .evaluate((el) => el.getBoundingClientRect().bottom);
  const nodeTops = await page
    .locator("#mount mining-lib-diagram g.mining-lib-node")
    .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().top));
  expect(nodeTops.length).toBeGreaterThan(0);
  for (const top of nodeTops) {
    expect(top).toBeGreaterThanOrEqual(primaryBottom);
  }
});

test("Scenario · ▾ Mode popover splits into Count + Time sub-sections", async ({ page }) => {
  await page.goto("/phase14.built.html?w=400&h=720");
  await expect(page.locator(VIEWPORT)).toBeVisible();

  // Open the ▾ Mode popover. The trigger is visible in wide layout
  // since Phase 17 — both inline count chips and the popover's
  // wider catalogue (now including Time) need to coexist.
  await page.locator(`${PRIMARY} button[data-popover="mode"]`).click();

  const popover = page.locator("#mount mining-lib-diagram .mining-lib-popover");
  await expect(popover).toBeVisible();

  const sections = popover.locator(".mining-lib-mode-section");
  await expect(sections).toHaveCount(2);

  const countSection = popover.locator('.mining-lib-mode-section[data-section="count"]');
  await expect(countSection.locator(".mining-lib-mode-section-title")).toHaveText("Count");
  const countChipLabels = await countSection.locator(".mining-lib-pill-chip").allTextContents();
  expect(countChipLabels.map((s) => s.trim())).toEqual(["Abs", "Case", "Mean", "Max"]);

  const timeSection = popover.locator('.mining-lib-mode-section[data-section="time"]');
  await expect(timeSection.locator(".mining-lib-mode-section-title")).toHaveText("Time");
  const timeChipLabels = await timeSection.locator(".mining-lib-pill-chip").allTextContents();
  expect(timeChipLabels.map((s) => s.trim())).toEqual(["Mean", "Median"]);
});
