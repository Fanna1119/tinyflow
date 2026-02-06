/**
 * Data Flow Analysis Hook
 * Walks the workflow graph to determine which store keys are available
 * at each node, enabling smart suggestions for key-based params.
 */

import { useMemo } from "react";
import type { Node, Edge } from "@xyflow/react";
import { registry } from "../../registry";
import type { FunctionParameter } from "../../schema/types";

// ============================================================================
// Types
// ============================================================================

/** A single data key produced by a node */
export interface ProducedKey {
  /** The store key name */
  key: string;
  /** The node that produces this key */
  sourceNodeId: string;
  /** The function that produces this key */
  sourceFunctionId: string;
  /** Human-readable source label */
  sourceLabel: string;
  /** The param that defines this output (e.g. "outputKey") */
  producerParam: string;
}

/** A single data key consumed by a node */
export interface ConsumedKey {
  /** The store key name */
  key: string;
  /** The param that references this key */
  consumerParam: string;
}

/** Full data flow info for a single node */
export interface NodeDataFlow {
  /** Keys produced (written to store) by this node */
  produces: ProducedKey[];
  /** Keys consumed (read from store) by this node */
  consumes: ConsumedKey[];
  /** All keys available upstream of this node (for suggestions) */
  availableKeys: ProducedKey[];
}

// ============================================================================
// Key detection helpers
// ============================================================================

/**
 * Param names that represent store keys being WRITTEN (outputs).
 * The value of these params is the key name stored into the context store.
 */
const OUTPUT_KEY_PARAMS = new Set([
  "outputKey",
  "key", // core.setValue
  "toKey", // core.passthrough
]);

/**
 * Param names that represent store keys being READ (inputs).
 * The value of these params is the key name read from the context store.
 */
const INPUT_KEY_PARAMS = new Set([
  "promptKey",
  "inputKey",
  "fromKey",
  "bodyKey",
  "key", // core.log reads from this key
]);

/**
 * Params whose values are always an output key (never an input key).
 * Used to disambiguate "key" which can be either depending on function.
 */
const WRITE_ONLY_FUNCTIONS = new Set(["core.setValue"]);

const READ_ONLY_KEY_FUNCTIONS = new Set(["core.log"]);

/**
 * Extract the store keys that a node produces (writes).
 */
function getProducedKeys(node: Node): { key: string; param: string }[] {
  const functionId = node.data.functionId as string;
  const params = (node.data.params ?? {}) as Record<string, unknown>;
  const meta = registry.get(functionId)?.metadata;
  const results: { key: string; param: string }[] = [];

  // Special case: core.start always produces "input"
  if (functionId === "core.start") {
    results.push({ key: "input", param: "input" });
    return results;
  }

  if (!meta) return results;

  for (const paramDef of meta.params) {
    if (!OUTPUT_KEY_PARAMS.has(paramDef.name)) continue;

    // Skip "key" for read-only functions (e.g. core.log)
    if (paramDef.name === "key" && READ_ONLY_KEY_FUNCTIONS.has(functionId)) {
      continue;
    }

    const value = params[paramDef.name];
    if (typeof value === "string" && value.trim()) {
      results.push({ key: value, param: paramDef.name });
    }
  }

  // Also check the metadata.outputs array for implicit keys
  if (meta.outputs) {
    for (const outputName of meta.outputs) {
      // If the output references a param (like "outputKey"), resolve it
      if (OUTPUT_KEY_PARAMS.has(outputName)) {
        const value = params[outputName];
        if (typeof value === "string" && value.trim()) {
          // Already added above
          if (!results.some((r) => r.key === value)) {
            results.push({ key: value, param: outputName });
          }
        }
      }
    }
  }

  return results;
}

/**
 * Extract the store keys that a node consumes (reads).
 */
