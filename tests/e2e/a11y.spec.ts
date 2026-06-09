import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { gotoShowcase } from "./showcase-helpers.js";

// Accessibility delivery line (Phase 38-II B3 + Phase 39 G). axe scans the
// `<mining-lib-diagram>` element + its shadow content (axe pierces shadow DOM)
// across the FULL showcase × theme/preset/state matrix and fails on
// serious/critical WCAG 2 A/AA violations. The focus/ARIA block confirms the
// 38-II wiring (focusable labelled canvas, dialog popovers). Node-level
// roving-tabindex keyboard operability of the DFG is a deferred a11y phase.

// Each showcase is a distinct theme/preset/state: admin-saas (default,
// neutral), dark-analytics (linear, dark, Mean-time), marketing-docs (default,
// happy-path pinned), team-wiki (paper, case pre-traced), mobile-case (narrow,
// attribute filter). Scanning all five covers the matrix.
const SHOWCASES = ["admin-saas", "dark-analytics", "marketing-docs", "team-wiki", "mobile-case"];

for (const slug of SHOWCASES) {
  test(`${slug}: no serious/critical axe violations in the diagram component`, async ({ page }) => {
    await gotoShowcase(page, slug);
    const results = await new AxeBuilder({ page })
      .include("mining-lib-diagram")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    const summary = serious.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
    expect(serious, JSON.stringify(summary, null, 2)).toEqual([]);
  });
}

// Focus + ARIA contract (Phase 38-II B2/B3) — a definition-of-done item, not an
// afterthought. Mounts the comprehensive phase14 demo (all chrome present).
const PAGE = "/phase14.built.html?fixture=n5-fixture&w=1200&h=720";
const HOST = "#mount mining-lib-diagram";

async function goto(page: Page): Promise<void> {
  await page.goto(PAGE);
  await expect(page.locator(`${HOST} svg .mining-lib-viewport`)).toBeVisible();
}

test.describe("focus + ARIA contract", () => {
  test("the diagram canvas is a focusable, labelled image", async ({ page }) => {
    await goto(page);
    const canvas = page.locator(`${HOST} [role="img"]`).first();
    await expect(canvas).toHaveAttribute("tabindex", "0");
    const label = await canvas.getAttribute("aria-label");
    // Dynamic label: "N activities, M transitions" — must be present + meaningful.
    expect(label ?? "").toMatch(/\d/);
  });

  test("popover triggers declare a dialog popup", async ({ page }) => {
    await goto(page);
    const triggers = page.locator(`${HOST} [aria-haspopup="dialog"]`);
    expect(await triggers.count()).toBeGreaterThanOrEqual(1);
  });

  test("opening a trigger reveals a labelled dialog", async ({ page }) => {
    await goto(page);
    await page.locator(`${HOST} [part="variants-trigger-pill"]`).click();
    const dialog = page.locator(`${HOST} [role="dialog"]`).first();
    await expect(dialog).toBeVisible();
    const label = await dialog.getAttribute("aria-label");
    expect((label ?? "").length).toBeGreaterThan(0);
  });
});
