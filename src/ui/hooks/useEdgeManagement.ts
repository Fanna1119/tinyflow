/**
 * Edge Management Hook
 * Handles CRUD operations for edges and connections in the flow editor.
 * Automatically manages sub-node relationships when edges connect to/from
 * cluster root bottom handles.
 */

import { useCallback } from "react";
import {
  addEdge,
  applyEdgeChanges,
  type Edge,
  type EdgeChange,
  type Connection,
  type Node,
} from "@xyflow/react";
import type { NodeHandle, NodeType } from "../../schema/types";
import { HANDLE_COLOR_KEYS } from "./flowEditorUtils";

export interface EdgeManagementActions {
  /** Handle edge changes from React Flow */
  onEdgesChange: (changes: EdgeChange[]) => void;
  /** Handle new connections */
  onConnect: (connection: Connection) => void;
}

/**
 * Check whether a source handle ID belongs to a cluster root's bottom
 * sub-node handles (as opposed to the right-side "output" handle).
 */
function isClusterBottomHandle(
  sourceNode: Node,
  sourceHandleId: string | null | undefined,
): boolean {
  if (!sourceHandleId) return false;
  if (sourceNode.type !== "clusterRoot") return false;
  // The right-side output handle always has id="output"
  if (sourceHandleId === "output") return false;
  // Any other source handle on a clusterRoot is a bottom sub-node handle
  const handles = sourceNode.data?.handles as NodeHandle[] | undefined;
  if (!handles) return false;
  return handles.some((h) => h.id === sourceHandleId);
}

/**
 * Determine the color key for a sub-node edge based on which handle it
 * originates from.
 */
function getHandleColorKey(sourceNode: Node, sourceHandleId: string): string {
  const handles = (sourceNode.data?.handles as NodeHandle[] | undefined) ?? [];
  const idx = handles.findIndex((h) => h.id === sourceHandleId);
  return HANDLE_COLOR_KEYS[Math.max(idx, 0) % HANDLE_COLOR_KEYS.length];
}

export function useEdgeManagement(
  edges: Edge[],
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
  nodes: Node[],
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  setIsDirty: (dirty: boolean) => void,
): EdgeManagementActions {
  // -----------------------------------------------------------------------
  // Edge changes (including removals)
  // -----------------------------------------------------------------------
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      // Collect IDs of edges being removed
      const removedIds = new Set<string>();
      for (const change of changes) {
        if (change.type === "remove") {
          removedIds.add(change.id);
        }
      }

      if (removedIds.size > 0) {
        setEdges((currentEdges) => {
          // Identify sub-node edges that are being removed
          const removedSubnodeTargets = new Set<string>();
          for (const edge of currentEdges) {
            if (removedIds.has(edge.id) && edge.type === "subnode") {
              removedSubnodeTargets.add(edge.target);
            }
          }

          const nextEdges = applyEdgeChanges(changes, currentEdges);

          // For each removed sub-node target, check whether it still has
          // another sub-node edge pointing at it. If not, revert it to a
          // regular node.
          if (removedSubnodeTargets.size > 0) {
            const stillSubnodeTargets = new Set<string>();
            for (const edge of nextEdges) {
              if (edge.type === "subnode") {
                stillSubnodeTargets.add(edge.target);
              }
            }

            const revertIds = new Set<string>();
            for (const targetId of removedSubnodeTargets) {
              if (!stillSubnodeTargets.has(targetId)) {
                revertIds.add(targetId);
              }
            }

            if (revertIds.size > 0) {
              setNodes((nds) =>
                nds.map((n) =>
                  revertIds.has(n.id)
                    ? {
                        ...n,
                        type: "function",
                        data: {
                          ...n.data,
                          nodeType: undefined,
                          parentId: undefined,
                          isSubNode: false,
                        },
                      }
                    : n,
                ),
              );
            }
          }

          return nextEdges;
        });
      } else {
        setEdges((eds) => applyEdgeChanges(changes, eds));
      }

      setIsDirty(true);
    },
    [setEdges, setNodes, setIsDirty],
  );

  // -----------------------------------------------------------------------
  // New connections
  // -----------------------------------------------------------------------
  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const isSubnodeEdge =
        sourceNode != null &&
        isClusterBottomHandle(sourceNode, connection.sourceHandle);

      if (isSubnodeEdge) {
        // ----- Sub-node edge -----
        const colorKey = getHandleColorKey(
          sourceNode,
          connection.sourceHandle!,
        );

        const edge: Edge = {
          id: `${connection.source}-${connection.target}-${Date.now()}`,
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
          type: "subnode",
          data: {
            color: colorKey,
          },
        };

        setEdges((eds) => addEdge(edge, eds));

        // Automatically mark the target node as a sub-node
        setNodes((nds) =>
          nds.map((n) =>
            n.id === connection.target
              ? {
                  ...n,
                  type: "subNode",
                  data: {
                    ...n.data,
                    nodeType: "subNode" as NodeType,
                    parentId: connection.source,
                    isSubNode: true,
                  },
                }
              : n,
          ),
        );
      } else {
        // ----- Regular edge -----
        const edge: Edge = {
          id: `${connection.source}-${connection.target}-${Date.now()}`,
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
          type: "smoothstep",
        };

        setEdges((eds) => addEdge(edge, eds));
      }

      setIsDirty(true);
    },
    [nodes, setEdges, setNodes, setIsDirty],
  );

  return {
    onEdgesChange,
    onConnect,
  };
}
