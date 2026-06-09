import { expect, test } from "@playwright/test";

test("UMD bundle renders the n5 fixture DFG under #mount", async ({ page }) => {
  await page.goto("/phase3.built.html");

  const nodes = page.locator("#mount svg .mining-lib-nodes > g.mining-lib-node");
  await expect(nodes).toHaveCount(9);

  const edges = page.locator("#mount svg path.mining-lib-edge");
  await expect(edges).toHaveCount(10);

  const markers = page.locator("#mount svg marker#mining-lib-arrow");
  await expect(markers).toHaveCount(1);

  const labelFive = page.locator(
    "#mount svg g.mining-lib-edge-label text.mining-lib-edge-label-text",
    {
      hasText: "5",
    },
  );
  await expect(labelFive.first()).toBeVisible();
});
