/**
 * Flow Editor Hook
 * Manages state for the React Flow editor
 */

import { useState, useCallback, useMemo } from "react";
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
} from "../../schema/types";
import { registry } from "../../registry";
import { validateWorkflow } from "../../schema/validator";

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
  importWorkflow: (json: string) => { success: boolean; error?: string };
  /** Export workflow to JSON */
  exportWorkflow: () => WorkflowDefinition;
  /** Clear the editor */
  clear: () => void;
  /** Update workflow metadata */
  updateMeta: (meta: Partial<FlowEditorState["workflowMeta"]>) => void;
  /** Validate current workflow */
  validate: () => { valid: boolean; errors: string[] };
}

// ============================================================================
// Utilities
// ============================================================================

function generateId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function workflowNodeToReactFlowNode(
  node: WorkflowNode,
  hasError: boolean,
): Node {
  return {
    id: node.id,
    type: hasError ? "error" : "function",
    position: node.position,
    data: {
      label: node.label ?? node.functionId,
      functionId: node.functionId,
      params: node.params,
      runtime: node.runtime,
      envs: node.envs,
      hasError,
    },
  };
}

function workflowEdgeToReactFlowEdge(edge: WorkflowEdge): Edge {
  return {
    id: `${edge.from}-${edge.to}-${edge.action}`,
    source: edge.from,
    target: edge.to,
    label: edge.action !== "default" ? edge.action : undefined,
    type: "smoothstep",
    animated: edge.action === "error",
    style: edge.action === "error" ? { stroke: "#ef4444" } : undefined,
  };
}

function reactFlowNodeToWorkflowNode(node: Node): WorkflowNode {
  return {
    id: node.id,
    functionId: node.data.functionId as string,
    params: (node.data.params as Record<string, unknown>) ?? {},
    position: node.position,
    label: node.data.label as string | undefined,
    runtime: node.data.runtime as WorkflowNode["runtime"],
    envs: node.data.envs as Record<string, string>,
  };
}

function reactFlowEdgeToWorkflowEdge(edge: Edge): WorkflowEdge {
  const validActions: EdgeAction[] = [
    "default",
    "success",
    "error",
    "condition",
  ];
  const edgeLabel = edge.label as string;
  const action = validActions.includes(edgeLabel as EdgeAction)
    ? (edgeLabel as EdgeAction)
    : "default";
  return {
    from: edge.source,
    to: edge.target,
    action,
  };
}

// ============================================================================
// Hook
// ============================================================================

export function useFlowEditor(
  initialWorkflow?: WorkflowDefinition,
): [FlowEditorState, FlowEditorActions] {
  const registeredFunctions = useMemo(() => registry.getIds(), []);

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
    return initialWorkflow.edges.map(workflowEdgeToReactFlowEdge);
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
    setIsDirty(true);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
    setIsDirty(true);
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) =>
      addEdge(
        {
          ...connection,
          type: "smoothstep",
          label: "default",
        },
        eds,
      ),
    );
    setIsDirty(true);
  }, []);

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
    (json: string): { success: boolean; error?: string } => {
      try {
        const workflow = JSON.parse(json) as WorkflowDefinition;

        // Import even if there are validation errors (missing functions show as red)
        const newNodes = workflow.nodes.map((n) => {
          const hasError = !registeredFunctions.has(n.functionId);
          return workflowNodeToReactFlowNode(n, hasError);
        });

        const newEdges = workflow.edges.map(workflowEdgeToReactFlowEdge);

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

        return { success: true };
      } catch (e) {
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
  };

  return [state, actions];
}
