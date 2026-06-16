import type { Dfg, EventLog } from "./types.js";

export type TerminalNodeDuration = {
  mean: number;
  median: number;
  count: number;
};

export function getCaseDurations(log: EventLog): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of log.cases.values()) {
    const first = c.events[0];
    const last = c.events[c.events.length - 1];
    if (!first || !last) continue;
    out.set(c.id, last.timestamp.getTime() - first.timestamp.getTime());
  }
  return out;
}

export function getTerminalNodeDurations(
  dfg: Dfg,
  log: EventLog,
): Map<string, TerminalNodeDuration> {
  const outgoing = new Set<string>();
  for (const edge of dfg.edges.values()) outgoing.add(edge.from);

  const terminals = new Set<string>();
  for (const activity of dfg.nodes.keys()) {
    if (!outgoing.has(activity)) terminals.add(activity);
  }

  const buckets = new Map<string, number[]>();
  for (const c of log.cases.values()) {
    const first = c.events[0];
    const last = c.events[c.events.length - 1];
    if (!first || !last) continue;
    if (!terminals.has(last.activity)) continue;
    const duration = last.timestamp.getTime() - first.timestamp.getTime();
    const bucket = buckets.get(last.activity);
    if (bucket) bucket.push(duration);
    else buckets.set(last.activity, [duration]);
  }

  const result = new Map<string, TerminalNodeDuration>();
  for (const [activity, samples] of buckets) {
    result.set(activity, summarise(samples));
  }
  return result;
}

function summarise(samples: number[]): TerminalNodeDuration {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((s, v) => s + v, 0);
  const mean = sum / samples.length;
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
      : (sorted[mid] ?? 0);
  return { mean, median, count: samples.length };
}
