/**
 * Built-in Workflow Templates & Patterns
 *
 * Templates are now stored as JSON files in the /templates directory
 * and loaded dynamically via the server API.
 *
 * Patterns remain hardcoded since they are structural building blocks,
 * not full workflows.
 */

import type { WorkflowPattern } from "./types";
export type {
  WorkflowTemplate,
  WorkflowPattern,
  TemplateCategory,
} from "./types";
export { fetchTemplates } from "../utils/serverApi";

// ============================================================================
// Patterns — insertable sub-graphs for existing workflows
// ============================================================================

const errorHandlerPattern: WorkflowPattern = {
  id: "error-handler",
  name: "Error Handler",
  description: "Add error handling with a fallback path",
  icon: "ShieldAlert",
  nodes: [
    {
      id: "check",
      functionId: "control.condition",
      params: { leftKey: "result", operator: "exists" },
      position: { x: 0, y: 0 },
      label: "Check Result",
    },
    {
      id: "handle-error",
      functionId: "core.log",
      params: { message: "Error occurred — applying fallback" },
      position: { x: 0, y: 180 },
      label: "Handle Error",
    },
    {
      id: "fallback-value",
      functionId: "core.setValue",
      params: { key: "result", value: { error: false, fallback: true } },
      position: { x: 250, y: 180 },
      label: "Set Fallback",
    },
  ],
  edges: [
    { from: "check", to: "handle-error", action: "error" },
    { from: "handle-error", to: "fallback-value", action: "default" },
  ],
};

const transformChainPattern: WorkflowPattern = {
  id: "transform-chain",
  name: "Transform Chain",
  description:
    "Extract → template → store — a reusable data transform sequence",
  icon: "Wand2",
  nodes: [
    {
      id: "extract",
      functionId: "transform.map",
      params: { inputKey: "data", path: "value", outputKey: "extracted" },
      position: { x: 0, y: 0 },
      label: "Extract",
    },
    {
      id: "format",
      functionId: "transform.template",
      params: {
        template: "Formatted: {{extracted}}",
        outputKey: "formatted",
      },
      position: { x: 250, y: 0 },
      label: "Format",
    },
    {
      id: "store",
      functionId: "core.setValue",
      params: { key: "output", value: "{{formatted}}" },
      position: { x: 500, y: 0 },
      label: "Store Result",
    },
  ],
  edges: [
    { from: "extract", to: "format", action: "default" },
    { from: "format", to: "store", action: "default" },
  ],
};

const logAndContinuePattern: WorkflowPattern = {
  id: "log-and-continue",
  name: "Log & Continue",
  description: "Log a value and continue the flow",
  icon: "MessageSquare",
  nodes: [
    {
      id: "log",
      functionId: "core.log",
      params: { message: "Checkpoint reached" },
      position: { x: 0, y: 0 },
      label: "Log",
    },
  ],
  edges: [],
};

// ============================================================================
// Exports
// ============================================================================

/** All available patterns */
export const patterns: WorkflowPattern[] = [
  errorHandlerPattern,
  transformChainPattern,
  logAndContinuePattern,
];
