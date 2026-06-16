/**
 * Date-filter helpers (Phase 26).
 *
 * Pure, dependency-free functions powering the date-range filter:
 * - `logDateRange` — single-pass min/max of an event log
 * - `parseDateBound` — the single boundary for the native
 *   `<input type="date">` UTC-midnight gotcha (see comment in body)
 * - `caseInDateRange` — the four PM4Py-style anchor predicates
 * - `bucketEventVolume` — equal-width bucketing for the histogram
 * - `presetRange` — last-N-days presets anchored to the log's max
 * - `formatDateChipLabel` — compact human-readable chip text
 *
 * The matcher in `filterClauses.ts` re-exports `parseDateBound` and
 * `caseInDateRange` from here so the boundary translation and the
 * anchor logic each live in one place.
 */
import type { Case, Event, EventLog } from "./types.js";

/**
 * Date-filter anchor mode (Phase 26, simplified 2026-05-21 follow-up).
 * Two PM4Py-style `timestamp_*` semantics — `started` tests the case's first
 * event, `ended` tests the last. The `contained` and `intersecting` modes
 * shipped initially were dropped after user feedback. The default remains
 * `"started"`. (Lives here, not in filterClauses.ts, so filterClauses ⇄
 * dateFilter isn't a circular import — Phase 38-II E3.)
 */
export type DateAnchor = "started" | "ended";

/**
 * Earliest and latest event timestamps across the log. Returns
 * `null` for empty logs so callers can shortcut (auto-hide the
 * date section, skip histogram render, etc.).
 */
export function logDateRange(log: EventLog): { min: Date; max: Date } | null {
  if (log.events.length === 0) return null;
  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = Number.NEGATIVE_INFINITY;
  for (const ev of log.events) {
    const t = ev.timestamp.getTime();
    if (t < minMs) minMs = t;
    if (t > maxMs) maxMs = t;
  }
  return { min: new Date(minMs), max: new Date(maxMs) };
}

/**
 * Translate an ISO `YYYY-MM-DD` date-only string (native
 * `<input type="date">`'s emission format) into a ms-since-epoch
 * boundary.
 *
 * Quirk handled here: `new Date("2026-03-01")` is parsed as UTC
 * midnight, not local midnight, because the spec interprets a
 * timestamp without a TZ designator at date-only granularity as
 * UTC. Users picking dates in a calendar widget expect the bound
 * to be "start of that day in my local view", so we append
 * `T00:00:00` (or `T23:59:59.999` for upper bounds) to force the
 * local-time interpretation.
 */
export function parseDateBound(s: string | null, kind: "from" | "to"): number {
  if (s === null) return kind === "from" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  const suffix = kind === "from" ? "T00:00:00" : "T23:59:59.999";
  return new Date(s + suffix).getTime();
}

/**
 * Anchor predicate. `started` tests the case's first event
 * timestamp; `ended` tests the last. A zero-event case is rejected
 * by either anchor — defensive against malformed input from
 * programmatic callers.
 */
export function caseInDateRange(
  c: Case,
  fromMs: number,
  toMs: number,
  anchor: DateAnchor,
): boolean {
  if (c.events.length === 0) return false;
  const first = (c.events[0] as Event).timestamp.getTime();
  const last = (c.events[c.events.length - 1] as Event).timestamp.getTime();
  switch (anchor) {
    case "started":
      return first >= fromMs && first <= toMs;
    case "ended":
      return last >= fromMs && last <= toMs;
  }
}

export type EventVolumeBucket = { x0: number; x1: number; count: number };

/**
 * Bucket the log's events into `bucketCount` equal-width intervals
 * across `[logMin, logMax]`. Fixed at 40 by the section so all
 * logs read with the same visual density (Phase 26 D4).
 *
 * Edge cases:
 * - empty log → `[]`
 * - single-event log (degenerate range, min === max) → one
 *   bucket containing the whole event count, span collapsed
 *   to the single timestamp
 */
export function bucketEventVolume(log: EventLog, bucketCount: number): EventVolumeBucket[] {
  if (log.events.length === 0) return [];
  const range = logDateRange(log);
  if (range === null) return [];
  const minMs = range.min.getTime();
  const maxMs = range.max.getTime();
  if (minMs === maxMs) {
    return [{ x0: minMs, x1: maxMs, count: log.events.length }];
  }
  const totalSpan = maxMs - minMs;
  const bucketWidth = totalSpan / bucketCount;
  const buckets: EventVolumeBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    x0: minMs + i * bucketWidth,
    x1: minMs + (i + 1) * bucketWidth,
    count: 0,
  }));
  for (const ev of log.events) {
    const t = ev.timestamp.getTime();
    let idx = Math.floor((t - minMs) / bucketWidth);
    // Last bucket is half-open the other way: t === maxMs lands in bucket[N-1].
    if (idx >= bucketCount) idx = bucketCount - 1;
    if (idx < 0) idx = 0;
    (buckets[idx] as EventVolumeBucket).count += 1;
  }
  return buckets;
}

