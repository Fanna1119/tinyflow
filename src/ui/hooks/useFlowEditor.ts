/**
 * Flow Editor Hook
 * Manages state for the React Flow editor
 */

import { useState, useCallback, useMemo, useRef } from "react";
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from "@xyflow/react";
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEdge,
  EdgeAction,
  NodeType,
  NodeHandle,
} from "../../schema/types";
import { registry } from "../../registry";
import { validateWorkflow } from "../../schema/validator";

// Handle colors for sub-node edges (must match CustomNodes.tsx)
const HANDLE_COLOR_KEYS = [
  "purple",
  "cyan",
  "amber",
  "emerald",
  "rose",
] as const;

// ============================================================================
// Types
// ============================================================================

export interface FlowEditorState {
  /** React Flow nodes */
  nodes: Node[];
  /** React Flow edges */
  edges: Edge[];
  /** Currently selected node ID */
  selectedNodeId: string | null;
  /** Validation errors for nodes */
  nodeErrors: Map<string, string>;
  /** Whether there are unsaved changes */
  isDirty: boolean;
  /** Workflow metadata */
  workflowMeta: {
    id: string;
    name: string;
    description: string;
    version: string;
    startNodeId: string;
  };
}

export interface FlowEditorActions {
  /** Handle node changes from React Flow */
  onNodesChange: (changes: NodeChange[]) => void;
  /** Handle edge changes from React Flow */
  onEdgesChange: (changes: EdgeChange[]) => void;
  /** Handle new connections */
  onConnect: (connection: Connection) => void;
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
  /** Import workflow from JSON */
  importWorkflow: (json: string) => {
    success: boolean;
    error?: string;
    warnings?: string[];
  };
  /** Export workflow to JSON */
  exportWorkflow: () => WorkflowDefinition;
  /** Clear the editor */
  clear: () => void;
  /** Update workflow metadata */
  updateMeta: (meta: Partial<FlowEditorState["workflowMeta"]>) => void;
  /** Validate current workflow */
  validate: () => { valid: boolean; errors: string[] };
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

// ============================================================================
// Utilities
// ============================================================================

function generateId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Get node type string for React Flow based on workflow node properties
 */
function getReactFlowNodeType(node: WorkflowNode, hasError: boolean): string {
  if (hasError) return "error";
  if (node.nodeType === "clusterRoot") return "clusterRoot";
  if (node.nodeType === "subNode") return "subNode";
  return "function";
}

function workflowNodeToReactFlowNode(
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

function workflowEdgeToReactFlowEdge(
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

function reactFlowNodeToWorkflowNode(node: Node): WorkflowNode {
  const workflowNode: WorkflowNode = {
    id: node.id,
    functionId: node.data.functionId as string,
    params: (node.data.params as Record<string, unknown>) ?? {},
    position: node.position,
    label: node.data.label as string | undefined,
    runtime: node.data.runtime as WorkflowNode["runtime"],
    envs: node.data.envs as Record<string, string>,
  };

  // Add cluster-specific properties if present
  const nodeType = node.data.nodeType as NodeType | undefined;
  if (nodeType && nodeType !== "default") {
    workflowNode.nodeType = nodeType;
  }

  const handles = node.data.handles as NodeHandle[] | undefined;
  if (handles && handles.length > 0) {
    workflowNode.handles = handles;
  }

  const parentId = node.data.parentId as string | undefined;
  if (parentId) {
    workflowNode.parentId = parentId;
  }

  return workflowNode;
}

function reactFlowEdgeToWorkflowEdge(edge: Edge): WorkflowEdge {
  // Get action from label or edge data - allow any string action
  let action: EdgeAction = "default";
  if (edge.label && typeof edge.label === "string") {
    action = edge.label as EdgeAction;
  } else if (edge.data?.label && typeof edge.data.label === "string") {
    action = edge.data.label as EdgeAction;
  } else if (edge.data?.action && typeof edge.data.action === "string") {
    action = edge.data.action as EdgeAction;
  }

  const workflowEdge: WorkflowEdge = {
    from: edge.source,
    to: edge.target,
    action,
  };

  // Add handle references if present
  if (edge.sourceHandle) {
    workflowEdge.sourceHandle = edge.sourceHandle;
  }
  if (edge.targetHandle) {
    workflowEdge.targetHandle = edge.targetHandle;
  }

  // Mark as subnode edge if using subnode edge type
  if (edge.type === "subnode") {
    workflowEdge.edgeType = "subnode";
  }

  return workflowEdge;
}

/**
 * Validate and normalize an imported workflow
 * Returns normalized workflow or throws with descriptive error
 */
function validateAndNormalizeWorkflow(
  raw: Record<string, unknown>,
): WorkflowDefinition {
  const errors: string[] = [];

  // Handle legacy format where id/name are nested in flow
  let id = raw.id as string | undefined;
  let name = raw.name as string | undefined;
  let description = raw.description as string | undefined;
  let version = raw.version as string | undefined;

  const flowObj = raw.flow as Record<string, unknown> | undefined;

  // Check for legacy nested format
  if (flowObj && !id && flowObj.id) {
    id = flowObj.id as string;
  }
  if (flowObj && !name && flowObj.name) {
    name = flowObj.name as string;
  }
  if (flowObj && !description && flowObj.description) {
    description = flowObj.description as string;
  }

  // Validate required fields
  if (!id || typeof id !== "string") {
    errors.push('Missing or invalid "id" field');
  }
  if (!name || typeof name !== "string") {
    errors.push('Missing or invalid "name" field');
  }
  if (!version) {
    version = "1.0.0"; // Default version
  }

  // Validate nodes array
  const rawNodes = raw.nodes as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    errors.push('Missing or empty "nodes" array');
  }

  // Validate edges array
  const rawEdges = raw.edges as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(rawEdges)) {
    errors.push('Missing "edges" array');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid workflow:\n- ${errors.join("\n- ")}`);
  }

  // Normalize nodes - add missing positions
  const nodes: WorkflowNode[] = rawNodes!.map((node, index) => {
    const position = node.position as { x: number; y: number } | undefined;

    const workflowNode: WorkflowNode = {
      id: node.id as string,
      functionId: node.functionId as string,
      params: (node.params as Record<string, unknown>) ?? {},
      position: position ?? {
        x: 100 + (index % 4) * 250,
        y: 100 + Math.floor(index / 4) * 150,
      },
      label: node.label as string | undefined,
      runtime: node.runtime as WorkflowNode["runtime"],
      envs: (node.envs ?? node.env) as Record<string, string> | undefined,
    };

    // Preserve cluster-specific properties
    if (node.nodeType) {
      workflowNode.nodeType = node.nodeType as NodeType;
    }
    if (node.handles) {
      workflowNode.handles = node.handles as NodeHandle[];
    }
    if (node.parentId) {
      workflowNode.parentId = node.parentId as string;
    }

    return workflowNode;
  });

  // Validate each node has required fields
  for (const node of nodes) {
    if (!node.id) {
      errors.push("Node missing id");
    }
    if (!node.functionId) {
      errors.push(`Node "${node.id}" missing functionId`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid workflow nodes:\n- ${errors.join("\n- ")}`);
  }

