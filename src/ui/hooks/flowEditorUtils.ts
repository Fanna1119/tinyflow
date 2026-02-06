/**
 * Shared utilities for flow editor hooks
 */

import type { Node, Edge } from "@xyflow/react";
import type { WorkflowNode, WorkflowEdge } from "../../schema/types";

// Handle colors for sub-node edges (must match CustomNodes.tsx)
export const HANDLE_COLOR_KEYS = [
  "purple",
  "cyan",
  "amber",
  "emerald",
  "rose",
] as const;

/**
 * Get node type string for React Flow based on workflow node properties
 */
function getReactFlowNodeType(node: WorkflowNode, hasError: boolean): string {
  if (hasError) return "error";
  if (node.nodeType === "clusterRoot") return "clusterRoot";
  if (node.nodeType === "subNode") return "subNode";
  return "function";
}

export function workflowNodeToReactFlowNode(
  node: WorkflowNode,
  hasError: boolean,
): Node {
  return {
    id: node.id,
    type: getReactFlowNodeType(node, hasError),
    position: node.position,
    data: {
      label: node.label ?? node.functionId,
      functionId: node.functionId,
      params: node.params,
      runtime: node.runtime,
      envs: node.envs,
      hasError,
      // Cluster-specific data
      handles: node.handles,
      nodeType: node.nodeType,
      parentId: node.parentId,
      isSubNode: node.nodeType === "subNode",
    },
  };
}

export function workflowEdgeToReactFlowEdge(
  edge: WorkflowEdge,
  index: number,
  nodes?: WorkflowNode[],
): Edge {
  const isSubNodeEdge = edge.edgeType === "subnode";

  // Determine color based on sourceHandle index
  let handleColorIndex = 0;
  if (edge.sourceHandle && nodes) {
    const sourceNode = nodes.find((n) => n.id === edge.from);
    if (sourceNode?.handles) {
      const handleIndex = sourceNode.handles.findIndex(
        (h) => h.id === edge.sourceHandle,
      );
      if (handleIndex >= 0) {
        handleColorIndex = handleIndex;
      }
    }
  }

  // Base edge properties
  const baseEdge: Edge = {
    id: `${edge.from}-${edge.to}-${edge.action}-${index}`,
    source: edge.from,
    target: edge.to,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
  };

  // Sub-node edge styling
  if (isSubNodeEdge) {
    return {
      ...baseEdge,
      type: "subnode",
      data: {
        color: HANDLE_COLOR_KEYS[handleColorIndex % HANDLE_COLOR_KEYS.length],
        label: edge.action !== "default" ? edge.action : undefined,
      },
    };
  }

  // Regular edge styling
  return {
    ...baseEdge,
    label: edge.action !== "default" ? edge.action : undefined,
    type: "smoothstep",
    animated: edge.action === "error",
    style: edge.action === "error" ? { stroke: "#ef4444" } : undefined,
  };
}

export function reactFlowNodeToWorkflowNode(node: Node): WorkflowNode {
  const workflowNode: WorkflowNode = {
    id: node.id,
    functionId: node.data.functionId as string,
    params: (node.data.params as Record<string, unknown>) ?? {},
    position: node.position,
    label: node.data.label as string | undefined,
    runtime: node.data.runtime as WorkflowNode["runtime"],
    envs: node.data.envs as Record<string, string>,
    nodeType: node.data.nodeType as WorkflowNode["nodeType"],
    handles: node.data.handles as WorkflowNode["handles"],
    parentId: node.data.parentId as string | undefined,
  };
  return workflowNode;
}

export function reactFlowEdgeToWorkflowEdge(edge: Edge): WorkflowEdge {
  // Action can be in edge.label (regular edges) or edge.data?.label (sub-node edges)
  const action =
    (edge.label as string) ?? (edge.data?.label as string) ?? "default";

  return {
    from: edge.source,
    to: edge.target,
    action,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
    edgeType: edge.type === "subnode" ? "subnode" : "default",
  };
}
