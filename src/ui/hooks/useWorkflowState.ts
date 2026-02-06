/**
 * Workflow State Management Hook
 * Handles workflow validation, import/export, and metadata management
 */

import { useCallback, useMemo } from "react";
import type { Node, Edge } from "@xyflow/react";
import type { WorkflowDefinition } from "../../schema/types";
import { validateWorkflow } from "../../schema/validator";
import { registry } from "../../registry";
import {
  workflowNodeToReactFlowNode,
  workflowEdgeToReactFlowEdge,
  reactFlowNodeToWorkflowNode,
  reactFlowEdgeToWorkflowEdge,
} from "./flowEditorUtils";

export interface WorkflowState {
  /** Workflow metadata */
  workflowMeta: {
    id: string;
    name: string;
    description: string;
    version: string;
    startNodeId: string;
  };
  /** Validation errors for nodes */
  nodeErrors: Map<string, string>;
  /** Whether there are unsaved changes */
  isDirty: boolean;
}

export interface WorkflowStateActions {
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
  updateMeta: (meta: Partial<WorkflowState["workflowMeta"]>) => void;
  /** Validate current workflow */
  validate: () => { valid: boolean; errors: string[] };
}

export function useWorkflowState(
  nodes: Node[],
  edges: Edge[],
  workflowMeta: WorkflowState["workflowMeta"],
  setWorkflowMeta: React.Dispatch<
    React.SetStateAction<WorkflowState["workflowMeta"]>
  >,
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
  setSelectedNodeId: React.Dispatch<React.SetStateAction<string | null>>,
  isDirty: boolean,
  setIsDirty: (dirty: boolean) => void,
  isImportingRef: React.MutableRefObject<boolean>,
): WorkflowState & WorkflowStateActions {
  const registeredFunctions = useMemo(() => registry.getIds(), []);

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

  const importWorkflow = useCallback(
    (json: string) => {
      try {
        const workflow = JSON.parse(json) as WorkflowDefinition;

        // Validate the imported workflow
        const validation = validateWorkflow(workflow, registeredFunctions);

        if (!validation.valid) {
          return {
            success: false,
            error: `Invalid workflow: ${validation.errors.map((e) => e.message).join(", ")}`,
          };
        }

        // Set importing flag to prevent dirty state during import
        isImportingRef.current = true;

        // Convert workflow nodes to React Flow nodes
        const reactFlowNodes = workflow.nodes.map((n) => {
          const hasError = !registeredFunctions.has(n.functionId);
          return workflowNodeToReactFlowNode(n, hasError);
        });

        // Convert workflow edges to React Flow edges
        const reactFlowEdges = workflow.edges.map((e, i) =>
          workflowEdgeToReactFlowEdge(e, i, workflow.nodes),
        );

        // Update state
        setNodes(reactFlowNodes);
        setEdges(reactFlowEdges);
        setWorkflowMeta({
          id: workflow.id,
          name: workflow.name,
          description: workflow.description ?? "",
          version: workflow.version,
          startNodeId: workflow.flow?.startNodeId ?? "",
        });
        setSelectedNodeId(null);
        setIsDirty(false);

        // Clear importing flag after a short delay to allow React Flow to settle
        setTimeout(() => {
          isImportingRef.current = false;
        }, 100);

        return {
          success: true,
          warnings: validation.warnings.map((w) => w.message),
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to parse JSON",
        };
      }
    },
    [
      registeredFunctions,
      setNodes,
      setEdges,
      setWorkflowMeta,
      setSelectedNodeId,
      setIsDirty,
      isImportingRef,
    ],
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
  }, [setNodes, setEdges, setSelectedNodeId, setWorkflowMeta, setIsDirty]);

  const updateMeta = useCallback(
    (meta: Partial<WorkflowState["workflowMeta"]>) => {
      setWorkflowMeta((prev) => ({ ...prev, ...meta }));
      setIsDirty(true);
    },
    [setWorkflowMeta, setIsDirty],
  );

  const validate = useCallback((): { valid: boolean; errors: string[] } => {
    const workflow = exportWorkflow();
    const result = validateWorkflow(workflow, registeredFunctions);
    return {
      valid: result.valid,
      errors: [
        ...result.errors.map((e) => `${e.path}: ${e.message}`),
        ...result.warnings.map((w) => `${w.path}: ${w.message}`),
      ],
    };
  }, [exportWorkflow, registeredFunctions]);

  return {
    workflowMeta,
    nodeErrors,
    isDirty,
    importWorkflow,
    exportWorkflow,
    clear,
    updateMeta,
    validate,
  };
}
