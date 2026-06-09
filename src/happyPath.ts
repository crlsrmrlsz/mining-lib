/**
 * Happy-path overlay (Phase 24).
 *
 * Given a `Dfg` and a happy-path activity sequence (a variant's
 * `sequence` array), returns the **complement** sets of nodes and
 * edges to *fade* — i.e. those NOT on the happy path. The renderer
 * iterates the layout's nodes/edges and probes membership with one
 * `Set.has` call each, so the helper does the set-arithmetic once
 * per render and the renderer stays a tight loop.
 *
 * Edge keys use a tab separator so concatenated activities cannot
 * collide (`("ab","c")` vs `("a","bc")`). The key form is local to
 * this helper + the renderer — `buildDfg`'s internal `Dfg.edges`
 * keying is unrelated; both layers carry `from`/`to` fields, so the
 * helper reads them directly off `EdgeStats`.
 */
import type { Dfg } from "./types.js";

export function happyPathEdgeKey(from: string, to: string): string {
  return `${from}\t${to}`;
}

export function computeHappyPathOverlay(
  dfg: Dfg,
  sequence: readonly string[],
): { fadedNodes: Set<string>; fadedEdges: Set<string> } {
  const onPathNodes = new Set<string>(sequence);
  const onPathEdges = new Set<string>();
  for (let i = 0; i < sequence.length - 1; i += 1) {
    const from = sequence[i];
    const to = sequence[i + 1];
    if (from !== undefined && to !== undefined) {
      onPathEdges.add(happyPathEdgeKey(from, to));
    }
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
