/**
 * Workflow Validation
 * Validates workflow JSON against schema and semantic rules
 */

import Ajv from "ajv";
import addFormats from "ajv-formats";
import { workflowJsonSchema } from "./json-schema";
import type {
  WorkflowDefinition,
  ValidationResult,
  ValidationError,
} from "./types";

// Initialize AJV with formats support
const ajv = new Ajv({ allErrors: true, verbose: true });
addFormats(ajv);

const validateSchema = ajv.compile(workflowJsonSchema);

/**
 * Validate workflow JSON structure against schema
 */
function validateJsonSchema(workflow: unknown): ValidationError[] {
  const valid = validateSchema(workflow);
  if (valid) return [];

  return (validateSchema.errors ?? []).map((err) => ({
    path: err.instancePath || "/",
    message: err.message ?? "Unknown validation error",
    severity: "error" as const,
  }));
}

/**
 * Validate semantic rules (references, connections, etc.)
 */
function validateSemantics(workflow: WorkflowDefinition): ValidationError[] {
  const errors: ValidationError[] = [];
  const nodeIds = new Set(workflow.nodes.map((n) => n.id));
  const nodeMap = new Map(workflow.nodes.map((n) => [n.id, n]));

  // Check for duplicate node IDs
  const seenIds = new Set<string>();
  for (const node of workflow.nodes) {
    if (seenIds.has(node.id)) {
      errors.push({
        path: `/nodes/${node.id}`,
        message: `Duplicate node ID: ${node.id}`,
        severity: "error",
      });
    }
    seenIds.add(node.id);
  }

  // Validate start node exists
  if (!nodeIds.has(workflow.flow.startNodeId)) {
    errors.push({
      path: "/flow/startNodeId",
      message: `Start node "${workflow.flow.startNodeId}" does not exist`,
      severity: "error",
    });
  }

  // Validate edge references
  for (const edge of workflow.edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push({
        path: `/edges/${edge.from}->${edge.to}`,
        message: `Edge source node "${edge.from}" does not exist`,
        severity: "error",
      });
    }
    if (!nodeIds.has(edge.to)) {
      errors.push({
        path: `/edges/${edge.from}->${edge.to}`,
        message: `Edge target node "${edge.to}" does not exist`,
        severity: "error",
      });
    }
  }

  // ========================================================================
  // Cluster Node Validation
  // ========================================================================

  // Identify cluster root nodes and sub-nodes
  const clusterRoots = workflow.nodes.filter(
    (n) => n.nodeType === "clusterRoot",
  );
  const subNodes = workflow.nodes.filter((n) => n.nodeType === "subNode");

  // Validate subNode parentId references
  for (const subNode of subNodes) {
    if (!subNode.parentId) {
      errors.push({
        path: `/nodes/${subNode.id}/parentId`,
        message: `Sub-node "${subNode.id}" must have a parentId`,
        severity: "error",
      });
      continue;
    }

    if (!nodeIds.has(subNode.parentId)) {
      errors.push({
        path: `/nodes/${subNode.id}/parentId`,
        message: `Sub-node "${subNode.id}" references non-existent parent "${subNode.parentId}"`,
        severity: "error",
      });
      continue;
    }

    const parent = nodeMap.get(subNode.parentId);
    if (parent && parent.nodeType !== "clusterRoot") {
      errors.push({
        path: `/nodes/${subNode.id}/parentId`,
        message: `Sub-node "${subNode.id}" parent "${subNode.parentId}" must be a clusterRoot node`,
        severity: "error",
      });
    }
  }

  // Validate clusterRoot nodes have bottom handles
  for (const cluster of clusterRoots) {
    const hasBottomHandle = cluster.handles?.some(
      (h) => h.position === "bottom" && h.type === "source",
    );
    if (!hasBottomHandle) {
      errors.push({
        path: `/nodes/${cluster.id}/handles`,
        message: `Cluster root "${cluster.id}" should have a bottom source handle for sub-node connections`,
        severity: "warning",
      });
    }
  }

  // Validate subNode edges (edgeType: "subnode")
  const subNodeEdges = workflow.edges.filter((e) => e.edgeType === "subnode");
  for (const edge of subNodeEdges) {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);

    if (fromNode && fromNode.nodeType !== "clusterRoot") {
      errors.push({
        path: `/edges/${edge.from}->${edge.to}`,
        message: `Sub-node edge must originate from a clusterRoot node, not "${fromNode.nodeType || "default"}"`,
        severity: "error",
      });
    }

    if (toNode && toNode.nodeType !== "subNode") {
      errors.push({
        path: `/edges/${edge.from}->${edge.to}`,
        message: `Sub-node edge must target a subNode, not "${toNode.nodeType || "default"}"`,
        severity: "error",
      });
    }
  }

  // Warn about orphaned sub-nodes (no edge from parent)
  for (const subNode of subNodes) {
    if (!subNode.parentId) continue;

    const hasEdgeFromParent = workflow.edges.some(
      (e) =>
        e.from === subNode.parentId &&
        e.to === subNode.id &&
        e.edgeType === "subnode",
    );
    if (!hasEdgeFromParent) {
      errors.push({
        path: `/nodes/${subNode.id}`,
        message: `Sub-node "${subNode.id}" has parentId but no sub-node edge from parent "${subNode.parentId}"`,
        severity: "warning",
      });
    }
  }

  // Check for unreachable nodes (warning only)
  // Sub-nodes are reachable through their cluster root parent
  const reachable = new Set<string>([workflow.flow.startNodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of workflow.edges) {
      if (reachable.has(edge.from) && !reachable.has(edge.to)) {
        reachable.add(edge.to);
        changed = true;
      }
    }
    // Also mark sub-nodes as reachable if their parent is reachable
    for (const subNode of subNodes) {
      if (
        subNode.parentId &&
        reachable.has(subNode.parentId) &&
        !reachable.has(subNode.id)
      ) {
        reachable.add(subNode.id);
        changed = true;
      }
    }
  }

  for (const node of workflow.nodes) {
    if (!reachable.has(node.id)) {
      errors.push({
        path: `/nodes/${node.id}`,
        message: `Node "${node.id}" is unreachable from start node`,
        severity: "warning",
      });
    }
  }

  return errors;
}

