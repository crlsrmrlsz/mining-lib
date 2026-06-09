import { expect, type Page, test } from "@playwright/test";

// phase31.built.html loads through loadLog (auto-detect) and exposes
// window.__detected (the detectLogFormat verdict), __text, and __lastLoad
// ({ fromCache, ms } of the page's own auto-load). ?format=json (default)
// fetches events.json; ?format=csv fetches events.csv. The UMD global is
// MiningLib. Each test gets a fresh browser context → empty IndexedDB.

const NODE = "#mount mining-lib-diagram svg.mining-lib-svg g.mining-lib-node";
const EDGE = "#mount mining-lib-diagram svg.mining-lib-svg path.mining-lib-edge";

type NdjsonWindow = {
  __detected: "csv" | "ndjson";
  __lastLoad: { fromCache: boolean; ms: number };
};

async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __lastLoad?: unknown }).__lastLoad !== undefined,
  );
}

async function detected(page: Page): Promise<"csv" | "ndjson"> {
  return page.evaluate(() => (window as unknown as NdjsonWindow).__detected);
}

async function fromCache(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as NdjsonWindow).__lastLoad.fromCache);
}

async function renderedCounts(page: Page): Promise<{ nodes: number; edges: number }> {
  await expect(page.locator(NODE).first()).toBeVisible();
  return { nodes: await page.locator(NODE).count(), edges: await page.locator(EDGE).count() };
}

test("auto-detects NDJSON and renders the diagram (default format)", async ({ page }) => {
  await page.goto("/phase31.built.html?fixture=n5-fixture");
  await waitForReady(page);

  expect(await detected(page)).toBe("ndjson");
  const { nodes, edges } = await renderedCounts(page);
  expect(nodes).toBeGreaterThan(0);
  expect(edges).toBeGreaterThan(0);
});

test("NDJSON renders the same diagram as CSV (cross-format render parity)", async ({ page }) => {
  await page.goto("/phase31.built.html?fixture=n5-fixture&format=json");
  await waitForReady(page);
  expect(await detected(page)).toBe("ndjson");
  const json = await renderedCounts(page);

  await page.goto("/phase31.built.html?fixture=n5-fixture&format=csv");
  await waitForReady(page);
  expect(await detected(page)).toBe("csv");
  const csv = await renderedCounts(page);

  expect(json.nodes).toBe(csv.nodes);
  expect(json.edges).toBe(csv.edges);
  expect(json.nodes).toBeGreaterThan(0);
  expect(json.edges).toBeGreaterThan(0);
});

test("CSV and NDJSON of the same fixture cache under separate keys (D8)", async ({ page }) => {
  await page.goto("/phase31.built.html?fixture=n5-fixture&format=json");
  await waitForReady(page); // NDJSON cold auto-load
  expect(await fromCache(page)).toBe(false);

  await page.goto("/phase31.built.html?fixture=n5-fixture&format=csv");
  await waitForReady(page); // CSV is different bytes → its own cold key
  expect(await fromCache(page)).toBe(false);

  await page.goto("/phase31.built.html?fixture=n5-fixture&format=json");
  await waitForReady(page); // NDJSON still cached alongside CSV → hit
  expect(await fromCache(page)).toBe(true);
});

test("auto-detects and renders the larger NDJSON fixture", async ({ page }) => {
  await page.goto("/phase31.built.html?fixture=n1000-realistic&format=json");
  await waitForReady(page);

  expect(await detected(page)).toBe("ndjson");
  const { nodes, edges } = await renderedCounts(page);
  expect(nodes).toBeGreaterThan(0);
  expect(edges).toBeGreaterThan(0);
});