function getConsumedKeys(node: Node): ConsumedKey[] {
  const functionId = node.data.functionId as string;
  const params = (node.data.params ?? {}) as Record<string, unknown>;
  const meta = registry.get(functionId)?.metadata;
  const results: ConsumedKey[] = [];

  if (!meta) return results;

  for (const paramDef of meta.params) {
    if (!INPUT_KEY_PARAMS.has(paramDef.name)) continue;

    // Skip "key" for write-only functions (e.g. core.setValue)
    if (paramDef.name === "key" && WRITE_ONLY_FUNCTIONS.has(functionId)) {
      continue;
    }

    const value = params[paramDef.name];
    if (typeof value === "string" && value.trim()) {
      results.push({ key: value, consumerParam: paramDef.name });
    }
  }

  // Also check for template references like {{keyName}}
  if (functionId === "transform.template") {
    const template = params.template;
    if (typeof template === "string") {
      const matches = template.matchAll(/\{\{(\w+)(?:\.\w+)*\}\}/g);
      for (const match of matches) {
        const rootKey = match[1];
        if (!results.some((r) => r.key === rootKey)) {
          results.push({ key: rootKey, consumerParam: "template" });
        }
      }
    }
  }

  // core.end reads from outputKey
  if (functionId === "core.end") {
    const outputKey = params.outputKey;
    if (typeof outputKey === "string" && outputKey.trim()) {
      results.push({ key: outputKey, consumerParam: "outputKey" });
    }
  }

  return results;
}

/**
 * Determine if a parameter definition represents a key reference
 * (either input or output key).
 */
export function isKeyParam(
  paramDef: FunctionParameter,
  functionId: string,
): "input" | "output" | null {
  const name = paramDef.name;

  // Explicit output key params
  if (name === "outputKey" || name === "toKey") return "output";

  // Explicit input key params
  if (
    name === "promptKey" ||
    name === "inputKey" ||
    name === "fromKey" ||
    name === "bodyKey"
  )
    return "input";

  // "key" is ambiguous — depends on function
  if (name === "key") {
    if (WRITE_ONLY_FUNCTIONS.has(functionId)) return "output";
    if (READ_ONLY_KEY_FUNCTIONS.has(functionId)) return "input";
  }

  // core.end's outputKey reads from store
  if (name === "outputKey" && functionId === "core.end") return "input";

  return null;
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Analyze data flow across the entire workflow graph.
 *
 * For each node, determines:
 * - What store keys it produces (writes)
 * - What store keys it consumes (reads)
 * - What keys are available from upstream nodes
 */
export function useDataFlowAnalysis(
  nodes: Node[],
  edges: Edge[],
): Map<string, NodeDataFlow> {
  return useMemo(() => {
    const result = new Map<string, NodeDataFlow>();

    // Build adjacency: nodeId -> list of predecessor node IDs
    const predecessors = new Map<string, string[]>();
    for (const node of nodes) {
      predecessors.set(node.id, []);
    }
    for (const edge of edges) {
      const preds = predecessors.get(edge.target);
      if (preds && !preds.includes(edge.source)) {
        preds.push(edge.source);
      }
    }

    // Pre-compute produces/consumes for each node
    const nodeMap = new Map<string, Node>();
    const producesMap = new Map<string, ProducedKey[]>();
    const consumesMap = new Map<string, ConsumedKey[]>();

    for (const node of nodes) {
      nodeMap.set(node.id, node);

      const rawProduced = getProducedKeys(node);
      producesMap.set(
        node.id,
        rawProduced.map((p) => ({
          key: p.key,
          sourceNodeId: node.id,
          sourceFunctionId: node.data.functionId as string,
          sourceLabel: (node.data.label as string) ?? node.id,
          producerParam: p.param,
        })),
      );

      consumesMap.set(node.id, getConsumedKeys(node));
    }

    // BFS upstream from each node to collect available keys
    for (const node of nodes) {
      const availableKeys: ProducedKey[] = [];
      const visited = new Set<string>();
      const queue = [...(predecessors.get(node.id) ?? [])];

      while (queue.length > 0) {
        const predId = queue.shift()!;
        if (visited.has(predId)) continue;
        visited.add(predId);

        // Add this predecessor's produced keys
        const produced = producesMap.get(predId);
        if (produced) {
          for (const pk of produced) {
            if (!availableKeys.some((ak) => ak.key === pk.key)) {
              availableKeys.push(pk);
            }
          }
        }

        // Continue upstream
        const grandPreds = predecessors.get(predId) ?? [];
        for (const gp of grandPreds) {
          if (!visited.has(gp)) {
            queue.push(gp);
          }
        }
      }

      result.set(node.id, {
        produces: producesMap.get(node.id) ?? [],
        consumes: consumesMap.get(node.id) ?? [],
        availableKeys,
      });
    }

    return result;
  }, [nodes, edges]);
}
