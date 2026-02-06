/**
 * Flow Editor Hook
 * Manages state for the React Flow editor
 */

import { useState, useRef } from "react";
import type {
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
} from "@xyflow/react";
import type {
  WorkflowDefinition,
  NodeType,
  NodeHandle,
} from "../../schema/types";
import { useNodeManagement } from "./useNodeManagement";
import { useEdgeManagement } from "./useEdgeManagement";
import { useWorkflowState } from "./useWorkflowState";
import {
  workflowNodeToReactFlowNode,
  workflowEdgeToReactFlowEdge,
} from "./flowEditorUtils";
import { registry } from "../../registry";

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
// Main Hook
// ============================================================================

export function useFlowEditor(
  initialWorkflow?: WorkflowDefinition,
): [FlowEditorState, FlowEditorActions] {
  // Ref to track when we're importing (to suppress dirty flag during import)
  const isImportingRef = useRef(false);

  // Core state
  const [nodes, setNodes] = useState<Node[]>(() => {
    if (!initialWorkflow) return [];
    const registeredFunctions = registry.getIds();
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

  // Use the smaller hooks
  const nodeManagement = useNodeManagement(
    nodes,
    setNodes,
    setSelectedNodeId,
    setIsDirty,
    isImportingRef,
  );

  const edgeManagement = useEdgeManagement(
    edges,
    setEdges,
    nodes,
    setNodes,
    setIsDirty,
  );

  const workflowState = useWorkflowState(
    nodes,
    edges,
    workflowMeta,
    setWorkflowMeta,
    setNodes,
    setEdges,
    setSelectedNodeId,
    isDirty,
    setIsDirty,
    isImportingRef,
  );

  // Combine all actions
  const actions: FlowEditorActions = {
    ...nodeManagement,
    ...edgeManagement,
    ...workflowState,
  };

  // Current state
  const state: FlowEditorState = {
    nodes,
    edges,
    selectedNodeId,
    nodeErrors: workflowState.nodeErrors,
    isDirty: workflowState.isDirty,
    workflowMeta: workflowState.workflowMeta,
  };

  return [state, actions];
}
