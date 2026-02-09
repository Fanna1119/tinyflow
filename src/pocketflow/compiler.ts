/**
 * TinyFlow Compiler
 *
 * Transforms workflow JSON into executable PocketFlow Flow.
 *
 * Design Philosophy:
 * - Direct mapping to PocketFlow primitives
 * - Minimal custom logic
 * - JSON → PocketFlow graph compilation
 * - Shared store for inter-node communication
 */

import { Flow } from "pocketflow";
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEdge,
  ValidationResult,
} from "../schema/types";
import { validateWorkflow } from "../schema/validator";
import { registry } from "../registry";

// Import from new PocketFlow integration layer
import {
  TinyFlowNode,
  TinyFlowBatchNode,
  TinyFlowParallelNode,
  type AnyTinyFlowNode,
} from "../pocketflow/nodes";
import {
  type SharedStore,
  type MockValue,
  type DebugCallbacks,
  type MemoryLimits,
  type NodeProfile,
  createSharedStore,
} from "../pocketflow/shared";

// Re-export types for backward compatibility
export type {
  SharedStore,
  MockValue,
  DebugCallbacks,
  MemoryLimits,
  NodeProfile,
};
export { createSharedStore };

// ============================================================================
// Compilation Result
// ============================================================================

export interface CompilationResult {
  success: boolean;
  flow?: Flow<SharedStore>;
  startNodeId?: string;
  validation: ValidationResult;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Compiler Options
// ============================================================================

export interface CompileOptions {
  /** Skip registry validation */
  skipRegistryValidation?: boolean;
  /** Global environment variables */
  globalEnvs?: Record<string, string>;
}

// ============================================================================
// Node Type Detection
// ============================================================================

/**
 * Detect which PocketFlow primitive to use based on function ID
 */
function getNodeType(
  nodeDef: WorkflowNode,
): "node" | "batch" | "parallel" | "cluster" {
  const fnId = nodeDef.functionId;

  // Parallel processing
  if (fnId === "control.parallel" || fnId === "control.batchForEach") {
    return "parallel";
  }

  // Sequential batch processing
  if (fnId === "control.batch") {
    return "batch";
  }

  // Cluster (parallel sub-flows)
  if (nodeDef.nodeType === "clusterRoot") {
    return "cluster";
  }

  // Regular node
  return "node";
}

/**
 * Create the appropriate PocketFlow node type
 */
function createPocketFlowNode(
  nodeDef: WorkflowNode,
  flowEnvs: Record<string, string>,
): AnyTinyFlowNode {
  const nodeType = getNodeType(nodeDef);

  switch (nodeType) {
    case "batch":
      return new TinyFlowBatchNode(nodeDef, flowEnvs);
    case "parallel":
      return new TinyFlowParallelNode(nodeDef, flowEnvs);
    default:
      return new TinyFlowNode(nodeDef, flowEnvs);
  }
}

// ============================================================================
// Cluster Handling
// ============================================================================

/**
 * Custom cluster node that executes sub-nodes in parallel
 * Uses PocketFlow's Node with custom exec that runs Promise.all
 */
class ClusterNode extends TinyFlowNode {
  private subNodeConfigs: WorkflowNode[] = [];
  private subNodeEdges: WorkflowEdge[] = [];

  setSubNodes(configs: WorkflowNode[], edges: WorkflowEdge[]): void {
    this.subNodeConfigs = configs;
    this.subNodeEdges = edges;
  }

  getSubNodes(): WorkflowNode[] {
    return this.subNodeConfigs;
  }

  async exec(
    config: WorkflowNode,
  ): Promise<import("../registry").FunctionResult> {
    // First execute the cluster root's own function
    const rootResult = await super.exec(config);

    if (!rootResult.success) {
      return rootResult;
    }

    // Then execute all sub-nodes in parallel
    if (this.subNodeConfigs.length > 0) {
      const shared = (this as any)._shared as SharedStore;

      shared.logs.push(
        `[${config.id}] Executing ${this.subNodeConfigs.length} sub-nodes in parallel`,
      );

      const subResults = await Promise.all(
        this.subNodeConfigs.map((subConfig) =>
          this.executeSubNode(subConfig, shared),
        ),
      );

      // Store combined outputs
      const outputs: Record<string, unknown> = {};
      for (const { nodeId, result } of subResults) {
        outputs[nodeId] = result.output;
      }
      shared.data.set("_clusterOutputs", { [config.id]: outputs });
    }

    return rootResult;
  }

  private async executeSubNode(
    subConfig: WorkflowNode,
    shared: SharedStore,
  ): Promise<{ nodeId: string; result: import("../registry").FunctionResult }> {
    await shared.debugCallbacks?.onBeforeNode?.(subConfig.id);
    shared.debugCallbacks?.onNodeStart?.(
      subConfig.id,
      subConfig.params as Record<string, unknown>,
    );

    const fn = registry.getExecutable(subConfig.functionId);
    if (!fn) {
      return {
        nodeId: subConfig.id,
        result: {
          output: null,
          success: false,
          error: `Function not found: ${subConfig.functionId}`,
        },
      };
    }

    const context = {
      nodeId: subConfig.id,
      store: shared.data,
      env: { ...subConfig.envs },
      log: (msg: string) => {
        shared.logs.push(`[${subConfig.id}] ${msg}`);
        console.log(`[${subConfig.id}] ${msg}`);
      },
    };

    try {
      const result = await fn(subConfig.params, context);
      shared.nodeResults.set(subConfig.id, result);
      shared.debugCallbacks?.onNodeComplete?.(
        subConfig.id,
        result.success,
        result.output,
      );
      shared.logs.push(
        `[${result.success ? "✓" : "✗"}] ${subConfig.id}: ${result.success ? "completed" : result.error}`,
      );
      return { nodeId: subConfig.id, result };
    } catch (e) {
      const result = {
        output: null,
        success: false,
        error: e instanceof Error ? e.message : "Unknown error",
      };
      shared.nodeResults.set(subConfig.id, result);
      return { nodeId: subConfig.id, result };
    }
  }
}

// ============================================================================
// Main Compiler
// ============================================================================

/**
 * Compile a workflow definition into a PocketFlow Flow
 */
export function compileWorkflow(
  workflow: WorkflowDefinition,
  options: CompileOptions = {},
): CompilationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate workflow
  const registeredFunctions = options.skipRegistryValidation
    ? undefined
    : registry.getIds();

