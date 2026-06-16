import type { EventLog } from "./types.js";

export type ResourceBreakdownRow = {
  resource: string | null;
  count: number;
  percentage: number;
};

export function getResourceBreakdown(activity: string, log: EventLog): ResourceBreakdownRow[] {
  const counts = new Map<string | null, number>();
  let total = 0;
  for (const ev of log.events) {
    if (ev.activity !== activity) continue;
    counts.set(ev.resource, (counts.get(ev.resource) ?? 0) + 1);
    total += 1;
  }
  if (total === 0) return [];

  const rows: ResourceBreakdownRow[] = [];
  for (const [resource, count] of counts) {
    rows.push({
      resource,
      count,
      percentage: Math.round((count / total) * 100),
    });
  }
  rows.sort(compareRows);
  return rows;
}

export function logHasResources(log: EventLog): boolean {
  return log.events.some((e) => e.resource !== null);
}

function compareRows(a: ResourceBreakdownRow, b: ResourceBreakdownRow): number {
  if (b.count !== a.count) return b.count - a.count;
  if (a.resource === null) return 1;
  if (b.resource === null) return -1;
  if (a.resource < b.resource) return -1;
  if (a.resource > b.resource) return 1;
  return 0;
}
