import { describe, expect, test, vi } from "vitest";
import { buildDfg } from "./buildDfg.js";
import {
  CACHE_SCHEMA_VERSION,
  type CacheRecord,
  clearLogCache,
  createIndexedDbStore,
  createMemoryStore,
  hashLogText,
  loadLog,
  loadLogCached,
  MAX_CACHE_ENTRIES,
} from "./logCache.js";
import { parseCsv } from "./parseCsv.js";

const TINY_CSV =
  "case:concept:name,concept:name,time:timestamp,org:resource,lifecycle:transition\n" +
  "1,submitted,2026-01-01T09:00:00,alice,complete\n" +
  "1,approved,2026-01-01T10:00:00,bob,complete\n";

/** NDJSON twin of TINY_CSV — same 1 case / 2 events, for the auto-detect path (Phase 31). */
const TINY_NDJSON =
  '{"case:concept:name":"1","concept:name":"submitted","time:timestamp":"2026-01-01T09:00:00","org:resource":"alice","lifecycle:transition":"complete"}\n' +
  '{"case:concept:name":"1","concept:name":"approved","time:timestamp":"2026-01-01T10:00:00","org:resource":"bob","lifecycle:transition":"complete"}\n';

function makeRecord(hash: string, lastUsed: number, schemaVersion = 1): CacheRecord {
  const { log, warnings } = parseCsv(TINY_CSV);
  return { hash, schemaVersion, log, dfg: buildDfg(log), warnings, lastUsed };
}

