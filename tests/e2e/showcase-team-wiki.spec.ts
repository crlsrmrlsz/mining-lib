import { expect, test } from "@playwright/test";
import {
  expectDiagramFitsHost,
  expectNoHorizontalOverflow,
  expectShadowFontIsolated,
  gotoShowcase,
} from "./showcase-helpers.js";

test("Showcase · team-wiki applies paper preset and isolates host serif", async ({ page }) => {
  await gotoShowcase(page, "team-wiki");

  await expectDiagramFitsHost(page, ".embed-block");
  await expectNoHorizontalOverflow(page);

  const el = page.locator("mining-lib-diagram").first();
  await expect(el).toHaveAttribute("preset", "paper");

  // Phase 11 isolation proof: the host's serif body font must not
  // be the resolved font-family of text nodes inside the shadow
  // root. The paper preset uses its own serif stack, so the strings
  // should differ even if both happen to be serifs.
  await expectShadowFontIsolated(page);
});

test("Showcase · team-wiki opens with one Direct Funding case pre-traced", async ({ page }) => {
  await gotoShowcase(page, "team-wiki");

  // Phase 36 curation (S3): the page picks a Direct Funding case at
  // runtime and calls `setTraceCase(id)`. The floating Trace panel
  // anchors inside the SVG cell at top-right and renders the case's
  // events as a list.
  const diagram = page.locator("mining-lib-diagram").first();
  await expect(diagram.locator(".mining-lib-trace-panel")).toBeVisible();
});
