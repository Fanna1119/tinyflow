/**
 * Node Management Hook
 * Handles CRUD operations for nodes in the flow editor
 */

import { useCallback } from "react";
import type { Node, NodeChange } from "@xyflow/react";
import { applyNodeChanges } from "@xyflow/react";
import type { WorkflowNode, NodeType, NodeHandle } from "../../schema/types";
import { registry } from "../../registry";

export interface NodeManagementActions {
  /** Handle node changes from React Flow */
  onNodesChange: (changes: NodeChange[]) => void;
  /** Add a new node from registry */
  addNode: (functionId: string, position?: { x: number; y: number }) => void;
  /** Remove a node */
  removeNode: (nodeId: string) => void;
  /** Update node parameters */
  updateNodeParams: (nodeId: string, params: Record<string, unknown>) => void;
  /** Update node label */
  updateNodeLabel: (nodeId: string, label: string) => void;
  /** Select a node */
  selectNode: (nodeId: string | null) => void;
  /** Convert a node to a cluster root */
  convertToClusterRoot: (nodeId: string) => void;
  /** Convert a cluster root back to a regular node */
  convertToRegularNode: (nodeId: string) => void;
  /** Add a handle to a cluster root node */
  addClusterHandle: (nodeId: string, label?: string) => void;
  /** Remove a handle from a cluster root node */
  removeClusterHandle: (nodeId: string, handleId: string) => void;
  /** Rename a handle on a cluster root node */
  renameClusterHandle: (
    nodeId: string,
    handleId: string,
    newLabel: string,
  ) => void;
  /** Get node type info */
  getNodeType: (nodeId: string) => NodeType | undefined;
  /** Get handles for a node */
  getNodeHandles: (nodeId: string) => NodeHandle[] | undefined;
}

export function useNodeManagement(
  nodes: Node[],
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  setSelectedNodeId: React.Dispatch<React.SetStateAction<string | null>>,
  setIsDirty: (dirty: boolean) => void,
  isImportingRef: React.MutableRefObject<boolean>,
): NodeManagementActions {
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
    // Don't mark dirty during import (React Flow fires changes for dimensions/positions)
    if (!isImportingRef.current) {
      setIsDirty(true);
    }
  }, [setNodes, setIsDirty, isImportingRef]);

  const addNode = useCallback(
    (functionId: string, position = { x: 100, y: 100 }) => {
      const id = `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const newNode: Node = {
        id,
        type: "function",
        position,
        data: {
          label: functionId,
          functionId,
          params: {},
          runtime: {},
          envs: {},
          hasError: false,
          nodeType: "regular",
          isSubNode: false,
        },
      };

      setNodes((nds) => [...nds, newNode]);
      setSelectedNodeId(id);
      setIsDirty(true);
    },
    [setNodes, setSelectedNodeId, setIsDirty],
  );

  const removeNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setSelectedNodeId(null);
      setIsDirty(true);
    },
    [setNodes, setSelectedNodeId, setIsDirty],
  );

  const updateNodeParams = useCallback(
    (nodeId: string, params: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: { ...n.data, params },
              }
            : n,
        ),
      );
      setIsDirty(true);
    },
    [setNodes, setIsDirty],
  );

  const updateNodeLabel = useCallback(
    (nodeId: string, label: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: { ...n.data, label },
              }
            : n,
        ),
      );
      setIsDirty(true);
    },
    [setNodes, setIsDirty],
  );

  const selectNode = useCallback(
    (nodeId: string | null) => {
      setSelectedNodeId(nodeId);
    },
    [setSelectedNodeId],
  );

  const convertToClusterRoot = useCallback(
    (nodeId: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                type: "clusterRoot",
                data: {
                  ...n.data,
                  nodeType: "clusterRoot" as NodeType,
                  handles: [
                    { id: "default", type: "source", label: "Default" },
                  ] as NodeHandle[],
                },
              }
            : n,
        ),
      );
      setIsDirty(true);
    },
    [setNodes, setIsDirty],
  );

  const convertToRegularNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                type: "function",
                data: {
                  ...n.data,
                  nodeType: undefined,
                  handles: undefined,
                  parentId: undefined,
                },
              }
            : n,
        ),
      );
      setIsDirty(true);
    },
    [setNodes, setIsDirty],
  );

  const addClusterHandle = useCallback(
    (nodeId: string, label = "New Handle") => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === nodeId && n.data.handles) {
            const handles = n.data.handles as NodeHandle[];
            const handleId = `handle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            return {
              ...n,
              data: {
                ...n.data,
                handles: [...handles, { id: handleId, type: "source", label }],
              },
            };
          }
          return n;
        }),
      );
      setIsDirty(true);
    },
    [setNodes, setIsDirty],
  );

  const removeClusterHandle = useCallback(
    (nodeId: string, handleId: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === nodeId && n.data.handles) {
            const handles = n.data.handles as NodeHandle[];
            return {
              ...n,
              data: {
                ...n.data,
                handles: handles.filter((h) => h.id !== handleId),
              },
            };
          }
          return n;
        }),
      );
      setIsDirty(true);
    },
    [setNodes, setIsDirty],
  );

  const renameClusterHandle = useCallback(
    (nodeId: string, handleId: string, newLabel: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === nodeId && n.data.handles) {
            const handles = n.data.handles as NodeHandle[];
            return {
              ...n,
              data: {
                ...n.data,
                handles: handles.map((h) =>
                  h.id === handleId ? { ...h, label: newLabel } : h,
                ),
              },
            };
          }
          return n;
        }),
      );
      setIsDirty(true);
    },
    [setNodes, setIsDirty],
  );

  const getNodeType = useCallback(
    (nodeId: string): NodeType | undefined => {
      const node = nodes.find((n) => n.id === nodeId);
      return node?.data?.nodeType as NodeType;
    },
    [nodes],
  );

  const getNodeHandles = useCallback(
    (nodeId: string): NodeHandle[] | undefined => {
      const node = nodes.find((n) => n.id === nodeId);
      return node?.data?.handles as NodeHandle[];
    },
    [nodes],
  );

  return {
    onNodesChange,
    addNode,
    removeNode,
    updateNodeParams,
    updateNodeLabel,
    selectNode,
    convertToClusterRoot,
    convertToRegularNode,
    addClusterHandle,
    removeClusterHandle,
    renameClusterHandle,
    getNodeType,
    getNodeHandles,
  };
}