describe("hashLogText", () => {
  test("returns the known SHA-256 hex digest for 'abc'", async () => {
    expect(await hashLogText("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("returns the known SHA-256 hex digest for the empty string", async () => {
    expect(await hashLogText("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  test("produces 64 lowercase hex characters for arbitrary text", async () => {
    const hash = await hashLogText("case:concept:name,concept:name\n1,submitted\n");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("is deterministic for identical input", async () => {
    const text = "the quick brown fox jumps over the lazy dog";
    expect(await hashLogText(text)).toBe(await hashLogText(text));
  });

  test("diverges on a one-character change", async () => {
    expect(await hashLogText("event-log-v1")).not.toBe(await hashLogText("event-log-v2"));
  });
});

describe("createMemoryStore", () => {
  test("round-trips a record through put then get", async () => {
    const store = createMemoryStore();
    await store.put(makeRecord("h1", 100));
    const got = await store.get("h1");
    expect(got?.hash).toBe("h1");
    expect(got?.schemaVersion).toBe(1);
    expect(got?.log.cases.size).toBe(1);
    expect(got?.dfg.nodes.size).toBe(2);
  });

  test("get of an absent key resolves undefined", async () => {
    const store = createMemoryStore();
    expect(await store.get("missing")).toBeUndefined();
  });

  test("get returns a structured-clone copy preserving Map + Date, not the stored reference", async () => {
    const store = createMemoryStore();
    const rec = makeRecord("h1", 100);
    await store.put(rec);
    const got = await store.get("h1");
    expect(got).not.toBe(rec);
    expect(got?.log).not.toBe(rec.log);
    expect(got?.log.cases).toBeInstanceOf(Map);
    expect(got?.dfg.nodes).toBeInstanceOf(Map);
    const firstCase = [...(got?.log.cases.values() ?? [])][0];
    expect(firstCase?.events[0]?.timestamp).toBeInstanceOf(Date);
  });

  test("delete removes a record", async () => {
    const store = createMemoryStore();
    await store.put(makeRecord("h1", 100));
    await store.delete("h1");
    expect(await store.get("h1")).toBeUndefined();
  });

  test("listMeta returns hash + lastUsed projections without payloads", async () => {
    const store = createMemoryStore();
    await store.put(makeRecord("h1", 100));
    await store.put(makeRecord("h2", 200));
    const meta = await store.listMeta();
    expect(meta).toHaveLength(2);
    expect(new Set(meta.map((m) => m.hash))).toEqual(new Set(["h1", "h2"]));
    expect(meta.find((m) => m.hash === "h1")?.lastUsed).toBe(100);
    expect(meta.find((m) => m.hash === "h2")).not.toHaveProperty("log");
    expect(meta.find((m) => m.hash === "h2")).not.toHaveProperty("dfg");
  });

  test("clear empties the store", async () => {
    const store = createMemoryStore();
    await store.put(makeRecord("h1", 100));
    await store.put(makeRecord("h2", 200));
    await store.clear();
    expect(await store.listMeta()).toHaveLength(0);
  });
});

const WARN_CSV =
  "case:concept:name,concept:name,time:timestamp,org:resource,lifecycle:transition\n" +
  "1,submitted,2026-01-01T09:00:00,alice,complete\n" +
  "1,,2026-01-01T10:00:00,bob,complete\n";

/** A valid 2-event log whose case id varies by `id`, so distinct ids hash distinctly. */
const mkCsv = (id: number): string =>
  "case:concept:name,concept:name,time:timestamp,org:resource,lifecycle:transition\n" +
  `${id},submitted,2026-01-01T09:00:00,alice,complete\n` +
  `${id},approved,2026-01-01T10:00:00,bob,complete\n`;

/** Orchestrator deps with real parse/build (call-counted), an identity hash, and a movable clock. */
function makeHarness() {
  let clock = 1000;
  const store = createMemoryStore();
  const parse = vi.fn(parseCsv);
  const build = vi.fn(buildDfg);
  const hash = vi.fn(async (t: string) => t); // identity → the text itself is the key
  const now = vi.fn(() => clock);
  return {
    deps: { store, parse, build, hash, now },
    store,
    parse,
    build,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("loadLogCached", () => {
  test("cold load is a miss: parses, builds, writes a record, fromCache false", async () => {
    const h = makeHarness();
    const result = await loadLogCached(TINY_CSV, h.deps);
    expect(result.fromCache).toBe(false);
    expect(h.parse).toHaveBeenCalledTimes(1);
    expect(h.build).toHaveBeenCalledTimes(1);
    expect(result.log.cases.size).toBe(1);
    expect(result.dfg.nodes.size).toBe(2);
    expect(await h.store.listMeta()).toHaveLength(1);
    expect((await h.store.get(TINY_CSV))?.schemaVersion).toBe(CACHE_SCHEMA_VERSION);
  });

  test("warm load is a hit: no re-parse or re-build, fromCache true, recency touched", async () => {
    const h = makeHarness();
    await loadLogCached(TINY_CSV, h.deps); // miss at clock 1000
    h.advance(500);
    const result = await loadLogCached(TINY_CSV, h.deps); // hit at clock 1500
    expect(result.fromCache).toBe(true);
    expect(h.parse).toHaveBeenCalledTimes(1);
    expect(h.build).toHaveBeenCalledTimes(1);
    expect((await h.store.get(TINY_CSV))?.lastUsed).toBe(1500);
  });

  test("a cache hit returns the parse warnings the cold parse produced", async () => {
    const h = makeHarness();
    const cold = await loadLogCached(WARN_CSV, h.deps);
    expect(cold.warnings).toHaveLength(1);
    const warm = await loadLogCached(WARN_CSV, h.deps);
    expect(warm.fromCache).toBe(true);
    expect(warm.warnings).toEqual(cold.warnings);
  });

  test("a stale-schemaVersion record is treated as a miss and overwritten", async () => {
    const h = makeHarness();
    const { log, warnings } = parseCsv(TINY_CSV);
    await h.store.put({
      hash: TINY_CSV,
      schemaVersion: CACHE_SCHEMA_VERSION - 1,
      log,
      dfg: buildDfg(log),
      warnings,
      lastUsed: 1,
    });
    const result = await loadLogCached(TINY_CSV, h.deps);
    expect(result.fromCache).toBe(false);
    expect(h.parse).toHaveBeenCalledTimes(1);
    expect((await h.store.get(TINY_CSV))?.schemaVersion).toBe(CACHE_SCHEMA_VERSION);
  });

  test("keeps at most MAX_CACHE_ENTRIES, evicting the least-recently-used", async () => {
    const h = makeHarness();
    const texts = Array.from({ length: MAX_CACHE_ENTRIES + 1 }, (_, i) => mkCsv(i));
    for (const t of texts) {
      h.advance(10);
      await loadLogCached(t, h.deps);
    }
    expect(await h.store.listMeta()).toHaveLength(MAX_CACHE_ENTRIES);
    expect(await h.store.get(texts[0] as string)).toBeUndefined();
    expect(await h.store.get(texts[texts.length - 1] as string)).toBeDefined();
  });

  test("a hit touches recency so the touched record survives a later eviction", async () => {
    const h = makeHarness();
    const texts = Array.from({ length: MAX_CACHE_ENTRIES }, (_, i) => mkCsv(i));
    for (const t of texts) {
      h.advance(10);
      await loadLogCached(t, h.deps);
    }
    h.advance(10);
    await loadLogCached(texts[0] as string, h.deps); // hit → texts[0] now most-recently-used
    h.advance(10);
    await loadLogCached(mkCsv(99), h.deps); // miss → evicts the new LRU (texts[1])
    expect(await h.store.get(texts[0] as string)).toBeDefined();
    expect(await h.store.get(texts[1] as string)).toBeUndefined();
  });
});

describe("createIndexedDbStore", () => {
  test("returns null when indexedDB is unavailable (jsdom ships none)", () => {
    expect(createIndexedDbStore()).toBeNull();
  });
});

describe("loadLog + clearLogCache (jsdom fallback — no IndexedDB)", () => {
  test("resolves with a correct log + dfg and fromCache false", async () => {
    const result = await loadLog(TINY_CSV);
    expect(result.fromCache).toBe(false);
    expect(result.log.cases.size).toBe(1);
    expect(result.dfg.nodes.size).toBe(2);
    expect(result.warnings).toEqual([]);
  });

  test("never rejects for cache reasons when IndexedDB is absent", async () => {
    await expect(loadLog(TINY_CSV)).resolves.toBeDefined();
  });

  test("still throws on malformed CSV — the parser contract is not swallowed", async () => {
    await expect(loadLog("not,a,valid,header\n1,2,3,4\n")).rejects.toThrow(/mandatory column/);
  });

  test("auto-detects and loads NDJSON via parseLog (fromCache false)", async () => {
    const result = await loadLog(TINY_NDJSON);
    expect(result.fromCache).toBe(false);
    expect(result.log.cases.size).toBe(1);
    expect(result.dfg.nodes.size).toBe(2);
    expect(result.warnings).toEqual([]);
  });

  test("parses NDJSON resiliently — a malformed line warns, good events survive, no throw", async () => {
    const good =
      '{"case:concept:name":"1","concept:name":"submitted","time:timestamp":"2026-01-01T09:00:00","org:resource":null,"lifecycle:transition":"complete"}';
    const ndjson = `${good}\n{"case:concept:name":"1","concept:name": \n`;
    const result = await loadLog(ndjson);
    expect(result.fromCache).toBe(false);
    expect(result.log.events.length).toBe(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.reason).toMatch(/malformed JSON/);
  });

  test("still throws on NDJSON missing a mandatory field — parser contract not swallowed", async () => {
    const noTs =
      '{"case:concept:name":"1","concept:name":"a","org:resource":null,"lifecycle:transition":"complete"}';
    await expect(loadLog(noTs)).rejects.toThrow(/mandatory column/);
  });

  test("clearLogCache resolves to void when IndexedDB is absent", async () => {
    await expect(clearLogCache()).resolves.toBeUndefined();
  });
});
