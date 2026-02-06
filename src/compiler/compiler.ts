/**
 * TinyFlow Compiler
 * Transforms workflow JSON + registry into executable PocketFlow Flow
 */

import { Node, Flow, ParallelBatchNode } from "pocketflow";
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEdge,
  ValidationResult,
} from "../schema/types";
import { validateWorkflow } from "../schema/validator";
import {
  registry,
  type ExecutionContext,
  type FunctionResult,
} from "../registry";
import { ClusterRootNode } from "./clusterNode";

// ============================================================================
// Compiled Node Types
// ============================================================================

/**
 * Mock value for testing - allows overriding node behavior
 */
export interface MockValue {
  /** Whether mock is enabled */
  enabled: boolean;
  /** Mock output value */
  output: unknown;
  /** Mock success status */
  success: boolean;
  /** Mock action for edge routing */
  action?: string;
  /** Mock delay in ms (simulates execution time) */
  delay?: number;
}

/**
 * Debug callbacks for tracking execution
 */
export interface DebugCallbacks {
  /** Called before a node starts (can return promise for step-by-step) */
  onBeforeNode?: (nodeId: string) => void | Promise<void>;
  /** Called when a node starts execution */
  onNodeStart?: (nodeId: string, params: Record<string, unknown>) => void;
  /** Called when a node completes */
  onNodeComplete?: (nodeId: string, success: boolean, output: unknown) => void;
}

/**
 * Memory limits for execution to prevent unbounded growth
 */
export interface MemoryLimits {
  /** Maximum number of log entries (default: 1000) */
  maxLogs?: number;
  /** Maximum number of stored node results (default: 1000) */
  maxNodeResults?: number;
  /** Maximum size of data store in bytes (default: 10MB) */
  maxDataSize?: number;
}

export interface CompiledStore {
  /** Shared data store */
  data: Map<string, unknown>;
  /** Execution logs */
  logs: string[];
  /** Environment variables */
  env: Record<string, string>;
  /** Node execution results */
  nodeResults: Map<string, FunctionResult>;
  /** Last error */
  lastError?: { nodeId: string; error: string };
  /** Mock values for testing */
  mockValues?: Map<string, MockValue>;
  /** Debug callbacks */
  debugCallbacks?: DebugCallbacks;
  /** Memory limits configuration */
  memoryLimits?: MemoryLimits;
}

/**
 * Enforce memory limits on a CompiledStore
 */
function enforceMemoryLimits(store: CompiledStore): void {
  const limits = store.memoryLimits ?? {
    maxLogs: 1000,
    maxNodeResults: 1000,
    maxDataSize: 10 * 1024 * 1024, // 10MB
  };

  // Limit logs
  if (store.logs.length > limits.maxLogs!) {
    const excess = store.logs.length - limits.maxLogs!;
    store.logs.splice(0, excess);
    store.logs.unshift(`[SYSTEM] Log truncated: removed ${excess} old entries`);
  }

  // Limit node results
  if (store.nodeResults.size > limits.maxNodeResults!) {
    const entries = Array.from(store.nodeResults.entries());
    const excess = entries.length - limits.maxNodeResults!;
    for (let i = 0; i < excess; i++) {
      store.nodeResults.delete(entries[i][0]);
    }
  }

  // Rough data size check (serialize and check length)
  try {
    const dataSize = JSON.stringify(Object.fromEntries(store.data)).length;
    if (dataSize > limits.maxDataSize!) {
      store.logs.push(
        `[SYSTEM] Warning: Data store size (${dataSize} bytes) exceeds limit (${limits.maxDataSize} bytes)`,
      );
    }
  } catch (e) {
    // Ignore serialization errors for size checking
  }
}

/**
 * A PocketFlow Node wrapping a registry function
 * Uses the simpler approach of storing shared in prep and using it in exec
 */
class TinyFlowNode extends Node<CompiledStore> {
  private _shared: CompiledStore | null = null;

  constructor(
    private nodeConfig: WorkflowNode,
    private flowEnvs: Record<string, string> = {},
  ) {
    // maxRetries defaults to 1 (required for PocketFlow to execute exec at least once)
    // wait time in PocketFlow is in seconds, we convert from ms
    super(
      nodeConfig.runtime?.maxRetries ?? 1,
      (nodeConfig.runtime?.retryDelay ?? 0) / 1000,
    );
  }

