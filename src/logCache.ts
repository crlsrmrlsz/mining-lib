/**
 * Preprocessed-log cache (Phase 30). A content-hash IndexedDB cache
 * sitting in front of `parseLog` (CSV / NDJSON) + `buildDfg`, exposed to embedders
 * as the single async `loadLog` entry point plus a `clearLogCache`
 * escape hatch. The store is a thin async key-value port; the cache
 * policy (version invalidation + bounded LRU) lives in the
 * orchestrator so it is tested once, against the in-memory fake.
 */

import { buildDfg } from "./buildDfg.js";
import { parseLog } from "./parseNdjson.js";
import type { Dfg, EventLog, ParseResult, ParseWarning } from "./types.js";

/** IndexedDB database name. */
export const DB_NAME = "mining-lib-cache";
/**
 * IndexedDB structural version — bump ONLY when the object-store /
 * index layout changes. Distinct from {@link CACHE_SCHEMA_VERSION},
 * which tracks the shape of the cached payload.
 */
export const DB_VERSION = 1;
/** Object store name; keyed by the content hash. */
export const STORE_NAME = "logs";
/** Index on `lastUsed`, used to evict the least-recently-used record. */
export const LAST_USED_INDEX = "byLastUsed";
/**
 * Per-record payload-shape stamp. BUMP THIS whenever `parseCsv` /
 * `parseNdjson` or `buildDfg` change the shape of the `EventLog` / `Dfg` they produce
 * (a new field, a changed aggregate, …). A record whose
 * `schemaVersion` differs from this constant is treated as a cache
 * miss, so a library upgrade never serves a stale payload. Distinct
 * from {@link DB_VERSION} (the IndexedDB structural version).
 */
export const CACHE_SCHEMA_VERSION = 1;
/** LRU ceiling — at most this many logs are retained at once. */
export const MAX_CACHE_ENTRIES = 5;

/** One cached parse: the log, its DFG, and the parse warnings. */
export type CacheRecord = {
  /** Primary key — SHA-256 hex of the raw text (see {@link hashLogText}). */
  hash: string;
  /** {@link CACHE_SCHEMA_VERSION} at write time. */
  schemaVersion: number;
  log: EventLog;
  dfg: Dfg;
  warnings: ParseWarning[];
  /** Epoch ms of last read/write — the LRU recency key. */
  lastUsed: number;
};

/**
 * Async key-value port over cache records. Two adapters implement it:
 * {@link createIndexedDbStore} (production) and {@link createMemoryStore}
 * (dependency-free, for unit tests and as a reasoning aid). The port
 * holds no policy — `listMeta` exists so the orchestrator can run LRU
 * eviction without deserialising stored payloads.
 */
export interface LogCacheStore {
  get(hash: string): Promise<CacheRecord | undefined>;
  put(record: CacheRecord): Promise<void>;
  delete(hash: string): Promise<void>;
  listMeta(): Promise<Array<{ hash: string; lastUsed: number }>>;
  clear(): Promise<void>;
}

/** Lowercase SHA-256 hex digest of `text`, via the Web Crypto API (no deps). */
export async function hashLogText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  let hex = "";
  for (const b of new Uint8Array(digest)) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * In-memory {@link LogCacheStore}. Clones on both `put` and `get` so it
 * mirrors IndexedDB's structured-clone copy-on-write / copy-on-read
 * semantics — a record handed to `put` and one returned from `get` are
 * independent of each other and of the caller's references.
 */
export function createMemoryStore(): LogCacheStore {
  const records = new Map<string, CacheRecord>();
  return {
    async get(hash) {
      const record = records.get(hash);
      return record === undefined ? undefined : structuredClone(record);
    },
    async put(record) {
      records.set(record.hash, structuredClone(record));
    },
    async delete(hash) {
      records.delete(hash);
    },
    async listMeta() {
      return [...records.values()].map((r) => ({ hash: r.hash, lastUsed: r.lastUsed }));
    },
    async clear() {
      records.clear();
    },
  };
}

/** Result of {@link loadLog} / {@link loadLogCached}. */
export type LoadLogResult = {
  log: EventLog;
  dfg: Dfg;
  warnings: ParseWarning[];
  /** `true` when restored from the cache; `false` on a fresh parse or any fallback. */
  fromCache: boolean;
};

/** Injected dependencies for {@link loadLogCached} (Decision D8 — testability seam). */
type LoadLogCachedDeps = {
  store: LogCacheStore;
  parse: (text: string) => ParseResult;
  build: (log: EventLog) => Dfg;
  hash: (text: string) => Promise<string>;
  now: () => number;
};

/**
 * Cache orchestrator: the hit/miss + version-invalidation + LRU policy,
 * pure over its injected `deps`. A hit (matching `schemaVersion`) touches
 * recency and returns the stored payload; a miss — or a record written
 * under a stale `schemaVersion` — parses + builds fresh, writes a
 * current-version record, and enforces the LRU ceiling. Unit-tested
 * against `createMemoryStore`; bound to the real IndexedDB store +
 * `crypto.subtle` hash by {@link loadLog}.
 */
