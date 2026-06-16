import { expect, test } from "@playwright/test";

test("count-mode dropdown drives labels and data-count-mode across the four modes", async ({
  page,
}) => {
  await page.goto("/render.built.html");

  const svg = page.locator("#mount svg.mining-lib-svg");
  const reviewCount = svg.locator(
    'g.mining-lib-node[data-activity="review_in_progress"] .mining-lib-node-count',
  );
  const select = page.locator("#count-mode");

  await expect(svg).toHaveAttribute("data-count-mode", "absolute");
  await expect(reviewCount).toHaveText("7");

  await select.selectOption("case");
  await expect(svg).toHaveAttribute("data-count-mode", "case");
  await expect(reviewCount).toHaveText("4");

  await select.selectOption("maxRepetitions");
  await expect(svg).toHaveAttribute("data-count-mode", "maxRepetitions");
  await expect(reviewCount).toHaveText("4");

  await select.selectOption("meanRepetitions");
  await expect(svg).toHaveAttribute("data-count-mode", "meanRepetitions");
  await expect(reviewCount).toHaveText("1.8");

  await select.selectOption("absolute");
  await expect(svg).toHaveAttribute("data-count-mode", "absolute");
  await expect(reviewCount).toHaveText("7");
});
