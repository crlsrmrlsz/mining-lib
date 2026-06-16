import { expect, test } from "@playwright/test";

const SVG = "#mount mining-lib-diagram svg.mining-lib-svg";
const PRIMARY = "#mount mining-lib-diagram .mining-lib-pill-primary";
const UTILITIES = "#mount mining-lib-diagram .mining-lib-pill-utilities";

const AMBER = "rgb(217, 119, 6)";
const RED = "rgb(239, 68, 68)";

test("Scenario · ▾ Mode → Time → Mean flips edges to amber and duration labels", async ({
  page,
}) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=400&h=720");
  await expect(page.locator(SVG)).toBeVisible();
  await expect(page.locator(SVG)).toHaveAttribute("data-count-mode", "absolute");

  // Open ▾ Mode popover.
  await page.locator(`${PRIMARY} button[data-popover="mode"]`).click();

  const popover = page.locator(".mining-lib-popover");
  await expect(popover).toBeVisible();

  // Two labelled sections: Count and Time.
  const sections = popover.locator(".mining-lib-mode-section");
  await expect(sections).toHaveCount(2);
  await expect(sections.nth(0).locator(".mining-lib-mode-section-title")).toHaveText("Count");
  await expect(sections.nth(1).locator(".mining-lib-mode-section-title")).toHaveText("Time");

  // Click the Mean chip in the Time section.
  await sections.nth(1).locator('button[data-mode="meanDuration"]').click();

  await expect(popover).toBeHidden();
  await expect(page.locator(SVG)).toHaveAttribute("data-count-mode", "meanDuration");
  // The Mode trigger's icon flips from sigma (count) to clock (time)
  // so the user sees the active family.
  await expect(page.locator(`${PRIMARY} button[data-popover="mode"]`)).toHaveAttribute(
    "data-icon",
    "clock",
  );

  // Edge labels now match a duration format (digits + optional decimal + unit).
  const labelTexts = await page
    .locator("g.mining-lib-edge-label text.mining-lib-edge-label-text")
    .allTextContents();
  expect(labelTexts.length).toBeGreaterThan(0);
  for (const text of labelTexts) {
    expect(text.trim()).toMatch(/^\d+(\.\d)?\s(s|m|h|d)$/);
  }

  // At least one edge stroke is the saturated high-end ramp colour.
  const strokes = await page
    .locator("path.mining-lib-edge")
    .evaluateAll((els) => els.map((e) => e.getAttribute("stroke")));
  expect(strokes).toContain(AMBER);
});

test("Scenario · dark theme preserves the amber high-end of the time ramp", async ({ page }) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=400&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  // Switch to Mean mode first via the popover.
  await page.locator(`${PRIMARY} button[data-popover="mode"]`).click();
  await page
    .locator(
      '.mining-lib-popover .mining-lib-mode-section[data-section="time"] button[data-mode="meanDuration"]',
    )
    .click();
  await expect(page.locator(SVG)).toHaveAttribute("data-count-mode", "meanDuration");

  // Toggle theme dark via the utilities pill.
  await page.locator(`${UTILITIES} button[title="Toggle theme"]`).click();

  // The host element flips its theme; amber high-end survives — at
  // least one edge still uses the saturated ramp colour.
  const strokes = await page
    .locator("path.mining-lib-edge")
    .evaluateAll((els) => els.map((e) => e.getAttribute("stroke")));
  expect(strokes).toContain(AMBER);
});

test("Scenario · embedder CSS override on --mining-time-ramp-high flips slow edges to red", async ({
  page,
}) => {
  await page.goto("/control-bar.built.html?fixture=n1000-realistic&w=400&h=720");
  await expect(page.locator(SVG)).toBeVisible();

  // Embedder override path: a stylesheet rule with !important on the
  // host-element selector beats the lib's non-important inline theme
  // application (which re-fires on every draw and would otherwise
  // overwrite a plain inline override). The renderer reads the
  // resolved value via getComputedStyle each render.
  await page.evaluate((red) => {
    const styleEl = document.createElement("style");
    styleEl.textContent = `mining-lib-diagram { --mining-time-ramp-high: ${red} !important; }`;
    document.head.appendChild(styleEl);
  }, RED);

  await page.locator(`${PRIMARY} button[data-popover="mode"]`).click();
  await page
    .locator(
      '.mining-lib-popover .mining-lib-mode-section[data-section="time"] button[data-mode="meanDuration"]',
    )
    .click();
  await expect(page.locator(SVG)).toHaveAttribute("data-count-mode", "meanDuration");

  const strokes = await page
    .locator("path.mining-lib-edge")
    .evaluateAll((els) => els.map((e) => e.getAttribute("stroke")));
  expect(strokes).toContain(RED);
  expect(strokes).not.toContain(AMBER);
});