  async prep(shared: CompiledStore): Promise<WorkflowNode> {
    // Store shared reference for use in exec
    this._shared = shared;

    // Call onBeforeNode callback (can pause for step-by-step mode)
    await shared.debugCallbacks?.onBeforeNode?.(this.nodeConfig.id);

    // Call debug callback for node start
    const params = this.nodeConfig.params as Record<string, unknown>;
    shared.debugCallbacks?.onNodeStart?.(this.nodeConfig.id, params);

    return this.nodeConfig;
  }

  async exec(config: WorkflowNode): Promise<FunctionResult> {
    const shared = this._shared!;

    // Check for mock value
    const mockValue = shared.mockValues?.get(config.id);
    if (mockValue?.enabled) {
      // Simulate delay if specified
      if (mockValue.delay && mockValue.delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, mockValue.delay));
      }

      shared.logs.push(`[${config.id}] [MOCK] Using mocked value`);
      console.log(`[${config.id}] [MOCK] Using mocked value`);

      return {
        output: mockValue.output,
        success: mockValue.success,
        action: mockValue.action,
        error: mockValue.success ? undefined : "Mocked failure",
      };
    }

    const fn = registry.getExecutable(config.functionId);

    if (!fn) {
      return {
        output: null,
        success: false,
        error: `Function "${config.functionId}" is not registered`,
      };
    }

    // Merge environments: flow envs < node envs
    const env = {
      ...this.flowEnvs,
      ...config.envs,
    };

    const context: ExecutionContext = {
      nodeId: config.id,
      store: shared.data,
      env,
      log: (message: string) => {
        shared.logs.push(`[${config.id}] ${message}`);
        console.log(`[${config.id}] ${message}`);
      },
    };

    try {
      return await fn(config.params, context);
    } catch (e) {
      const error = e instanceof Error ? e.message : "Unknown error";
      return {
        output: null,
        success: false,
        error,
      };
    }
  }

  async post(
    shared: CompiledStore,
    _prepRes: WorkflowNode,
    execRes: FunctionResult,
  ): Promise<string | undefined> {
    const nodeId = this.nodeConfig.id;

    // Store result
    shared.nodeResults.set(nodeId, execRes);

    // Call debug callback for node complete
    shared.debugCallbacks?.onNodeComplete?.(
      nodeId,
      execRes.success,
      execRes.output,
    );

    // Log execution
    const status = execRes.success ? "✓" : "✗";
    shared.logs.push(
      `[${status}] ${nodeId}: ${execRes.success ? "completed" : execRes.error}`,
    );

    // Handle errors
    if (!execRes.success) {
      shared.lastError = { nodeId, error: execRes.error ?? "Unknown error" };
    }

    // Enforce memory limits after each node execution
    enforceMemoryLimits(shared);

    // Return action for edge routing
    return execRes.action ?? (execRes.success ? "default" : "error");
  }
}

/**
 * A PocketFlow ParallelBatchNode for processing arrays with forEach semantics
 * Processes each array item in parallel and collects results
 */
class TinyFlowBatchNode extends ParallelBatchNode<CompiledStore> {
  private _shared: CompiledStore | null = null;

  constructor(
    private nodeConfig: WorkflowNode,
    private flowEnvs: Record<string, string> = {},
  ) {
    // maxRetries defaults to 1 (required for PocketFlow to execute exec at least once)
    // wait time in PocketFlow is in seconds, we convert from ms
    super(
      nodeConfig.runtime?.maxRetries ?? 1,
      (nodeConfig.runtime?.retryDelay ?? 0) / 1000,
    );
  }

  async prep(shared: CompiledStore): Promise<unknown[]> {
    // Store shared reference for use in exec
    this._shared = shared;

    // Call onBeforeNode callback (can pause for step-by-step mode)
    await shared.debugCallbacks?.onBeforeNode?.(this.nodeConfig.id);

    // Call debug callback for node start
    const params = this.nodeConfig.params as Record<string, unknown>;
    shared.debugCallbacks?.onNodeStart?.(this.nodeConfig.id, params);

    // For batchForEach, get the array from params
    const array = params.array as unknown[];
    if (!Array.isArray(array)) {
      throw new Error(
        `BatchForEach: "${JSON.stringify(array)}" is not an array`,
      );
    }

    shared.logs.push(
      `[${this.nodeConfig.id}] BatchForEach: Processing ${array.length} items in parallel`,
    );
    console.log(
      `[${this.nodeConfig.id}] BatchForEach: Processing ${array.length} items in parallel`,
    );

    return array;
  }