  const validation = validateWorkflow(workflow, registeredFunctions);

  for (const err of validation.errors) {
    errors.push(`${err.path}: ${err.message}`);
  }
  for (const warn of validation.warnings) {
    warnings.push(`${warn.path}: ${warn.message}`);
  }

  if (!validation.valid) {
    return { success: false, validation, errors, warnings };
  }

  // Merge environment variables
  const flowEnvs = {
    ...options.globalEnvs,
    ...workflow.flow.envs,
  };

  // Identify cluster roots and sub-nodes
  const clusterRoots = new Set<string>();
  const subNodes = new Set<string>();
  const subNodesByParent = new Map<string, WorkflowNode[]>();

  for (const nodeDef of workflow.nodes) {
    if (nodeDef.nodeType === "clusterRoot") {
      clusterRoots.add(nodeDef.id);
      subNodesByParent.set(nodeDef.id, []);
    } else if (nodeDef.nodeType === "subNode" && nodeDef.parentId) {
      subNodes.add(nodeDef.id);
      const siblings = subNodesByParent.get(nodeDef.parentId) ?? [];
      siblings.push(nodeDef);
      subNodesByParent.set(nodeDef.parentId, siblings);
    }
  }

  // Identify sub-node edges
  const subNodeEdges = workflow.edges.filter((e) => e.edgeType === "subnode");
  const subNodeEdgesByParent = new Map<string, WorkflowEdge[]>();
  for (const edge of subNodeEdges) {
    const edges = subNodeEdgesByParent.get(edge.from) ?? [];
    edges.push(edge);
    subNodeEdgesByParent.set(edge.from, edges);
  }

  // Build node map
  const nodeMap = new Map<string, AnyTinyFlowNode | ClusterNode>();

  for (const nodeDef of workflow.nodes) {
    // Skip sub-nodes
    if (subNodes.has(nodeDef.id)) {
      continue;
    }

    if (clusterRoots.has(nodeDef.id)) {
      // Create cluster node
      const clusterNode = new ClusterNode(nodeDef, flowEnvs);
      const childConfigs = subNodesByParent.get(nodeDef.id) ?? [];
      const childEdges = subNodeEdgesByParent.get(nodeDef.id) ?? [];
      clusterNode.setSubNodes(childConfigs, childEdges);
      nodeMap.set(nodeDef.id, clusterNode);
    } else {
      // Create appropriate node type
      const node = createPocketFlowNode(nodeDef, flowEnvs);
      nodeMap.set(nodeDef.id, node);
    }
  }

  // Connect nodes based on edges
  for (const edge of workflow.edges) {
    if (edge.edgeType === "subnode") continue;
    if (subNodes.has(edge.from)) continue;

    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);

    if (!fromNode || !toNode) {
      errors.push(`Invalid edge: ${edge.from} -> ${edge.to}`);
      continue;
    }

    // Use PocketFlow's on() method for action-based routing
    fromNode.on(edge.action, toNode);
  }

  // Get start node
  const startNode = nodeMap.get(workflow.flow.startNodeId);
  if (!startNode) {
    errors.push(`Start node "${workflow.flow.startNodeId}" not found`);
    return { success: false, validation, errors, warnings };
  }

  // Create PocketFlow Flow
  const flow = new Flow<SharedStore>(startNode);

  return {
    success: errors.length === 0,
    flow,
    startNodeId: workflow.flow.startNodeId,
    validation,
    errors,
    warnings,
  };
}

/**
 * Compile workflow from JSON string
 */
export function compileWorkflowFromJson(
  json: string,
  options: CompileOptions = {},
): CompilationResult {
  try {
    const workflow = JSON.parse(json) as WorkflowDefinition;
    return compileWorkflow(workflow, options);
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown error";
    return {
      success: false,
      validation: {
        valid: false,
        errors: [
          {
            path: "/",
            message: `JSON parse error: ${error}`,
            severity: "error",
          },
        ],
        warnings: [],
      },
      errors: [`JSON parse error: ${error}`],
      warnings: [],
    };
  }
}

// Legacy aliases for backward compatibility
export type CompiledStore = SharedStore;

/**
 * Create an initial CompiledStore for execution
 * Wrapper around createSharedStore with positional arguments for backward compatibility
 */
export function createStore(
  initialData: Record<string, unknown> = {},
  env: Record<string, string> = {},
  mockValues?: Map<string, MockValue>,
  debugCallbacks?: DebugCallbacks,
  memoryLimits?: MemoryLimits,
): CompiledStore {
  return createSharedStore({
    initialData,
    env,
    mockValues,
    debugCallbacks,
    memoryLimits,
  });
}
