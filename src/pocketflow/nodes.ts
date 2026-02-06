/**
 * TinyFlow Node Types
 *
 * Thin wrappers over PocketFlow node classes that:
 * 1. Execute registry functions
 * 2. Handle the prep → exec → post lifecycle
 * 3. Route to next node via actions
 *
 * Each node type maps 1:1 to a PocketFlow primitive:
 * - TinyFlowNode → Node (single step with retry)
 * - TinyFlowBatchNode → BatchNode (sequential batch)
 * - TinyFlowParallelNode → ParallelBatchNode (parallel batch)
 */

import {
  Node,
  BatchNode,
  ParallelBatchNode,
  Flow,
  ParallelBatchFlow,
} from "pocketflow";
import type { WorkflowNode, WorkflowEdge } from "../schema/types";
import {
  registry,
  type ExecutionContext,
  type FunctionResult,
} from "../registry";
import { type SharedStore, enforceMemoryLimits, log } from "./shared";

// ============================================================================
// TinyFlowNode - Maps to PocketFlow Node
// Single step execution with retry logic
// ============================================================================

export class TinyFlowNode extends Node<SharedStore> {
  private _shared: SharedStore | null = null;

  constructor(
    private nodeConfig: WorkflowNode,
    private flowEnvs: Record<string, string> = {},
  ) {
    super(
      nodeConfig.runtime?.maxRetries ?? 1,
      (nodeConfig.runtime?.retryDelay ?? 0) / 1000,
    );
  }

  getConfig(): WorkflowNode {
    return this.nodeConfig;
  }

  async prep(shared: SharedStore): Promise<WorkflowNode> {
    this._shared = shared;
    await shared.debugCallbacks?.onBeforeNode?.(this.nodeConfig.id);
    shared.debugCallbacks?.onNodeStart?.(
      this.nodeConfig.id,
      this.nodeConfig.params as Record<string, unknown>,
    );
    return this.nodeConfig;
  }

  async exec(config: WorkflowNode): Promise<FunctionResult> {
    const shared = this._shared!;

    // Check for mock value
    const mockValue = shared.mockValues?.get(config.id);
    if (mockValue?.enabled) {
      if (mockValue.delay) {
        await new Promise((r) => setTimeout(r, mockValue.delay));
      }
      log(shared, config.id, "[MOCK] Using mocked value");
      return {
        output: mockValue.output,
        success: mockValue.success,
        action: mockValue.action,
        error: mockValue.success ? undefined : "Mocked failure",
      };
    }

    // Get the registry function
    const fn = registry.getExecutable(config.functionId);
    if (!fn) {
      return {
        output: null,
        success: false,
        error: `Function "${config.functionId}" not registered`,
      };
    }

    // Build execution context
    const context: ExecutionContext = {
      nodeId: config.id,
      store: shared.data,
      env: { ...this.flowEnvs, ...config.envs },
      log: (msg) => log(shared, config.id, msg),
    };

    try {
      return await fn(config.params, context);
    } catch (e) {
      return {
        output: null,
        success: false,
        error: e instanceof Error ? e.message : "Unknown error",
      };
    }
  }

  async post(
    shared: SharedStore,
    _prepRes: WorkflowNode,
    execRes: FunctionResult,
  ): Promise<string | undefined> {
    const nodeId = this.nodeConfig.id;

    // Store result
    shared.nodeResults.set(nodeId, execRes);

    // Debug callback
    shared.debugCallbacks?.onNodeComplete?.(
      nodeId,
      execRes.success,
      execRes.output,
    );

    // Log
    const status = execRes.success ? "✓" : "✗";
    shared.logs.push(
      `[${status}] ${nodeId}: ${execRes.success ? "completed" : execRes.error}`,
    );

    // Track errors
    if (!execRes.success) {
      shared.lastError = { nodeId, error: execRes.error ?? "Unknown error" };
    }

    // Enforce limits
    enforceMemoryLimits(shared);

    // Return action for edge routing
    return execRes.action ?? (execRes.success ? "default" : "error");
  }
}

// ============================================================================
// TinyFlowBatchNode - Maps to PocketFlow BatchNode
// Sequential processing of array items
// ============================================================================

export class TinyFlowBatchNode extends BatchNode<SharedStore> {
  private _shared: SharedStore | null = null;

  constructor(
    private nodeConfig: WorkflowNode,
    private flowEnvs: Record<string, string> = {},
  ) {
    super(
      nodeConfig.runtime?.maxRetries ?? 1,
      (nodeConfig.runtime?.retryDelay ?? 0) / 1000,
    );
  }

