/**
 * Smart Parameter Defaults
 *
 * Provides context-aware default parameters when a new node is added.
 * Examines the upstream nodes to suggest sensible store keys, output
 * keys, and other parameters so the user doesn't have to fill
 * everything in manually.
 */

import type { Node, Edge } from "@xyflow/react";

/**
 * Given a newly added node's functionId and the current graph,
 * return a set of suggested default params that override the
 * function's built-in defaults.
 *
 * Returns `undefined` if there's nothing to suggest.
 */
export function getSmartDefaults(
  functionId: string,
  nodes: Node[],
  edges: Edge[],
  newNodeId?: string,
): Record<string, unknown> | undefined {
  // Collect outputs produced by existing nodes (look at store keys they set)
  const producedKeys = collectProducedKeys(nodes);

  // Find the most likely predecessor of the new node
  const predecessor = newNodeId
    ? findPredecessor(newNodeId, nodes, edges)
    : findLastDanglingNode(nodes, edges);

  const predecessorFn = predecessor?.data?.functionId as string | undefined;

  switch (functionId) {
    // ---- Core ----
    case "core.log": {
      // If there's a produced key, suggest logging it
      const key = pickMostRecentKey(producedKeys, predecessorFn);
      if (key) return { key, message: `Value of ${key}` };
      return undefined;
    }

    case "core.end": {
      const key = pickMostRecentKey(producedKeys, predecessorFn);
      if (key) return { outputKey: key };
      return undefined;
    }

    case "core.setValue": {
      return { key: "myValue", value: "" };
    }

    // ---- Transform ----
    case "transform.map": {
      const key = pickMostRecentKey(producedKeys, predecessorFn);
      if (key) return { inputKey: key, path: "", outputKey: `${key}Mapped` };
      return undefined;
    }

    case "transform.template": {
      const key = pickMostRecentKey(producedKeys, predecessorFn);
      if (key)
        return { template: `Result: {{${key}}}`, outputKey: "formatted" };
      return { template: "Hello, {{name}}!", outputKey: "formatted" };
    }

    case "transform.jsonStringify": {
      const key = pickMostRecentKey(producedKeys, predecessorFn);
      if (key) return { inputKey: key, outputKey: `${key}Json` };
      return undefined;
    }

    case "transform.jsonParse": {
      const key = pickMostRecentKey(producedKeys, predecessorFn);
      if (key) return { inputKey: key, outputKey: `${key}Parsed` };
      return undefined;
    }

    // ---- Control ----
    case "control.condition": {
      const key = pickMostRecentKey(producedKeys, predecessorFn);
      if (key) return { leftKey: key, operator: "exists" };
      return undefined;
    }

    // ---- HTTP ----
    case "http.request": {
      return {
        url: "https://jsonplaceholder.typicode.com/todos/1",
        method: "GET",
        outputKey: "apiResponse",
      };
    }

    default:
      return undefined;
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Scan all nodes and collect the store keys they write to.
 * Returns an array of { key, nodeId } ordered by node position (left → right).
 */
function collectProducedKeys(nodes: Node[]): { key: string; nodeId: string }[] {
  const keys: { key: string; nodeId: string; x: number }[] = [];

  for (const n of nodes) {
    const params = n.data?.params as Record<string, unknown> | undefined;
    if (!params) continue;

    const fn = n.data?.functionId as string;

    // core.setValue → key
    if (fn === "core.setValue" && typeof params.key === "string") {
      keys.push({ key: params.key, nodeId: n.id, x: n.position.x });
    }
    // transform.map → outputKey
    if (typeof params.outputKey === "string") {
      keys.push({ key: params.outputKey, nodeId: n.id, x: n.position.x });
    }
    // core.start with input
    if (
      fn === "core.start" &&
      params.input &&
      typeof params.input === "object"
    ) {
      keys.push({ key: "input", nodeId: n.id, x: n.position.x });
    }
  }

  // Sort left-to-right so the "most recent" is last
  keys.sort((a, b) => a.x - b.x);
  return keys.map(({ key, nodeId }) => ({ key, nodeId }));
}

/**
 * Pick the most relevant produced key. Prefers keys from the predecessor.
 */
function pickMostRecentKey(
  produced: { key: string; nodeId: string }[],
  _predecessorFn?: string,
): string | undefined {
  if (produced.length === 0) return undefined;
  // Just return the last produced key (rightmost node)
  return produced[produced.length - 1].key;
}

/**
 * Find predecessor of a node via edges.
 */
function findPredecessor(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
): Node | undefined {
  for (const e of edges) {
    if (e.target === nodeId) {
      return nodes.find((n) => n.id === e.source);
    }
  }
  return undefined;
}

/**
 * Find the last node that has no outgoing default edges — likely the "tail"
 * of the current chain.
 */
function findLastDanglingNode(nodes: Node[], edges: Edge[]): Node | undefined {
  const hasOutgoing = new Set(edges.map((e) => e.source));
  const dangling = nodes.filter((n) => !hasOutgoing.has(n.id));
  if (dangling.length === 0) return undefined;
  // Pick rightmost
  dangling.sort((a, b) => b.position.x - a.position.x);
  return dangling[0];
}