  // Normalize edges and deduplicate
  const seenEdges = new Set<string>();
  const edges: WorkflowEdge[] = [];
  for (const edge of rawEdges!) {
    const key = `${edge.from}-${edge.to}-${edge.action ?? "default"}`;
    if (!seenEdges.has(key)) {
      seenEdges.add(key);
      const workflowEdge: WorkflowEdge = {
        from: edge.from as string,
        to: edge.to as string,
        action: (edge.action as EdgeAction) ?? "default",
      };

      // Preserve handle references
      if (edge.sourceHandle) {
        workflowEdge.sourceHandle = edge.sourceHandle as string;
      }
      if (edge.targetHandle) {
        workflowEdge.targetHandle = edge.targetHandle as string;
      }
      if (edge.edgeType) {
        workflowEdge.edgeType = edge.edgeType as WorkflowEdge["edgeType"];
      }

      edges.push(workflowEdge);
    }
  }

  // Extract startNodeId from flow object
  const startNodeId = flowObj?.startNodeId as string | undefined;
  const envs = flowObj?.envs as Record<string, string> | undefined;

  return {
    id: id!,
    name: name!,
    description,
    version: version!,
    nodes,
    edges,
    flow: {
      startNodeId: startNodeId ?? nodes[0]?.id ?? "",
      envs,
    },
  };
}

// ============================================================================
// Hook
// ============================================================================

