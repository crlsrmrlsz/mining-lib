import { expect, type Page, test } from "@playwright/test";

// The log-cache demo pages load through `loadLog` and expose `window.__text`
// (the fetched CSV) + `window.__lastLoad` ({ fromCache, ms } of the page's
// own auto-load, measured around loadLog only). The UMD global is `MiningLib`.
// Each Playwright test gets a fresh browser context, so IndexedDB starts
// empty per test — except the page's auto-load, which we clear when a test
// needs a cold miss.

type LoadLogResult = {
  log: {
    cases: Map<string, { events: Array<{ caseId: string; timestamp: Date }> }>;
    events: Array<{ caseId: string; timestamp: Date }>;
  };
  dfg: { nodes: Map<string, unknown>; edges: Map<string, unknown> };
  warnings: unknown[];
  fromCache: boolean;
};

type CacheWindow = {
  MiningLib: {
    loadLog(text: string): Promise<LoadLogResult>;
    clearLogCache(): Promise<void>;
  };
  __text: string;
  __lastLoad: { fromCache: boolean; ms: number };
};

/** Wait until the page's auto-load has finished (its loadLog resolved + recorded). */
async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __lastLoad?: unknown }).__lastLoad !== undefined,
  );
}

/** The page's own auto-load result (`fromCache` + loadLog-only `ms`). */
async function lastLoad(page: Page): Promise<{ fromCache: boolean; ms: number }> {
  return page.evaluate(() => (window as unknown as CacheWindow).__lastLoad);
}

/** Run an explicit `loadLog(window.__text)` in the page; return a serialisable summary. */
async function loadInPage(
  page: Page,
): Promise<{ fromCache: boolean; nodes: number; edges: number; cases: number }> {
  return page.evaluate(async () => {
    const w = window as unknown as CacheWindow;
    const r = await w.MiningLib.loadLog(w.__text);
    return {
      fromCache: r.fromCache,
      nodes: r.dfg.nodes.size,
      edges: r.dfg.edges.size,
      cases: r.log.cases.size,
    };
  });
}

async function clearInPage(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as CacheWindow).MiningLib.clearLogCache());
}

test("cold load misses then a warm load hits with identical structure", async ({ page }) => {
  await page.goto("/log-cache.built.html?fixture=n5-fixture");
  await waitForReady(page);
  await clearInPage(page);

  const cold = await loadInPage(page);
  expect(cold.fromCache).toBe(false);
  expect(cold.nodes).toBeGreaterThan(0);

  const warm = await loadInPage(page);
  expect(warm.fromCache).toBe(true);
  expect(warm.nodes).toBe(cold.nodes);
  expect(warm.edges).toBe(cold.edges);
  expect(warm.cases).toBe(cold.cases);
});

test("a second load after a page reload restores from IndexedDB", async ({ page }) => {
  // Re-scoped (Phase 38-II D2): the former `< 100ms` assertion timed a warm
  // structuredClone + SHA-256 hit, not cold parse/build — environmental, not a
  // correctness property, and the documented env-flake. The guarantees that
  // matter are persistence-across-reload + a structurally-complete restore.
  await page.goto("/log-cache.built.html?fixture=n1000-realistic");
  await waitForReady(page); // cold auto-load populates IndexedDB
  expect((await lastLoad(page)).fromCache).toBe(false);

  await page.reload(); // fresh JS context, same origin — IndexedDB persists
  await waitForReady(page); // auto-load after reload is the second load

  // The reload's auto-load restored from IndexedDB across the fresh context.
  expect((await lastLoad(page)).fromCache).toBe(true);
  // ...and the restored record is structurally complete (not empty/corrupt).
  const restored = await loadInPage(page);
  expect(restored.fromCache).toBe(true);
  expect(restored.nodes).toBeGreaterThan(0);
  expect(restored.cases).toBeGreaterThan(0);
});

test("two distinct fixtures coexist as separate cache keys", async ({ page }) => {
  await page.goto("/log-cache.built.html?fixture=n1000-realistic");
  await waitForReady(page); // caches n1000 (cold)

  await page.goto("/log-cache.built.html?fixture=n5-fixture");
  await waitForReady(page);
  expect((await lastLoad(page)).fromCache).toBe(false); // n5 is new → cold

  await page.goto("/log-cache.built.html?fixture=n1000-realistic");
  await waitForReady(page);
  expect((await lastLoad(page)).fromCache).toBe(true); // n1000 still cached alongside n5
});

test("falls back silently when IndexedDB is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true });
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await page.goto("/log-cache.built.html?fixture=n5-fixture");
  await waitForReady(page);

  expect((await lastLoad(page)).fromCache).toBe(false); // no store → always fresh
  expect((await loadInPage(page)).fromCache).toBe(false); // no persistence between loads
  await expect(clearInPage(page)).resolves.toBeUndefined(); // resolves, never throws
  expect(pageErrors).toEqual([]);
});

test("clearLogCache forces the next load to miss", async ({ page }) => {
  await page.goto("/log-cache.built.html?fixture=n5-fixture");
  await waitForReady(page);

  expect((await loadInPage(page)).fromCache).toBe(true); // warm after the cold auto-load
  await clearInPage(page);
  expect((await loadInPage(page)).fromCache).toBe(false); // store emptied → miss
});

test("a restored log preserves Map, Date, and intra-log Event identity", async ({ page }) => {
  await page.goto("/log-cache.built.html?fixture=n5-fixture");
  await waitForReady(page); // auto-load cached the log

  const fidelity = await page.evaluate(async () => {
    const w = window as unknown as CacheWindow;
    const r = await w.MiningLib.loadLog(w.__text); // hit → the IndexedDB-restored object
    const firstCaseId = r.log.events[0]?.caseId as string;
    return {
      fromCache: r.fromCache,
      casesIsMap: r.log.cases instanceof Map,
      nodesIsMap: r.dfg.nodes instanceof Map,
      edgesIsMap: r.dfg.edges instanceof Map,
      timestampIsDate: r.log.events[0]?.timestamp instanceof Date,
      sharedIdentity: r.log.events[0] === r.log.cases.get(firstCaseId)?.events[0],
    };
  });

  expect(fidelity.fromCache).toBe(true);
  expect(fidelity.casesIsMap).toBe(true);
  expect(fidelity.nodesIsMap).toBe(true);
  expect(fidelity.edgesIsMap).toBe(true);
  expect(fidelity.timestampIsDate).toBe(true);
  expect(fidelity.sharedIdentity).toBe(true);
});