  async prep(shared: SharedStore): Promise<unknown[]> {
    this._shared = shared;
    await shared.debugCallbacks?.onBeforeNode?.(this.nodeConfig.id);
    shared.debugCallbacks?.onNodeStart?.(
      this.nodeConfig.id,
      this.nodeConfig.params as Record<string, unknown>,
    );

    const array = this.nodeConfig.params?.array as unknown[];
    if (!Array.isArray(array)) {
      throw new Error(`BatchNode: Expected array, got ${typeof array}`);
    }

    log(
      shared,
      this.nodeConfig.id,
      `Processing ${array.length} items sequentially`,
    );
    return array;
  }

  async exec(item: unknown): Promise<FunctionResult> {
    const shared = this._shared!;
    const processorId = this.nodeConfig.params?.processorFunction as string;

    const fn = registry.getExecutable(processorId);
    if (!fn) {
      return {
        output: null,
        success: false,
        error: `Processor "${processorId}" not found`,
      };
    }

    const context: ExecutionContext = {
      nodeId: this.nodeConfig.id,
      store: shared.data,
      env: { ...this.flowEnvs, ...this.nodeConfig.envs },
      log: (msg) => log(shared, this.nodeConfig.id, msg),
    };

    try {
      return await fn(
        {
          ...(this.nodeConfig.params?.processorParams as object),
          currentItem: item,
        },
        context,
      );
    } catch (e) {
      return {
        output: null,
        success: false,
        error: e instanceof Error ? e.message : "Unknown error",
      };
    }
  }

  async post(
    shared: SharedStore,
    _prepRes: unknown[],
    execRes: FunctionResult[],
  ): Promise<string | undefined> {
    const nodeId = this.nodeConfig.id;
    const outputKey =
      (this.nodeConfig.params?.outputKey as string) ?? "batchResults";
    const results = execRes.map((r) => r.output);

    shared.data.set(outputKey, results);
    shared.nodeResults.set(nodeId, {
      output: results,
      success: execRes.every((r) => r.success),
    });

    shared.debugCallbacks?.onNodeComplete?.(
      nodeId,
      execRes.every((r) => r.success),
      results,
    );

    const successCount = execRes.filter((r) => r.success).length;
    shared.logs.push(
      `[✓] ${nodeId}: Processed ${successCount}/${execRes.length} items`,
    );

    enforceMemoryLimits(shared);
    return execRes.every((r) => r.success) ? "default" : "error";
  }
}

// ============================================================================
// TinyFlowParallelNode - Maps to PocketFlow ParallelBatchNode
// Parallel processing of array items (I/O-bound)
// ============================================================================

export class TinyFlowParallelNode extends ParallelBatchNode<SharedStore> {
  private _shared: SharedStore | null = null;

  constructor(
    private nodeConfig: WorkflowNode,
    private flowEnvs: Record<string, string> = {},
  ) {
    super(
      nodeConfig.runtime?.maxRetries ?? 1,
      (nodeConfig.runtime?.retryDelay ?? 0) / 1000,
    );
  }

  async prep(shared: SharedStore): Promise<unknown[]> {
    this._shared = shared;
    await shared.debugCallbacks?.onBeforeNode?.(this.nodeConfig.id);
    shared.debugCallbacks?.onNodeStart?.(
      this.nodeConfig.id,
      this.nodeConfig.params as Record<string, unknown>,
    );

    const array = this.nodeConfig.params?.array as unknown[];
    if (!Array.isArray(array)) {
      throw new Error(`ParallelNode: Expected array, got ${typeof array}`);
    }

    log(
      shared,
      this.nodeConfig.id,
      `Processing ${array.length} items in parallel`,
    );
    return array;
  }

  async exec(item: unknown): Promise<FunctionResult> {
    const shared = this._shared!;
    const processorId = this.nodeConfig.params?.processorFunction as string;

    const fn = registry.getExecutable(processorId);
    if (!fn) {
      return {
        output: null,
        success: false,
        error: `Processor "${processorId}" not found`,
      };
    }

    const context: ExecutionContext = {
      nodeId: this.nodeConfig.id,
      store: shared.data,
      env: { ...this.flowEnvs, ...this.nodeConfig.envs },
      log: (msg) => log(shared, this.nodeConfig.id, msg),
    };

    try {
      return await fn(
        {
          ...(this.nodeConfig.params?.processorParams as object),
          currentItem: item,
        },
        context,
      );
    } catch (e) {
      return {
        output: null,
        success: false,
        error: e instanceof Error ? e.message : "Unknown error",
      };
    }
  }