  async exec(item: unknown): Promise<FunctionResult> {
    const shared = this._shared!;

    // Check for mock value
    const mockValue = shared.mockValues?.get(this.nodeConfig.id);
    if (mockValue?.enabled) {
      // Simulate delay if specified
      if (mockValue.delay && mockValue.delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, mockValue.delay));
      }

      shared.logs.push(
        `[${this.nodeConfig.id}] [MOCK] Using mocked value for item`,
      );
      console.log(`[${this.nodeConfig.id}] [MOCK] Using mocked value for item`);

      return {
        output: mockValue.output,
        success: mockValue.success,
        action: mockValue.action,
        error: mockValue.success ? undefined : "Mocked failure",
      };
    }

    // For batchForEach, get the processor function from params
    const processorFunction = this.nodeConfig.params
      ?.processorFunction as string;
    const processorParams =
      (this.nodeConfig.params?.processorParams as Record<string, unknown>) ??
      {};

    const fn = registry.getExecutable(processorFunction);

    if (!fn) {
      return {
        output: null,
        success: false,
        error: `Processor function "${processorFunction}" is not registered`,
      };
    }

    // Merge environments: flow envs < node envs
    const env = {
      ...this.flowEnvs,
      ...this.nodeConfig.envs,
    };

    // Create a temporary store for this item processing
    const itemStore = new Map(shared.data);

    // Set the current item in the store
    itemStore.set("currentItem", item);

    const context: ExecutionContext = {
      nodeId: this.nodeConfig.id,
      store: itemStore,
      env,
      log: (message: string) => {
        shared.logs.push(`[${this.nodeConfig.id}] ${message}`);
        console.log(`[${this.nodeConfig.id}] ${message}`);
      },
    };

    // Merge processor params with item-specific params
    const mergedParams = {
      ...processorParams,
      currentItem: item,
    };

    try {
      return await fn(mergedParams, context);
    } catch (e) {
      const error = e instanceof Error ? e.message : "Unknown error";
      return {
        output: null,
        success: false,
        error,
      };
    }
  }

  async post(
    shared: CompiledStore,
    _prepRes: unknown[],
    execRes: FunctionResult[],
  ): Promise<string | undefined> {
    const nodeId = this.nodeConfig.id;

    // Store batch results
    shared.nodeResults.set(nodeId, {
      output: execRes.map((r) => r.output),
      success: execRes.every((r) => r.success),
      action: "complete",
    });

    // Store individual results in the output key
    const outputKey =
      (this.nodeConfig.params?.outputKey as string) ?? "batchResults";
    const results = execRes.map((r) => r.output);
    shared.data.set(outputKey, results);

    // Call debug callback for node complete
    shared.debugCallbacks?.onNodeComplete?.(
      nodeId,
      execRes.every((r) => r.success),
      results,
    );

    // Log execution
    const successCount = execRes.filter((r) => r.success).length;
    const totalCount = execRes.length;
    const status = execRes.every((r) => r.success) ? "✓" : "✗";
    shared.logs.push(
      `[${status}] ${nodeId}: Processed ${successCount}/${totalCount} items`,
    );

    // Handle errors
    const failedResults = execRes.filter((r) => !r.success);
    if (failedResults.length > 0) {
      const errorMsg = `Failed to process ${failedResults.length} items`;
      shared.lastError = { nodeId, error: errorMsg };
    }

    // Enforce memory limits after each node execution
    enforceMemoryLimits(shared);

    // Return action for edge routing
    return execRes.every((r) => r.success) ? "default" : "error";
  }
}

// ============================================================================
// Compiler
// ============================================================================

export interface CompilationResult {
  /** Whether compilation succeeded */
  success: boolean;
  /** The compiled PocketFlow Flow (if successful) */
  flow?: Flow<CompiledStore>;
  /** The start node ID */
  startNodeId?: string;
  /** Validation result */
  validation: ValidationResult;
  /** Compilation errors */
  errors: string[];
  /** Warnings */
  warnings: string[];
}

/**
 * Compile a workflow definition into a PocketFlow Flow
 */
