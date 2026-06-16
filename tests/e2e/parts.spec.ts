import { expect, test } from "@playwright/test";
import { gotoShowcase } from "./showcase-helpers.js";

// `::part()` is a public theming surface (see specs/design-tokens.md → "Shadow
// parts"). Verify a representative resident part is actually styleable from
// outside the shadow root — the contract embedders rely on (Phase 38-II B6).
test("::part(svg-cell) is styleable from the host page", async ({ page }) => {
  await gotoShowcase(page, "admin-saas");
  await page.addStyleTag({
    content: "mining-lib-diagram::part(svg-cell) { outline: 3px solid rgb(255, 0, 0); }",
  });
  const outline = await page.evaluate(() => {
    const el = document.querySelector("mining-lib-diagram");
    const cell = el?.shadowRoot?.querySelector('[part="svg-cell"]');
    return cell ? getComputedStyle(cell as HTMLElement).outlineColor : "no-cell";
  });
  expect(outline).toBe("rgb(255, 0, 0)");
});
