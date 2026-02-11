/**
 * useAutoConnect Hook
 *
 * Automatically connects newly added nodes to the most logical
 * predecessor based on proximity and data-flow heuristics.
 *
 * Rules:
 * 1. If the canvas has exactly one node with no outgoing edges,
 *    connect it to the new node.
 * 2. Otherwise find the closest node (within 400 px) that has
 *    fewer than 2 outgoing edges and connect it.
 * 3. Skip connection if the new node is a "core.start" (it is a root).
 */

import { useCallback, useRef } from "react";
import type { Node, Edge } from "@xyflow/react";

/** Distance threshold — don't auto-connect beyond this */
const MAX_DISTANCE = 400;

/** Functions that are always flow roots — never auto-connected to */
const ROOT_FUNCTIONS = new Set(["core.start"]);

export interface AutoConnectActions {
  /**
   * Call after a node is added. Mutates edges if a connection makes sense.
   * Returns the id of the node it connected FROM, or null.
   */
  maybeAutoConnect: (
    newNodeId: string,
    nodes: Node[],
    edges: Edge[],
  ) => { fromId: string; edge: Edge } | null;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function useAutoConnect(): AutoConnectActions {
  const idCounter = useRef(0);

  const maybeAutoConnect = useCallback(
    (
      newNodeId: string,
      nodes: Node[],
      edges: Edge[],
    ): { fromId: string; edge: Edge } | null => {
      const newNode = nodes.find((n) => n.id === newNodeId);
      if (!newNode) return null;

      // Don't auto-connect to start nodes
      if (ROOT_FUNCTIONS.has(newNode.data?.functionId as string)) return null;

      // Build outgoing edge count per node
      const outCount = new Map<string, number>();
      for (const e of edges) {
        outCount.set(e.source, (outCount.get(e.source) ?? 0) + 1);
      }

      // Candidate nodes: not the new node, not sub-nodes
      const candidates = nodes.filter(
        (n) =>
          n.id !== newNodeId &&
          n.data?.nodeType !== "subNode" &&
          (outCount.get(n.id) ?? 0) < 2,
      );

      if (candidates.length === 0) return null;

      // Strategy 1: single node with zero outgoing edges
      const dangling = candidates.filter(
        (n) => (outCount.get(n.id) ?? 0) === 0,
      );
      if (dangling.length === 1) {
        const from = dangling[0];
        const edgeId = `auto-${++idCounter.current}-${Date.now()}`;
        const edge: Edge = {
          id: edgeId,
          source: from.id,
          target: newNodeId,
          type: "smoothstep",
        };
        return { fromId: from.id, edge };
      }

      // Strategy 2: closest node within threshold
      let best: Node | null = null;
      let bestDist = Infinity;
      for (const n of candidates) {
        const d = distance(n.position, newNode.position);
        if (d < bestDist && d <= MAX_DISTANCE) {
          best = n;
          bestDist = d;
        }
      }

      if (best) {
        const edgeId = `auto-${++idCounter.current}-${Date.now()}`;
        const edge: Edge = {
          id: edgeId,
          source: best.id,
          target: newNodeId,
          type: "smoothstep",
        };
        return { fromId: best.id, edge };
      }

      return null;
    },
    [],
  );

  return { maybeAutoConnect };
}