/**
 * Anchor-aware histogram bucketing — bars in the date-filter
 * histogram represent "cases the matcher would keep if filtering
 * to JUST this bucket" for the active anchor. So:
 *
 *  - `started` → cases whose first event sits in the bucket
 *  - `ended` → cases whose last event sits in the bucket
 *  - `contained` → cases whose entire span fits in the bucket
 *  - `intersecting` → cases with any event in the bucket
 *
 * This keeps the histogram visually consistent with the brush:
 * the bar a user sees is exactly the case-count the filter would
 * return for that one-bucket range.
 *
 * Equivalent to running `caseInDateRange` per case per bucket;
 * shape mirrors `bucketEventVolume`.
 */
export function bucketCasesByAnchor(
  log: EventLog,
  bucketCount: number,
  anchor: DateAnchor,
): EventVolumeBucket[] {
  if (log.events.length === 0) return [];
  const range = logDateRange(log);
  if (range === null) return [];
  const minMs = range.min.getTime();
  const maxMs = range.max.getTime();
  if (minMs === maxMs) {
    // Degenerate range — every non-empty case sits at the single timestamp.
    return [{ x0: minMs, x1: maxMs, count: log.cases.size }];
  }
  const totalSpan = maxMs - minMs;
  const bucketWidth = totalSpan / bucketCount;
  const buckets: EventVolumeBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    x0: minMs + i * bucketWidth,
    x1: minMs + (i + 1) * bucketWidth,
    count: 0,
  }));
  for (const c of log.cases.values()) {
    for (let i = 0; i < bucketCount; i += 1) {
      const b = buckets[i] as EventVolumeBucket;
      if (caseInDateRange(c, b.x0, b.x1, anchor)) b.count += 1;
    }
  }
  return buckets;
}

function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Round a ms-since-epoch value to the local-day boundary and emit
 * `YYYY-MM-DD`. Used by the histogram brush to snap drag releases
 * to whole days (the matcher works at day granularity anyway).
 */
export function msToIsoDate(ms: number): string {
  return toIsoDate(new Date(ms));
}

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const ANCHOR_SUFFIX: Record<DateAnchor, string> = {
  started: "",
  ended: " (Ended)",
};

function parseIsoDate(s: string): { year: number; month: number; day: number } {
  const [y, m, d] = s.split("-").map(Number);
  return {
    year: y as number,
    month: m as number,
    day: d as number,
  };
}

function shortDate(s: string, withYear: boolean): string {
  const { year, month, day } = parseIsoDate(s);
  const monthName = MONTH_ABBR[month - 1] as string;
  return withYear ? `${monthName} ${day}, ${year}` : `${monthName} ${day}`;
}

const ANCHOR_VERB: Record<DateAnchor, string> = {
  started: "started",
  ended: "ended",
};

/**
 * Render the SVG `<title>` text for a histogram bar. The verb
 * matches the active anchor so hovering tells the user "X cases
 * {verb} in this window" — same language as the brush filter.
 *
 *  - `started` / `ended` / `contained` use the anchor name as the verb
 *  - `intersecting` → `active` (friendlier than "intersecting")
 *
 * Date format reuses the chip's year-merging convention:
 * `Mar 1 – Mar 7, 2026` for same-year, both years shown otherwise.
 */
export function formatHistogramBucketTooltip(
  x0Ms: number,
  x1Ms: number,
  caseCount: number,
  anchor: DateAnchor,
): string {
  const fromIso = toIsoDate(new Date(x0Ms));
  const toIso = toIsoDate(new Date(x1Ms));
  const fromParts = parseIsoDate(fromIso);
  const toParts = parseIsoDate(toIso);
  const rangeLabel =
    fromParts.year === toParts.year
      ? `${shortDate(fromIso, false)} – ${shortDate(toIso, true)}`
      : `${shortDate(fromIso, true)} – ${shortDate(toIso, true)}`;
  const noun = caseCount === 1 ? "case" : "cases";
  const verb = ANCHOR_VERB[anchor];
  return `${rangeLabel}: ${caseCount} ${noun} ${verb}`;
}

/**
 * Render the active-chip text for a `date` clause per Phase 26 D6.
 *
 * - Both bounds null → `""` (caller skips chip render).
 * - From-only → `After Apr 1, 2026`.
 * - To-only → `Before Mar 31, 2026`.
 * - Both, same year → `Mar 1 – Mar 31, 2026` (start drops year).
 * - Both, different years → `Dec 15, 2025 – Mar 31, 2026`.
 * - Non-default anchor appends ` (Contained)` / ` (Ended)` /
 *   ` (Intersecting)`. Default `started` omits the suffix.
 */
export function formatDateChipLabel(
  from: string | null,
  to: string | null,
  anchor: DateAnchor,
): string {
  if (from === null && to === null) return "";
  const suffix = ANCHOR_SUFFIX[anchor];
  if (from !== null && to === null) return `After ${shortDate(from, true)}${suffix}`;
  if (from === null && to !== null) return `Before ${shortDate(to, true)}${suffix}`;
  const fromParts = parseIsoDate(from as string);
  const toParts = parseIsoDate(to as string);
  if (fromParts.year === toParts.year) {
    return `${shortDate(from as string, false)} – ${shortDate(to as string, true)}${suffix}`;
  }
  return `${shortDate(from as string, true)} – ${shortDate(to as string, true)}${suffix}`;
}