  async post(
    shared: SharedStore,
    _prepRes: unknown[],
    execRes: FunctionResult[],
  ): Promise<string | undefined> {
    const nodeId = this.nodeConfig.id;
    const outputKey =
      (this.nodeConfig.params?.outputKey as string) ?? "parallelResults";
    const results = execRes.map((r) => r.output);

    shared.data.set(outputKey, results);
    shared.nodeResults.set(nodeId, {
      output: results,
      success: execRes.every((r) => r.success),
    });

    shared.debugCallbacks?.onNodeComplete?.(
      nodeId,
      execRes.every((r) => r.success),
      results,
    );

    const successCount = execRes.filter((r) => r.success).length;
    shared.logs.push(
      `[✓] ${nodeId}: Processed ${successCount}/${execRes.length} items in parallel`,
    );

    enforceMemoryLimits(shared);
    return execRes.every((r) => r.success) ? "default" : "error";
  }
}

// ============================================================================
// TinyFlowCluster - Maps to PocketFlow ParallelBatchFlow
// Executes multiple sub-nodes in parallel as a single step
// ============================================================================

export class TinyFlowCluster extends ParallelBatchFlow<SharedStore> {
  private nodeConfig: WorkflowNode;
  private flowEnvs: Record<string, string>;
  private subNodeConfigs: WorkflowNode[] = [];

  constructor(
    nodeConfig: WorkflowNode,
    flowEnvs: Record<string, string> = {},
    startNode: TinyFlowNode,
  ) {
    super(startNode);
    this.nodeConfig = nodeConfig;
    this.flowEnvs = flowEnvs;
  }

  setSubNodes(configs: WorkflowNode[]): void {
    this.subNodeConfigs = configs;
  }

  async prep(shared: SharedStore): Promise<Array<Record<string, unknown>>> {
    await shared.debugCallbacks?.onBeforeNode?.(this.nodeConfig.id);
    shared.debugCallbacks?.onNodeStart?.(
      this.nodeConfig.id,
      this.nodeConfig.params as Record<string, unknown>,
    );

    log(
      shared,
      this.nodeConfig.id,
      `Executing ${this.subNodeConfigs.length} sub-nodes in parallel`,
    );

    // Return params for each sub-node execution
    return this.subNodeConfigs.map((config) => ({
      subNodeId: config.id,
      subNodeConfig: config,
    }));
  }

  async post(
    shared: SharedStore,
    _prepRes: Array<Record<string, unknown>>,
    _execRes: undefined,
  ): Promise<string | undefined> {
    const nodeId = this.nodeConfig.id;

    shared.debugCallbacks?.onNodeComplete?.(nodeId, true, null);
    shared.logs.push(`[✓] ${nodeId}: Cluster completed`);

    enforceMemoryLimits(shared);
    return "default";
  }
}

// ============================================================================
// Factory functions for creating nodes from workflow definitions
// ============================================================================

export type AnyTinyFlowNode =
  | TinyFlowNode
  | TinyFlowBatchNode
  | TinyFlowParallelNode
  | TinyFlowCluster;

/**
 * Create the appropriate node type based on function ID and node type
 */
export function createNode(
  nodeDef: WorkflowNode,
  flowEnvs: Record<string, string> = {},
): AnyTinyFlowNode {
  // Batch processing nodes
  if (nodeDef.functionId === "control.batch") {
    return new TinyFlowBatchNode(nodeDef, flowEnvs);
  }

  if (
    nodeDef.functionId === "control.parallel" ||
    nodeDef.functionId === "control.batchForEach"
  ) {
    return new TinyFlowParallelNode(nodeDef, flowEnvs);
  }

  // Regular node
  return new TinyFlowNode(nodeDef, flowEnvs);
}

/**
 * Create a cluster node for parallel sub-node execution
 */
export function createCluster(
  nodeDef: WorkflowNode,
  subNodes: WorkflowNode[],
  flowEnvs: Record<string, string> = {},
): TinyFlowCluster {
  // Create a dummy start node for the flow
  const dummyNode = new TinyFlowNode(nodeDef, flowEnvs);
  const cluster = new TinyFlowCluster(nodeDef, flowEnvs, dummyNode);
  cluster.setSubNodes(subNodes);
  return cluster;
}
