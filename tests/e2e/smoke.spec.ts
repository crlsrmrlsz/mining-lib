import { expect, test } from "@playwright/test";

test("declarative <mining-lib-diagram> renders the no-data SVG", async ({ page }) => {
  await page.goto("/index.built.html");

  await expect(page.locator("mining-lib-diagram#diagram")).toHaveCount(1);

  const svgs = page.locator("mining-lib-diagram svg.mining-lib-svg");
  await expect(svgs).toHaveCount(1);

  const text = page.locator("mining-lib-diagram svg.mining-lib-svg text");
  await expect(text).toBeVisible();
  await expect(text).toHaveText("No data loaded");
});
