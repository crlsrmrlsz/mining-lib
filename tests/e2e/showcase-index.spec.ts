import { expect, test } from "@playwright/test";

test("Showcase · index lists 5 cards each linking to a real host page", async ({ page }) => {
  await page.goto("/showcase/index.built.html");

  const cards = page.locator(".card");
  await expect(cards).toHaveCount(5);

  // Every card has a live <mining-lib-diagram> preview that mounts
  // its viewport — i.e. the shared fetch+parse pipeline reaches all
  // five.
  await expect(page.locator(".card mining-lib-diagram svg .mining-lib-viewport")).toHaveCount(5);

  // Every card's href resolves (HEAD 200).
  const hrefs = await cards.evaluateAll((els) =>
    els.map((c) => (c as HTMLAnchorElement).getAttribute("href")),
  );
  expect(hrefs).toHaveLength(5);
  for (const href of hrefs) {
    expect(href).toBeTruthy();
    const url = new URL(href as string, page.url());
    const response = await page.request.get(url.toString());
    expect(response.status(), `GET ${url.toString()}`).toBe(200);
  }

  // Three default + linear (dark-analytics card) + paper (team-wiki card).
  const presetAttrs = await page
    .locator(".card mining-lib-diagram")
    .evaluateAll((els) => els.map((e) => e.getAttribute("preset")));
  expect(presetAttrs.filter((p) => p === null)).toHaveLength(3);
  expect(presetAttrs).toContain("linear");
  expect(presetAttrs).toContain("paper");
});