/**
 * Validate function references against registry
 */
function validateFunctionReferences(
  workflow: WorkflowDefinition,
  registeredFunctions: Set<string>,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const node of workflow.nodes) {
    if (!registeredFunctions.has(node.functionId)) {
      errors.push({
        path: `/nodes/${node.id}/functionId`,
        message: `Function "${node.functionId}" is not registered`,
        severity: "error",
      });
    }
  }

  return errors;
}

/**
 * Full workflow validation
 */
export function validateWorkflow(
  workflow: unknown,
  registeredFunctions?: Set<string>,
): ValidationResult {
  // First validate JSON schema
  const schemaErrors = validateJsonSchema(workflow);
  if (schemaErrors.length > 0) {
    return {
      valid: false,
      errors: schemaErrors.filter((e) => e.severity === "error"),
      warnings: schemaErrors.filter((e) => e.severity === "warning"),
    };
  }

  // Then validate semantics
  const typedWorkflow = workflow as WorkflowDefinition;
  const semanticErrors = validateSemantics(typedWorkflow);

  // Optionally validate function references
  let functionErrors: ValidationError[] = [];
  if (registeredFunctions) {
    functionErrors = validateFunctionReferences(
      typedWorkflow,
      registeredFunctions,
    );
  }

  const allErrors = [...semanticErrors, ...functionErrors];

  return {
    valid: allErrors.filter((e) => e.severity === "error").length === 0,
    errors: allErrors.filter((e) => e.severity === "error"),
    warnings: allErrors.filter((e) => e.severity === "warning"),
  };
}

/**
 * Quick validation check (returns boolean)
 */
export function isValidWorkflow(
  workflow: unknown,
  registeredFunctions?: Set<string>,
): workflow is WorkflowDefinition {
  return validateWorkflow(workflow, registeredFunctions).valid;
}

/**
 * Parse and validate workflow JSON string
 */
export function parseWorkflow(
  json: string,
  registeredFunctions?: Set<string>,
): { workflow: WorkflowDefinition | null; validation: ValidationResult } {
  try {
    const parsed = JSON.parse(json);
    const validation = validateWorkflow(parsed, registeredFunctions);
    return {
      workflow: validation.valid ? (parsed as WorkflowDefinition) : null,
      validation,
    };
  } catch (e) {
    return {
      workflow: null,
      validation: {
        valid: false,
        errors: [
          {
            path: "/",
            message: `Invalid JSON: ${e instanceof Error ? e.message : "Unknown error"}`,
            severity: "error",
          },
        ],
        warnings: [],
      },
    };
  }
}
