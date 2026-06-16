import type { Case, Event, EventLog, Variant } from "./types.js";

export function variantSignature(sequence: readonly string[]): string {
  return JSON.stringify(sequence);
}

export function getVariants(log: EventLog): Variant[] {
  const totalCases = log.cases.size;
  if (totalCases === 0) return [];

  const groups = new Map<string, { sequence: string[]; count: number }>();
  for (const c of log.cases.values()) {
    const sequence = c.events.map((e) => e.activity);
    const key = variantSignature(sequence);
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, { sequence, count: 1 });
    }
  }

  const variants: Variant[] = [];
  for (const { sequence, count } of groups.values()) {
    variants.push({
      sequence,
      count,
      percentage: (count / totalCases) * 100,
    });
  }

  variants.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return compareSequence(a.sequence, b.sequence);
  });

  return variants;
}

export function buildFilteredLog(log: EventLog, signatures: string[] | null): EventLog {
  if (signatures === null) return log;

  const allowed = new Set(signatures);
  const filteredCases = new Map<string, Case>();
  const filteredEvents: Event[] = [];

  for (const [caseId, c] of log.cases) {
    const sig = variantSignature(c.events.map((e) => e.activity));
    if (!allowed.has(sig)) continue;
    filteredCases.set(caseId, c);
    for (const ev of c.events) filteredEvents.push(ev);
  }

  return {
    cases: filteredCases,
    events: filteredEvents,
    schema: log.schema,
  };
}

function compareSequence(a: string[], b: string[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const ai = a[i] as string;
    const bi = b[i] as string;
    if (ai < bi) return -1;
    if (ai > bi) return 1;
  }
  return a.length - b.length;
}