export function useFlowEditor(
  initialWorkflow?: WorkflowDefinition,
): [FlowEditorState, FlowEditorActions] {
  const registeredFunctions = useMemo(() => registry.getIds(), []);

  // Ref to track when we're importing (to suppress dirty flag during import)
  const isImportingRef = useRef(false);

  // Initial state
  const [nodes, setNodes] = useState<Node[]>(() => {
    if (!initialWorkflow) return [];
    return initialWorkflow.nodes.map((n) => {
      const hasError = !registeredFunctions.has(n.functionId);
      return workflowNodeToReactFlowNode(n, hasError);
    });
  });

  const [edges, setEdges] = useState<Edge[]>(() => {
    if (!initialWorkflow) return [];
    return initialWorkflow.edges.map((e, i) =>
      workflowEdgeToReactFlowEdge(e, i, initialWorkflow.nodes),
    );
  });

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const [workflowMeta, setWorkflowMeta] = useState({
    id: initialWorkflow?.id ?? "new-workflow",
    name: initialWorkflow?.name ?? "New Workflow",
    description: initialWorkflow?.description ?? "",
    version: initialWorkflow?.version ?? "1.0.0",
    startNodeId: initialWorkflow?.flow?.startNodeId ?? "",
  });

  // Compute node errors
  const nodeErrors = useMemo(() => {
    const errors = new Map<string, string>();
    for (const node of nodes) {
      const functionId = node.data.functionId as string;
      if (!registeredFunctions.has(functionId)) {
        errors.set(node.id, `Function "${functionId}" is not registered`);
      }
    }
    return errors;
  }, [nodes, registeredFunctions]);

  // Actions
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
    // Don't mark dirty during import (React Flow fires changes for dimensions/positions)
    if (!isImportingRef.current) {
      setIsDirty(true);
    }
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    // Check for edge removals that might affect sub-nodes
    const removedEdges: string[] = [];
    for (const change of changes) {
      if (change.type === "remove") {
        removedEdges.push(change.id);
      }
    }

    // If there are removed edges, check if any are subnode edges
    if (removedEdges.length > 0) {
      setEdges((currentEdges) => {
        // Find which edges are being removed
        const edgesToRemove = currentEdges.filter((e) =>
          removedEdges.includes(e.id),
        );

        // Find sub-node edges being removed
        const subnodeEdgesToRemove = edgesToRemove.filter(
          (e) => e.type === "subnode",
        );

        // If any subnode edges are removed, reset those target nodes to regular nodes
        if (subnodeEdgesToRemove.length > 0) {
          const targetNodeIds = subnodeEdgesToRemove.map((e) => e.target);
          setNodes((nds) =>
            nds.map((n) =>
              targetNodeIds.includes(n.id)
                ? {
                    ...n,
                    type: "function",
                    data: {
                      ...n.data,
                      nodeType: undefined,
                      parentId: undefined,
                      isSubNode: undefined,
                    },
                  }
                : n,
            ),
          );
        }

        return applyEdgeChanges(changes, currentEdges);
      });
    } else {
      setEdges((eds) => applyEdgeChanges(changes, eds));
    }

    // Don't mark dirty during import
    if (!isImportingRef.current) {
      setIsDirty(true);
    }
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      setNodes((currentNodes) => {
        // Check if source is a cluster root with a sourceHandle
        const sourceNode = currentNodes.find((n) => n.id === connection.source);
        const targetNode = currentNodes.find((n) => n.id === connection.target);

        const isClusterRootSource =
          sourceNode?.data?.nodeType === "clusterRoot" ||
          sourceNode?.type === "clusterRoot";

        // Get the cluster root's handles to check if this sourceHandle is a sub-node handle
        const clusterHandles =
          (sourceNode?.data?.handles as NodeHandle[]) ?? [];
        const sourceHandleId = connection.sourceHandle;

        // Only consider it a sub-node connection if:
        // 1. Source is a cluster root
        // 2. The sourceHandle matches one of the defined sub-node handles (bottom handles)
        // The right-side output handle has no sourceHandle or sourceHandle === null
        const isSubNodeHandle =
          sourceHandleId != null &&
          clusterHandles.some((h) => h.id === sourceHandleId);
        const isSubNodeConnection = isClusterRootSource && isSubNodeHandle;

        // If connecting from cluster root's bottom handle to a regular node, make it a sub-node
        if (isSubNodeConnection && targetNode?.type === "function") {
          // Update target node to be a sub-node
          return currentNodes.map((n) =>
            n.id === connection.target
              ? {
                  ...n,
                  type: "subNode",
                  data: {
                    ...n.data,
                    nodeType: "subNode",
                    parentId: connection.source,
                    isSubNode: true,
                  },
                }
              : n,
          );
        }

        return currentNodes;
      });

      // Get current nodes state to determine edge type
      setEdges((eds) => {
        // We need to check if this is a sub-node edge by looking at source node's handles
        const sourceNode = nodes.find((n) => n.id === connection.source);
        const clusterHandles =
          (sourceNode?.data?.handles as NodeHandle[]) ?? [];
        const sourceHandleId = connection.sourceHandle;

        // Only sub-node edges come from defined cluster handles (bottom)
        const isSubNodeEdge =
          sourceHandleId != null &&
          clusterHandles.some((h) => h.id === sourceHandleId);

        return addEdge(
          {
            ...connection,
            type: isSubNodeEdge ? "subnode" : "smoothstep",
            label: isSubNodeEdge ? undefined : "default",
            data: isSubNodeEdge
              ? { color: "purple", label: undefined }
              : undefined,
          },
          eds,
        );
      });

      setIsDirty(true);
    },
    [nodes],
  );

  const addNode = useCallback(
    (functionId: string, position?: { x: number; y: number }) => {
      const metadata = registry.get(functionId)?.metadata;
      const hasError = !registeredFunctions.has(functionId);

      const newNode: Node = {
        id: generateId(),
        type: hasError ? "error" : "function",
        position: position ?? { x: 250, y: 100 + nodes.length * 100 },
        data: {
          label: metadata?.name ?? functionId,
          functionId,
          params: {},
          hasError,
        },
      };

      setNodes((nds) => [...nds, newNode]);
      setIsDirty(true);
    },
    [nodes.length, registeredFunctions],
  );

  const removeNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) =>
      eds.filter((e) => e.source !== nodeId && e.target !== nodeId),
    );
    setSelectedNodeId((current) => (current === nodeId ? null : current));
    setIsDirty(true);
  }, []);

  const updateNodeParams = useCallback(
    (nodeId: string, params: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, params } } : n,
        ),
      );
      setIsDirty(true);
    },
    [],
  );

  const updateNodeLabel = useCallback((nodeId: string, label: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, label } } : n,
      ),
    );
    setIsDirty(true);
  }, []);

  const selectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  const importWorkflow = useCallback(
    (
      json: string,
    ): { success: boolean; error?: string; warnings?: string[] } => {
      try {
        const raw = JSON.parse(json) as Record<string, unknown>;
        const warnings: string[] = [];

        // Check for common issues and warn
        const rawNodes = raw.nodes as
          | Array<Record<string, unknown>>
          | undefined;
        if (rawNodes?.some((n) => !n.position)) {
          warnings.push(
            "Some nodes were missing position data - auto-positioned",
          );
        }
        if (raw.flow && (raw.flow as Record<string, unknown>).id && !raw.id) {
          warnings.push(
            "Legacy format detected (id/name in flow) - auto-migrated",
          );
        }

        // Validate and normalize
        const workflow = validateAndNormalizeWorkflow(raw);

        // Import nodes (missing functions show as red)
        const newNodes = workflow.nodes.map((n) => {
          const hasError = !registeredFunctions.has(n.functionId);
          return workflowNodeToReactFlowNode(n, hasError);
        });

        const newEdges = workflow.edges.map((e, i) =>
          workflowEdgeToReactFlowEdge(e, i),
        );

        // Set importing flag to suppress dirty state from React Flow's internal changes
        isImportingRef.current = true;

        setNodes(newNodes);
        setEdges(newEdges);
        setWorkflowMeta({
          id: workflow.id,
          name: workflow.name,
          description: workflow.description ?? "",
          version: workflow.version,
          startNodeId: workflow.flow?.startNodeId ?? "",
        });
        setSelectedNodeId(null);
        setIsDirty(false);

        // Reset importing flag after a microtask to allow React Flow to process changes
        queueMicrotask(() => {
          isImportingRef.current = false;
        });

        return {
          success: true,
          warnings: warnings.length > 0 ? warnings : undefined,
        };
      } catch (e) {
        isImportingRef.current = false;
        return {
          success: false,
          error: e instanceof Error ? e.message : "Invalid JSON",
        };
      }
    },
    [registeredFunctions],
  );

  const exportWorkflow = useCallback((): WorkflowDefinition => {
    // Use stored startNodeId, or detect from nodes if not set
    let startNodeId = workflowMeta.startNodeId;
    if (!startNodeId) {
      const startNode =
        nodes.find(
          (n) => n.id === "start" || n.data.functionId === "core.start",
        ) ?? nodes[0];
      startNodeId = startNode?.id ?? "";
    }

    return {
      id: workflowMeta.id,
      name: workflowMeta.name,
      description: workflowMeta.description || undefined,
      version: workflowMeta.version,
      nodes: nodes.map(reactFlowNodeToWorkflowNode),
      edges: edges.map(reactFlowEdgeToWorkflowEdge),
      flow: {
        startNodeId,
      },
      metadata: {
        updatedAt: new Date().toISOString(),
      },
    };
  }, [nodes, edges, workflowMeta]);

  const clear = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setWorkflowMeta({
      id: "new-workflow",
      name: "New Workflow",
      description: "",
      version: "1.0.0",
      startNodeId: "",
    });
    setIsDirty(false);
  }, []);

  const updateMeta = useCallback(
    (meta: Partial<FlowEditorState["workflowMeta"]>) => {
      setWorkflowMeta((prev) => ({ ...prev, ...meta }));
      setIsDirty(true);
    },
    [],
  );

  const validate = useCallback((): { valid: boolean; errors: string[] } => {
    const workflow = exportWorkflow();
    const result = validateWorkflow(workflow, registeredFunctions);
    return {
      valid: result.valid,
      errors: [
        ...result.errors.map((e) => `${e.path}: ${e.message}`),
        ...result.warnings.map((w) => `Warning: ${w.path}: ${w.message}`),
      ],
    };
  }, [exportWorkflow, registeredFunctions]);

  // Cluster management actions
  const convertToClusterRoot = useCallback((nodeId: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              type: "clusterRoot",
              data: {
                ...n.data,
                nodeType: "clusterRoot",
                handles: [
                  { id: "a", type: "source", label: "A" },
                  { id: "b", type: "source", label: "B" },
                ],
              },
            }
          : n,
      ),
    );
    setIsDirty(true);
  }, []);

  const convertToRegularNode = useCallback((nodeId: string) => {
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
                isSubNode: undefined,
              },
            }
          : n,
      ),
    );
    // Also remove any subnode edges from this node
    setEdges((eds) =>
      eds.filter((e) => !(e.source === nodeId && e.type === "subnode")),
    );
    setIsDirty(true);
  }, []);

  const addClusterHandle = useCallback((nodeId: string, label?: string) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;

        const currentHandles = (n.data.handles as NodeHandle[]) ?? [];
        const nextId = String.fromCharCode(
          97 + currentHandles.length, // a, b, c, d...
        );
        const newHandle: NodeHandle = {
          id: nextId,
          type: "source",
          label: label ?? nextId.toUpperCase(),
        };

        return {
          ...n,
          data: {
            ...n.data,
            handles: [...currentHandles, newHandle],
          },
        };
      }),
    );
    setIsDirty(true);
  }, []);

  const removeClusterHandle = useCallback(
    (nodeId: string, handleId: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;

          const currentHandles = (n.data.handles as NodeHandle[]) ?? [];
          return {
            ...n,
            data: {
              ...n.data,
              handles: currentHandles.filter((h) => h.id !== handleId),
            },
          };
        }),
      );
      // Remove edges using this handle
      setEdges((eds) =>
        eds.filter(
          (e) => !(e.source === nodeId && e.sourceHandle === handleId),
        ),
      );
      setIsDirty(true);
    },
    [],
  );

  const renameClusterHandle = useCallback(
    (nodeId: string, handleId: string, newLabel: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;

          const currentHandles = (n.data.handles as NodeHandle[]) ?? [];
          return {
            ...n,
            data: {
              ...n.data,
              handles: currentHandles.map((h) =>
                h.id === handleId ? { ...h, label: newLabel } : h,
              ),
            },
          };
        }),
      );
      setIsDirty(true);
    },
    [],
  );

  const getNodeType = useCallback(
    (nodeId: string): NodeType | undefined => {
      const node = nodes.find((n) => n.id === nodeId);
      return node?.data?.nodeType as NodeType | undefined;
    },
    [nodes],
  );

  const getNodeHandles = useCallback(
    (nodeId: string): NodeHandle[] | undefined => {
      const node = nodes.find((n) => n.id === nodeId);
      return node?.data?.handles as NodeHandle[] | undefined;
    },
    [nodes],
  );

  const state: FlowEditorState = {
    nodes,
    edges,
    selectedNodeId,
    nodeErrors,
    isDirty,
    workflowMeta,
  };

  const actions: FlowEditorActions = {
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    removeNode,
    updateNodeParams,
    updateNodeLabel,
    selectNode,
    importWorkflow,
    exportWorkflow,
    clear,
    updateMeta,
    validate,
    convertToClusterRoot,
    convertToRegularNode,
    addClusterHandle,
    removeClusterHandle,
    renameClusterHandle,
    getNodeType,
    getNodeHandles,
  };

  return [state, actions];
}