export function compileWorkflow(
  workflow: WorkflowDefinition,
  options: {
    /** Skip registry validation (useful for partial compilation) */
    skipRegistryValidation?: boolean;
    /** Global environment variables */
    globalEnvs?: Record<string, string>;
  } = {},
): CompilationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate workflow
  const registeredFunctions = options.skipRegistryValidation
    ? undefined
    : registry.getIds();

  const validation = validateWorkflow(workflow, registeredFunctions);

  // Add validation errors/warnings
  for (const err of validation.errors) {
    errors.push(`${err.path}: ${err.message}`);
  }
  for (const warn of validation.warnings) {
    warnings.push(`${warn.path}: ${warn.message}`);
  }

  // Check if we can proceed
  if (!validation.valid) {
    return {
      success: false,
      validation,
      errors,
      warnings,
    };
  }

  // Merge global and flow-level environment variables
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

  // Identify sub-node edges (edgeType === "subnode")
  const subNodeEdges = workflow.edges.filter((e) => e.edgeType === "subnode");
  const subNodeEdgesByParent = new Map<string, WorkflowEdge[]>();
  for (const edge of subNodeEdges) {
    const edges = subNodeEdgesByParent.get(edge.from) ?? [];
    edges.push(edge);
    subNodeEdgesByParent.set(edge.from, edges);
  }

  // Build node map - use ClusterRootNode for cluster roots, TinyFlowBatchNode for forEach, skip sub-nodes
  const nodeMap = new Map<
    string,
    TinyFlowNode | ClusterRootNode | TinyFlowBatchNode
  >();

  for (const nodeDef of workflow.nodes) {
    // Skip sub-nodes - they'll be handled by their parent cluster root
    if (subNodes.has(nodeDef.id)) {
      continue;
    }

    if (clusterRoots.has(nodeDef.id)) {
      // Create a ClusterRootNode
      const clusterNode = new ClusterRootNode(nodeDef, flowEnvs);
      const childConfigs = subNodesByParent.get(nodeDef.id) ?? [];
      const childEdges = subNodeEdgesByParent.get(nodeDef.id) ?? [];
      clusterNode.setSubNodes(childConfigs, childEdges);
      nodeMap.set(nodeDef.id, clusterNode);
    } else if (nodeDef.functionId === "control.batchForEach") {
      // Create a TinyFlowBatchNode for batchForEach functions
      const node = new TinyFlowBatchNode(nodeDef, flowEnvs);
      nodeMap.set(nodeDef.id, node);
    } else {
      // Regular node
      const node = new TinyFlowNode(nodeDef, flowEnvs);
      nodeMap.set(nodeDef.id, node);
    }
  }

  // Connect nodes based on edges (skip sub-node edges)
  for (const edge of workflow.edges) {
    // Skip sub-node edges - they're handled internally by ClusterRootNode
    if (edge.edgeType === "subnode") {
      continue;
    }

    // Skip edges FROM sub-nodes - they don't connect in the main flow
    // (sub-node results are aggregated by the cluster root)
    if (subNodes.has(edge.from)) {
      continue;
    }

    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);

    if (!fromNode || !toNode) {
      errors.push(`Invalid edge: ${edge.from} -> ${edge.to}`);
      continue;
    }

    // Use PocketFlow's on() method to connect by action
    fromNode.on(edge.action, toNode);
  }

  // Get start node
  const startNode = nodeMap.get(workflow.flow.startNodeId);
  if (!startNode) {
    errors.push(`Start node "${workflow.flow.startNodeId}" not found`);
    return {
      success: false,
      validation,
      errors,
      warnings,
    };
  }

  // Create the Flow
  const flow = new Flow<CompiledStore>(startNode);

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
  options: Parameters<typeof compileWorkflow>[1] = {},
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

/**
 * Create an initial CompiledStore for execution
 */
export function createStore(
  initialData: Record<string, unknown> = {},
  env: Record<string, string> = {},
  mockValues?: Map<string, MockValue>,
  debugCallbacks?: DebugCallbacks,
  memoryLimits?: MemoryLimits,
): CompiledStore {
  return {
    data: new Map(Object.entries(initialData)),
    logs: [],
    env,
    nodeResults: new Map(),
    mockValues,
    debugCallbacks,
    memoryLimits: memoryLimits ?? {
      maxLogs: 1000,
      maxNodeResults: 1000,
      maxDataSize: 10 * 1024 * 1024, // 10MB
    },
  };
}
