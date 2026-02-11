/**
 * usePatternInsertion Hook
 *
 * Handles inserting multi-node patterns into the canvas.
 * Each pattern's node IDs are suffixed with a unique stamp so
 * the same pattern can be inserted multiple times.
 */

import { useCallback } from "react";
import type { Node, Edge } from "@xyflow/react";
import type { WorkflowPattern } from "../templates/types";
import {
  workflowNodeToReactFlowNode,
  workflowEdgeToReactFlowEdge,
} from "./flowEditorUtils";

export interface PatternInsertionActions {
  /** Insert a pattern at a given canvas position */
  insertPattern: (
    pattern: WorkflowPattern,
    position?: { x: number; y: number },
  ) => void;
}

export function usePatternInsertion(
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
  setIsDirty: (dirty: boolean) => void,
): PatternInsertionActions {
  const insertPattern = useCallback(
    (pattern: WorkflowPattern, position = { x: 300, y: 200 }) => {
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      // Remap IDs so multiple insertions don't collide
      const idMap = new Map<string, string>();
      for (const n of pattern.nodes) {
        idMap.set(n.id, `${n.id}-${stamp}`);
      }

      // Create React Flow nodes with offset positions
      const newNodes: Node[] = pattern.nodes.map((n) => {
        const remapped = {
          ...n,
          id: idMap.get(n.id)!,
          position: {
            x: position.x + n.position.x,
            y: position.y + n.position.y,
          },
        };
        return workflowNodeToReactFlowNode(remapped, false);
      });

      // Create React Flow edges with remapped IDs
      const newEdges: Edge[] = pattern.edges.map((e, i) => {
        const remapped = {
          ...e,
          from: idMap.get(e.from) ?? e.from,
          to: idMap.get(e.to) ?? e.to,
        };
        return workflowEdgeToReactFlowEdge(remapped, Date.now() + i);
      });

      setNodes((prev) => [...prev, ...newNodes]);
      setEdges((prev) => [...prev, ...newEdges]);
      setIsDirty(true);
    },
    [setNodes, setEdges, setIsDirty],
  );

  return { insertPattern };
}
