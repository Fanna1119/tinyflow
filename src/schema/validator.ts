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

  // Check for unreachable nodes (warning only)
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
