/**
 * TinyFlow Schema Types
 * Defines the workflow JSON format - the single source of truth
 */

// ============================================================================
// Node Types
// ============================================================================

export interface NodePosition {
  x: number;
  y: number;
}

export interface NodeRuntime {
  /** Maximum retries on failure */
  maxRetries?: number;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Wait time between retries in ms */
  retryDelay?: number;
}

export interface WorkflowNode {
  /** Unique identifier for this node instance */
  id: string;
  /** Reference to registered function in the registry */
  functionId: string;
  /** Parameters to pass to the function */
  params: Record<string, unknown>;
  /** Runtime configuration */
  runtime?: NodeRuntime;
  /** Environment variables for this node */
  envs?: Record<string, string>;
  /** Position in React Flow canvas */
  position: NodePosition;
  /** Optional display label */
  label?: string;
}

// ============================================================================
// Edge Types
// ============================================================================

export type EdgeAction = "default" | "success" | "error" | "condition";

export interface WorkflowEdge {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Action/condition that triggers this edge */
  action: EdgeAction;
  /** Optional condition expression for conditional edges */
  condition?: string;
}

// ============================================================================
// Flow Configuration
// ============================================================================

export interface FlowConfig {
  /** ID of the node where execution begins */
  startNodeId: string;
  /** Optional flow-level runtime settings */
  runtime?: NodeRuntime;
  /** Global environment variables */
  envs?: Record<string, string>;
}

// ============================================================================
// Workflow Definition (Complete JSON Structure)
// ============================================================================

export interface WorkflowDefinition {
  /** Workflow identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Optional description */
  description?: string;
  /** Version string */
  version: string;
  /** All nodes in the workflow */
  nodes: WorkflowNode[];
  /** Connections between nodes */
  edges: WorkflowEdge[];
  /** Flow execution configuration */
  flow: FlowConfig;
  /** Metadata */
  metadata?: {
    author?: string;
    createdAt?: string;
    updatedAt?: string;
    tags?: string[];
  };
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationError {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// ============================================================================
// Registry Types (for schema context)
// ============================================================================

export interface FunctionParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  required: boolean;
  default?: unknown;
  description?: string;
}

export interface FunctionMetadata {
  /** Unique function identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description of what the function does */
  description: string;
  /** Category for UI grouping */
  category: string;
  /** Input parameters schema */
  params: FunctionParameter[];
  /** Output description */
  outputs?: string[];
  /** Icon name (lucide-react) */
  icon?: string;
}
