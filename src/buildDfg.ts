import type { Dfg, EdgeStats, EventLog, NodeStats } from "./types.js";

const EDGE_KEY_SEP = "";

export function buildDfg(log: EventLog): Dfg {
  const activityCounts = new Map<string, Map<string, number>>();
  const edgeCounts = new Map<string, Map<string, number>>();
  const edgeEndpoints = new Map<string, { from: string; to: string }>();
  const durations = new Map<string, number[]>();
  const activityOrder: string[] = [];
  const edgeOrder: string[] = [];

  for (const c of log.cases.values()) {
    for (const ev of c.events) {
      let perCase = activityCounts.get(ev.activity);
      if (!perCase) {
        perCase = new Map<string, number>();
        activityCounts.set(ev.activity, perCase);
        activityOrder.push(ev.activity);
      }
      perCase.set(c.id, (perCase.get(c.id) ?? 0) + 1);
    }

    for (let i = 0; i < c.events.length - 1; i += 1) {
      const from = c.events[i];
      const to = c.events[i + 1];
      if (!from || !to) continue;

      const key = `${from.activity}${EDGE_KEY_SEP}${to.activity}`;
      const gap = to.timestamp.getTime() - from.timestamp.getTime();

      let edgePerCase = edgeCounts.get(key);
      if (!edgePerCase) {
        edgePerCase = new Map<string, number>();
        edgeCounts.set(key, edgePerCase);
        edgeEndpoints.set(key, { from: from.activity, to: to.activity });
        edgeOrder.push(key);
      }
      edgePerCase.set(c.id, (edgePerCase.get(c.id) ?? 0) + 1);

      const bucket = durations.get(key);
      if (bucket) {
        bucket.push(gap);
      } else {
        durations.set(key, [gap]);
      }
    }
  }

  const nodes = new Map<string, NodeStats>();
  for (const activity of activityOrder) {
    const perCase = activityCounts.get(activity);
    if (!perCase) continue;
    nodes.set(activity, aggregateNode(activity, perCase));
  }

  const edges = new Map<string, EdgeStats>();
  for (const key of edgeOrder) {
    const perCase = edgeCounts.get(key);
    const endpoints = edgeEndpoints.get(key);
    if (!perCase || !endpoints) continue;
    const samples = durations.get(key) ?? [];
    edges.set(key, aggregateEdge(endpoints.from, endpoints.to, perCase, samples));
  }

  return { nodes, edges };
}

function aggregateNode(activity: string, perCase: Map<string, number>): NodeStats {
  const values = [...perCase.values()];
  const absoluteFrequency = values.reduce((a, b) => a + b, 0);
  const caseFrequency = perCase.size;
  const maxRepetitions = values.reduce((a, b) => (a >= b ? a : b), 1);
  const meanRepetitions = absoluteFrequency / caseFrequency;
  return {
    activity,
    absoluteFrequency,
    caseFrequency,
    maxRepetitions,
    meanRepetitions,
  };
}

function aggregateEdge(
  from: string,
  to: string,
  perCase: Map<string, number>,
  samples: number[],
): EdgeStats {
  const values = [...perCase.values()];
  const absoluteFrequency = values.reduce((a, b) => a + b, 0);
  const caseFrequency = perCase.size;
  const maxRepetitions = values.reduce((a, b) => (a >= b ? a : b), 1);
  const meanRepetitions = absoluteFrequency / caseFrequency;
  return {
    from,
    to,
    absoluteFrequency,
    caseFrequency,
    maxRepetitions,
    meanRepetitions,
    durationMs: summarise(samples),
  };
}

function summarise(samples: number[]): EdgeStats["durationMs"] {
  if (samples.length === 0) return { mean: 0, median: 0, min: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const sum = samples.reduce((s, v) => s + v, 0);
  const mean = sum / samples.length;
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
      : (sorted[mid] ?? 0);
  return { mean, median, min, max };
}
