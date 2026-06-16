import { expect, test } from "@playwright/test";
import {
  expectDiagramFitsHost,
  expectNoHorizontalOverflow,
  gotoShowcase,
} from "./showcase-helpers.js";

test("Showcase · marketing-docs hero embed fits below the headline", async ({ page }) => {
  await gotoShowcase(page, "marketing-docs");

  await expectDiagramFitsHost(page, ".hero-embed");
  await expectNoHorizontalOverflow(page);

  // Default preset.
  const preset = await page.locator("mining-lib-diagram").first().getAttribute("preset");
  expect(preset).toBeNull();

  // The hero block sits above the embed in the document order.
  const heroBox = await page.locator(".hero").boundingBox();
  const embedBox = await page.locator(".hero-embed").boundingBox();
  if (!heroBox || !embedBox) throw new Error("missing layout boxes");
  expect(embedBox.y).toBeGreaterThan(heroBox.y);
});

test("Showcase · marketing-docs opens with the Direct Funding happy-path overlay applied", async ({
  page,
}) => {
  await gotoShowcase(page, "marketing-docs");

  // Phase 36 curation (S1): nodes outside the pinned variant render with
  // `.mining-lib-faded`. The overlay applies after `setHappyPathVariant`
  // runs in the page's <script>; the diagram has 13 activities, of which
  // only 8 are on the Direct Funding path — at least 1 node must be faded.
  const diagram = page.locator("mining-lib-diagram").first();
  await expect(diagram.locator("g.mining-lib-node.mining-lib-faded").first()).toBeVisible();
});
