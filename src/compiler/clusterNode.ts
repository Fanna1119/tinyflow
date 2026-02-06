/**
 * ClusterRootNode
 * A special PocketFlow node that executes all sub-nodes in parallel
 * before continuing to the next node in the flow.
 */

import { Node } from "pocketflow";
import type { WorkflowNode, WorkflowEdge } from "../schema/types";
import {
  registry,
  type ExecutionContext,
  type FunctionResult,
} from "../registry";
import type { CompiledStore } from "./compiler";

/**
 * Simple concurrency limiter for controlling parallel execution
 */
class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrency: number = 10) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.maxConcurrency) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }

    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      if (this.queue.length > 0) {
        const next = this.queue.shift()!;
        next();
      }
    }
  }
}

/**
 * ClusterRootNode executes its own function, then runs all attached
 * sub-nodes in parallel using Promise.all(). After all sub-nodes complete,
 * execution continues to the next node via the "default" action.
 *
 * Sub-node outputs are stored in:
 * - `nodeResults` map (keyed by sub-node ID)
 * - `_clusterOutputs.<clusterId>` in the data store (combined object)
 */
export class ClusterRootNode extends Node<CompiledStore> {
  private _shared: CompiledStore | null = null;
  private subNodeConfigs: WorkflowNode[] = [];
  private subNodeEdges: WorkflowEdge[] = [];

  constructor(
    private nodeConfig: WorkflowNode,
    private flowEnvs: Record<string, string> = {},
  ) {
    super(
      nodeConfig.runtime?.maxRetries ?? 1,
      (nodeConfig.runtime?.retryDelay ?? 0) / 1000,
    );
  }

  /**
   * Get the node configuration
   */
  getConfig(): WorkflowNode {
    return this.nodeConfig;
  }

  /**
   * Get the sub-node configurations
   */
  getSubNodes(): WorkflowNode[] {
    return this.subNodeConfigs;
  }

  /**
   * Set the sub-nodes that should execute in parallel
   */
  setSubNodes(configs: WorkflowNode[], edges: WorkflowEdge[]): void {
    this.subNodeConfigs = configs;
    this.subNodeEdges = edges;
  }

  async prep(shared: CompiledStore): Promise<WorkflowNode> {
    this._shared = shared;
    await shared.debugCallbacks?.onBeforeNode?.(this.nodeConfig.id);
    const params = this.nodeConfig.params as Record<string, unknown>;
    shared.debugCallbacks?.onNodeStart?.(this.nodeConfig.id, params);
    return this.nodeConfig;
  }

  async exec(config: WorkflowNode): Promise<FunctionResult> {
    const shared = this._shared!;

    // First, execute the cluster root node's function
    const rootResult = await this.executeNode(config, shared);

    // Store root result
    shared.nodeResults.set(config.id, rootResult);

    // If root failed, don't execute sub-nodes
    if (!rootResult.success) {
      return rootResult;
    }

    // Execute all sub-nodes in parallel with concurrency limit
    if (this.subNodeConfigs.length > 0) {
      shared.logs.push(
        `[${config.id}] Executing ${this.subNodeConfigs.length} sub-nodes in parallel (max concurrency: 10)`,
      );
      console.log(
        `[${config.id}] Executing ${this.subNodeConfigs.length} sub-nodes in parallel (max concurrency: 10)`,
      );

      const limiter = new ConcurrencyLimiter(10);
      const subNodeResults = await Promise.all(
        this.subNodeConfigs.map((subConfig) =>
          limiter.run(() => this.executeSubNode(subConfig, shared)),
        ),
      );

      // Check if any sub-nodes failed
      const failures = subNodeResults.filter((r) => !r.result.success);
      if (failures.length > 0) {
        shared.lastError = {
          nodeId: failures[0].nodeId,
          error: failures[0].result.error ?? "Sub-node failed",
        };
      }

      // Store combined sub-node outputs for downstream access
      const combinedOutputs: Record<string, unknown> = {};
      for (const { nodeId, result } of subNodeResults) {
        combinedOutputs[nodeId] = result.output;
      }

      // Store in typed location for downstream nodes
      const clusterOutputs =
        (shared.data.get("_clusterOutputs") as Record<
          string,
          Record<string, unknown>
        >) ?? {};
      clusterOutputs[config.id] = combinedOutputs;
      shared.data.set("_clusterOutputs", clusterOutputs);

      // Also keep legacy key for backwards compatibility
      shared.data.set("_subNodeOutputs", combinedOutputs);
    }

    return rootResult;
  }

  async post(
    shared: CompiledStore,
    _prepRes: WorkflowNode,
    execRes: FunctionResult,
  ): Promise<string | undefined> {
    const nodeId = this.nodeConfig.id;

    // Call debug callback for cluster root complete
    shared.debugCallbacks?.onNodeComplete?.(
      nodeId,
      execRes.success,
      execRes.output,
    );

    // Log execution
    const status = execRes.success ? "✓" : "✗";
    shared.logs.push(
      `[${status}] ${nodeId}: ${execRes.success ? "completed (with sub-nodes)" : execRes.error}`,
    );

    // Handle errors
    if (!execRes.success) {
      shared.lastError = { nodeId, error: execRes.error ?? "Unknown error" };
    }

    // Return action for edge routing - goes to the next non-sub-node
    return execRes.action ?? (execRes.success ? "default" : "error");
  }

  /**
   * Execute a single node (root or sub-node)
   */
  private async executeNode(
    config: WorkflowNode,
    shared: CompiledStore,
  ): Promise<FunctionResult> {
    const mockValue = shared.mockValues?.get(config.id);

    if (mockValue?.enabled) {
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

    const env = { ...this.flowEnvs, ...config.envs };
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
      return { output: null, success: false, error };
    }
  }

  /**
   * Execute a sub-node with debug callbacks
   */
  private async executeSubNode(
    subConfig: WorkflowNode,
    shared: CompiledStore,
  ): Promise<{ nodeId: string; result: FunctionResult }> {
    // Call debug callbacks for sub-node
    await shared.debugCallbacks?.onBeforeNode?.(subConfig.id);
    shared.debugCallbacks?.onNodeStart?.(
      subConfig.id,
      subConfig.params as Record<string, unknown>,
    );

    const result = await this.executeNode(subConfig, shared);

    // Store sub-node result
    shared.nodeResults.set(subConfig.id, result);

    // Call debug callback for sub-node complete
    shared.debugCallbacks?.onNodeComplete?.(
      subConfig.id,
      result.success,
      result.output,
    );

    // Log sub-node execution
    const status = result.success ? "✓" : "✗";
    shared.logs.push(
      `[${status}] ${subConfig.id}: ${result.success ? "completed" : result.error}`,
    );

    return { nodeId: subConfig.id, result };
  }
}

/**
 * Helper to get cluster outputs from the store
 */
export function getClusterOutputs(
  store: CompiledStore,
  clusterId: string,
): Record<string, unknown> | undefined {
  const clusterOutputs = store.data.get("_clusterOutputs") as
    | Record<string, Record<string, unknown>>
    | undefined;
  return clusterOutputs?.[clusterId];
}

/**
 * Helper to get all cluster outputs from the store
 */
export function getAllClusterOutputs(
  store: CompiledStore,
): Record<string, Record<string, unknown>> {
  return (
    (store.data.get("_clusterOutputs") as Record<
      string,
      Record<string, unknown>
    >) ?? {}
  );
}