export async function loadLogCached(text: string, deps: LoadLogCachedDeps): Promise<LoadLogResult> {
  const key = await deps.hash(text);
  const existing = await deps.store.get(key);
  if (existing !== undefined && existing.schemaVersion === CACHE_SCHEMA_VERSION) {
    existing.lastUsed = deps.now();
    await deps.store.put(existing);
    return { log: existing.log, dfg: existing.dfg, warnings: existing.warnings, fromCache: true };
  }
  const { log, warnings } = deps.parse(text);
  const dfg = deps.build(log);
  await deps.store.put({
    hash: key,
    schemaVersion: CACHE_SCHEMA_VERSION,
    log,
    dfg,
    warnings,
    lastUsed: deps.now(),
  });
  await enforceLru(deps.store);
  return { log, dfg, warnings, fromCache: false };
}

/** Delete least-recently-used records until at most `MAX_CACHE_ENTRIES` remain. */
async function enforceLru(store: LogCacheStore): Promise<void> {
  const meta = await store.listMeta();
  if (meta.length <= MAX_CACHE_ENTRIES) return;
  meta.sort((a, b) => a.lastUsed - b.lastUsed);
  for (let i = 0; i < meta.length - MAX_CACHE_ENTRIES; i += 1) {
    const victim = meta[i];
    if (victim !== undefined) await store.delete(victim.hash);
  }
}

/**
 * Production {@link LogCacheStore} backed by IndexedDB. Returns `null`
 * synchronously when the `indexedDB` global is absent (e.g. some
 * private-browsing modes), so the caller can fall back without a
 * try/catch on that common path. The connection is opened lazily and
 * memoised; `listMeta` walks the `byLastUsed` index with a *key* cursor
 * so it never deserialises a stored log. Thin by design — its
 * behaviour is verified end-to-end by the Playwright suite (Chromium
 * has real IndexedDB; jsdom does not — Decision D8).
 */
export function createIndexedDbStore(): LogCacheStore | null {
  if (typeof indexedDB === "undefined") return null;

  let dbPromise: Promise<IDBDatabase> | null = null;
  const openDb = (): Promise<IDBDatabase> => {
    if (dbPromise === null) {
      dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: "hash" });
            store.createIndex(LAST_USED_INDEX, "lastUsed");
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("indexedDB.open failed"));
        request.onblocked = () => reject(new Error("indexedDB.open blocked"));
      });
    }
    return dbPromise;
  };

  const request = <T>(
    mode: IDBTransactionMode,
    body: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> =>
    openDb().then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const req = body(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
        }),
    );

  return {
    async get(hash) {
      return request<CacheRecord | undefined>("readonly", (s) => s.get(hash));
    },
    async put(record) {
      await request("readwrite", (s) => s.put(record));
    },
    async delete(hash) {
      await request("readwrite", (s) => s.delete(hash));
    },
    async clear() {
      await request("readwrite", (s) => s.clear());
    },
    listMeta() {
      return openDb().then(
        (db) =>
          new Promise<Array<{ hash: string; lastUsed: number }>>((resolve, reject) => {
            const meta: Array<{ hash: string; lastUsed: number }> = [];
            const cursorReq = db
              .transaction(STORE_NAME, "readonly")
              .objectStore(STORE_NAME)
              .index(LAST_USED_INDEX)
              .openKeyCursor();
            cursorReq.onsuccess = () => {
              const cursor = cursorReq.result;
              if (cursor === null) {
                resolve(meta);
                return;
              }
              meta.push({ hash: cursor.primaryKey as string, lastUsed: cursor.key as number });
              cursor.continue();
            };
            cursorReq.onerror = () =>
              reject(cursorReq.error ?? new Error("listMeta cursor failed"));
          }),
      );
    },
  };
}

/**
 * Parse + build a log with the IndexedDB cache in front — the public
 * entry point (Phase 30). The input format (CSV or NDJSON) is
 * auto-detected by `parseLog` (Phase 31). On a cache hit the parse + DFG
 * build are skipped and the stored result is returned with
 * `fromCache: true`. The cache is a pure optimisation: any IndexedDB
 * failure (absent global, blocked open, quota exceeded, corrupt record)
 * falls back silently to a fresh `parseLog` + `buildDfg` with
 * `fromCache: false` — it never rejects for cache reasons (Decision D7).
 * A genuine `parseLog` error on malformed input still throws (that is the
 * parser's contract, not a cache failure).
 */
export async function loadLog(text: string): Promise<LoadLogResult> {
  try {
    const store = createIndexedDbStore();
    if (store !== null) {
      return await loadLogCached(text, {
        store,
        parse: parseLog,
        build: buildDfg,
        hash: hashLogText,
        now: Date.now,
      });
    }
  } catch {
    // Cache unavailable or failed — fall through to the uncached path.
  }
  const { log, warnings } = parseLog(text);
  return { log, dfg: buildDfg(log), warnings, fromCache: false };
}

/**
 * Empty the cache — the documented bust button for "I'm seeing stale
 * data". Resolves silently (never rejects) when IndexedDB is unavailable
 * (Decision D7).
 */
export async function clearLogCache(): Promise<void> {
  try {
    const store = createIndexedDbStore();
    if (store !== null) await store.clear();
  } catch {
    // Cache unavailable / nothing to clear — silent (Decision D7).
  }
}
