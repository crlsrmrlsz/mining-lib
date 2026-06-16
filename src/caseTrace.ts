/**
 * Single-case trace helpers (Phase 27).
 *
 * Pure-function reads against an `EventLog` + `Dfg` that power the
 * Trace panel (header summary + chronological event rows) and the
 * structural overlay (`computeCaseTraceOverlay`). The overlay shape
 * (`{ fadedNodes, fadedEdges }`) matches `computeHappyPathOverlay`
 * so the renderer reads from a single unified `overlay` slot.
 */
import { happyPathEdgeKey } from "./happyPath.js";
import type { Dfg, EventLog } from "./types.js";

export function caseIdExists(log: EventLog, caseId: string): boolean {
  return log.cases.has(caseId);
}

export type CaseSummary = {
  id: string;
  durationMs: number;
  eventCount: number;
  variantSequence: string[];
};

export function getCaseSummary(log: EventLog, caseId: string): CaseSummary | null {
  const c = log.cases.get(caseId);
  if (!c) return null;
  const events = c.events;
  const first = events[0];
  const last = events[events.length - 1];
  const durationMs = first && last ? last.timestamp.getTime() - first.timestamp.getTime() : 0;
  return {
    id: c.id,
    durationMs,
    eventCount: events.length,
    variantSequence: events.map((e) => e.activity),
  };
}

export type CaseTraceEvent = {
  idx: number;
  activity: string;
  timestamp: Date;
  deltaMs: number;
  resource: string | null;
};

export function getCaseTraceEvents(log: EventLog, caseId: string): CaseTraceEvent[] {
  const c = log.cases.get(caseId);
  if (!c) return [];
  const out: CaseTraceEvent[] = [];
  for (let i = 0; i < c.events.length; i += 1) {
    const ev = c.events[i];
    if (!ev) continue;
    const prev = i > 0 ? c.events[i - 1] : null;
    const deltaMs = prev ? ev.timestamp.getTime() - prev.timestamp.getTime() : 0;
    out.push({
      idx: i,
      activity: ev.activity,
      timestamp: ev.timestamp,
      deltaMs,
      resource: ev.resource,
    });
  }
  return out;
}

export function computeCaseTraceOverlay(
  dfg: Dfg,
  log: EventLog,
  caseId: string,
): { fadedNodes: Set<string>; fadedEdges: Set<string> } | null {
  const c = log.cases.get(caseId);
  if (!c) return null;

  const onPathNodes = new Set<string>();
  const onPathEdges = new Set<string>();
  for (let i = 0; i < c.events.length; i += 1) {
    const ev = c.events[i];
    if (!ev) continue;
    onPathNodes.add(ev.activity);
    const next = c.events[i + 1];
    if (next) onPathEdges.add(happyPathEdgeKey(ev.activity, next.activity));
  }

  const fadedNodes = new Set<string>();
  for (const nodeId of dfg.nodes.keys()) {
    if (!onPathNodes.has(nodeId)) fadedNodes.add(nodeId);
  }

  const fadedEdges = new Set<string>();
  for (const edge of dfg.edges.values()) {
    const key = happyPathEdgeKey(edge.from, edge.to);
    if (!onPathEdges.has(key)) fadedEdges.add(key);
  }

  return { fadedNodes, fadedEdges };
}

export function pickAdjacentCaseId(
  log: EventLog,
  currentId: string | null,
  dir: 1 | -1,
): string | null {
  const ids = [...log.cases.keys()].sort();
  if (ids.length < 2) return null;
  const i = currentId === null ? -1 : ids.indexOf(currentId);
  if (i === -1) return ids[0] ?? null;
  const next = (i + dir + ids.length) % ids.length;
  return ids[next] ?? null;
}
