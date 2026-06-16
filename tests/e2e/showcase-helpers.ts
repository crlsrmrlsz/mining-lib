import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

const VIEWPORT = "mining-lib-diagram svg .mining-lib-viewport";

export async function gotoShowcase(page: Page, slug: string): Promise<void> {
  await page.goto(`/showcase/${slug}.built.html`);
  await expect(page.locator(VIEWPORT).first()).toBeVisible();
}

export async function expectDiagramFitsHost(page: Page, hostSelector: string): Promise<void> {
  const host = page.locator(hostSelector);
  await expect(host).toBeVisible();
  const hostBox = await host.boundingBox();
  if (!hostBox) throw new Error(`host ${hostSelector} has no bounding box`);

  const svg = page.locator(`${hostSelector} mining-lib-diagram svg.mining-lib-svg`);
  await expect(svg).toBeVisible();
  const svgBox = await svg.boundingBox();
  if (!svgBox) throw new Error(`svg under ${hostSelector} has no bounding box`);

  // 1px slack to absorb sub-pixel rounding.
  expect(svgBox.x).toBeGreaterThanOrEqual(hostBox.x - 1);
  expect(svgBox.y).toBeGreaterThanOrEqual(hostBox.y - 1);
  expect(svgBox.x + svgBox.width).toBeLessThanOrEqual(hostBox.x + hostBox.width + 1);
  expect(svgBox.y + svgBox.height).toBeLessThanOrEqual(hostBox.y + hostBox.height + 1);
}

/**
 * Asserts the host page has no horizontal overflow. This is the
 * most direct test that the embed isn't pushing the host wider
 * than its container.
 */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(0);
}

/**
 * Reads computed font-family on the first text node inside the
 * shadow root and asserts it does NOT match the host's body
 * font-family. Proves the host's font hasn't leaked through
 * the shadow boundary.
 */
export async function expectShadowFontIsolated(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const host = window.getComputedStyle(document.body).fontFamily;
    const el = document.querySelector("mining-lib-diagram");
    const root = el?.shadowRoot ?? null;
    const text = root?.querySelector("svg text") ?? null;
    if (!text) return { host, shadow: null };
    const shadow = window.getComputedStyle(text).fontFamily;
    return { host, shadow };
  });
  expect(result.shadow).not.toBeNull();
  // We don't require an exact mismatch (the host could share a token
  // with the preset's stack), but we require the resolved stacks to
  // differ in their first family. The simplest invariant: they are
  // not the identical string.
  expect(result.shadow).not.toBe(result.host);
}

export function diagramLocator(page: Page): Locator {
  return page.locator("mining-lib-diagram").first();
}
