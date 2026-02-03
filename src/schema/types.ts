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

/**
 * Node handle definition for multi-output nodes
 */
export interface NodeHandle {
  /** Unique handle ID (e.g., 'a', 'b', 'success', 'error') */
  id: string;
  /** Handle type - source (output) or target (input) */
  type: "source" | "target";
  /** Optional display label */
  label?: string;
  /** Position on the node (default: right for source, left for target) */
  position?: "top" | "right" | "bottom" | "left";
}

/**
 * Node type classification
 */
export type NodeType = "default" | "clusterRoot" | "subNode";

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
  /** Node type for cluster support */
  nodeType?: NodeType;
  /** Custom handles for multi-output nodes (cluster roots) */
  handles?: NodeHandle[];
  /** Parent node ID if this is a sub-node */
  parentId?: string;
}

// ============================================================================
// Edge Types
// ============================================================================

export type EdgeAction = "default" | "success" | "error" | "condition";

/**
 * Edge type for visual differentiation
 */
export type EdgeType = "default" | "subnode";

export interface WorkflowEdge {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Action/condition that triggers this edge */
  action: EdgeAction;
  /** Optional condition expression for conditional edges */
  condition?: string;
  /** Source handle ID for multi-output nodes */
  sourceHandle?: string;
  /** Target handle ID for multi-input nodes */
  targetHandle?: string;
  /** Edge type for styling (default or subnode) */
  edgeType?: EdgeType;
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
