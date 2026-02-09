/**
 * TinyFlow Runtime
 * Thin wrapper around PocketFlow for executing compiled flows
 */

import type { Flow } from "pocketflow";
import type { WorkflowDefinition } from "../schema/types";
import {
  compileWorkflow,
  compileWorkflowFromJson,
  createStore,
  type CompiledStore,
  type CompilationResult,
  type MockValue,
  type DebugCallbacks,
  type NodeProfile,
} from "../compiler";

// Re-export MockValue and NodeProfile for convenience
export type { MockValue, NodeProfile } from "../compiler";

// ============================================================================
// Execution Types
// ============================================================================

export interface ExecutionOptions {
  /** Initial data to populate the store */
  initialData?: Record<string, unknown>;
  /** Environment variables */
  env?: Record<string, string>;
  /** Callback for log messages */
  onLog?: (message: string) => void;
  /** Callback before a node starts (can return a promise for step-by-step) */
  onBeforeNode?: (nodeId: string) => void | Promise<void>;
  /** Callback when a node starts execution */
  onNodeStart?: (nodeId: string, params: Record<string, unknown>) => void;
  /** Callback when a node completes */
  onNodeComplete?: (nodeId: string, success: boolean, output: unknown) => void;
  /** Callback for errors */
  onError?: (nodeId: string, error: string) => void;
  /** Mock values for testing - map of nodeId to mock result */
  mockValues?: Map<string, MockValue>;
  /** Memory limits for execution */
  memoryLimits?: import("../compiler").MemoryLimits;
  /** Enable per-node performance profiling (time, memory, CPU) */
  profiling?: boolean;
  /** Callback with per-node performance profile (only when profiling is enabled) */
  onNodeProfile?: (nodeId: string, profile: NodeProfile) => void;
}

export interface ExecutionResult {
  /** Whether execution completed successfully */
  success: boolean;
  /** Final store state */
  store: CompiledStore;
  /** All logs from execution */
  logs: string[];
  /** Error information if failed */
  error?: {
    nodeId: string;
    message: string;
  };
  /** Duration in milliseconds */
  duration: number;
}

// ============================================================================
// Runtime Class
// ============================================================================

export class Runtime {
  private compiledFlow: Flow<CompiledStore> | null = null;
  private compilation: CompilationResult | null = null;
  private globalEnvs: Record<string, string> = {};

  constructor(globalEnvs: Record<string, string> = {}) {
    this.globalEnvs = globalEnvs;
  }

  /**
   * Load a workflow definition
   */
  load(workflow: WorkflowDefinition): CompilationResult {
    this.compilation = compileWorkflow(workflow, {
      globalEnvs: this.globalEnvs,
    });

    if (this.compilation.success && this.compilation.flow) {
      this.compiledFlow = this.compilation.flow;
    }

    return this.compilation;
  }

  /**
   * Load workflow from JSON string
   */
  loadFromJson(json: string): CompilationResult {
    this.compilation = compileWorkflowFromJson(json, {
      globalEnvs: this.globalEnvs,
    });

    if (this.compilation.success && this.compilation.flow) {
      this.compiledFlow = this.compilation.flow;
    }

    return this.compilation;
  }

  /**
   * Check if runtime has a valid compiled flow
   */
  isReady(): boolean {
    return this.compiledFlow !== null;
  }

  /**
   * Get compilation result
   */
  getCompilationResult(): CompilationResult | null {
    return this.compilation;
  }

  /**
   * Execute the loaded workflow
   */
  async execute(options: ExecutionOptions = {}): Promise<ExecutionResult> {
    if (!this.compiledFlow) {
      return {
        success: false,
        store: createStore({}, {}, undefined, undefined, options.memoryLimits),
        logs: ["No workflow loaded"],
        error: { nodeId: "", message: "No workflow loaded" },
        duration: 0,
      };
    }

    const startTime = performance.now();

    // Per-node profiling state (only allocated when profiling is enabled)
    const profilingSnapshots = options.profiling
      ? new Map<
          string,
          {
            t0: number;
            heap0: number;
            rss0: number;
            cpu0: { user: number; system: number };
          }
        >()
      : null;

    // Wrap onNodeStart to capture pre-execution metrics
    const wrappedOnNodeStart = (
      nodeId: string,
      params: Record<string, unknown>,
    ) => {
      if (profilingSnapshots) {
        const mem = process.memoryUsage();
        profilingSnapshots.set(nodeId, {
          t0: performance.now(),
          heap0: mem.heapUsed,
          rss0: mem.rss,
          cpu0: process.cpuUsage(),
        });
      }
      options.onNodeStart?.(nodeId, params);
    };

    // Wrap onNodeComplete to capture post-execution metrics and emit profile
    const wrappedOnNodeComplete = (
      nodeId: string,
      success: boolean,
      output: unknown,
    ) => {
      if (profilingSnapshots) {
        const snap = profilingSnapshots.get(nodeId);
        if (snap) {
          const t1 = performance.now();
          const mem = process.memoryUsage();
          const cpu1 = process.cpuUsage();
          const durationMs = t1 - snap.t0;
          const cpuUserUs = cpu1.user - snap.cpu0.user;
          const cpuSystemUs = cpu1.system - snap.cpu0.system;
          const cpuTimeMs = (cpuUserUs + cpuSystemUs) / 1000;
          const cpuPercent =
            durationMs > 0 ? (cpuTimeMs / durationMs) * 100 : 0;

          const profile: NodeProfile = {
            nodeId,
            durationMs,
            heapUsedBefore: snap.heap0,
            heapUsedAfter: mem.heapUsed,
            heapDelta: mem.heapUsed - snap.heap0,
            rssBefore: snap.rss0,
            rssAfter: mem.rss,
            cpuUserUs,
            cpuSystemUs,
            cpuPercent: Math.round(cpuPercent * 100) / 100,
            timestamp: Date.now(),
          };

          profilingSnapshots.delete(nodeId);
          options.onNodeProfile?.(nodeId, profile);
        }
      }
      options.onNodeComplete?.(nodeId, success, output);
    };

    // Set up debug callbacks
    const debugCallbacks: DebugCallbacks = {
      onBeforeNode: options.onBeforeNode,
      onNodeStart: wrappedOnNodeStart,
      onNodeComplete: wrappedOnNodeComplete,
      onNodeProfile: options.onNodeProfile,
    };

    // Create store with initial data, environment, mock values, and debug callbacks
    const store = createStore(
      options.initialData,
      {
        ...this.globalEnvs,
        ...options.env,
      },
      options.mockValues,
      debugCallbacks,
      options.memoryLimits,
    );

    // Set up logging callback
    if (options.onLog) {
      const originalPush = store.logs.push.bind(store.logs);
      store.logs.push = (...items: string[]) => {
        for (const item of items) {
          options.onLog?.(item);
        }
        return originalPush(...items);
      };
    }

    try {
      // Run the flow
      await this.compiledFlow.run(store);

      const duration = performance.now() - startTime;

      // Check for errors
      if (store.lastError) {
        options.onError?.(store.lastError.nodeId, store.lastError.error);
        return {
          success: false,
          store,
          logs: store.logs,
          error: {
            nodeId: store.lastError.nodeId,
            message: store.lastError.error,
          },
          duration,
        };
      }

      return {
        success: true,
        store,
        logs: store.logs,
        duration,
      };
    } catch (e) {
      const duration = performance.now() - startTime;
      const error = e instanceof Error ? e.message : "Unknown error";

      return {
        success: false,
        store,
        logs: [...store.logs, `Runtime error: ${error}`],
        error: { nodeId: "runtime", message: error },
        duration,
      };
    }
  }

  /**
   * Execute a workflow in one step
   */
  static async run(
    workflow: WorkflowDefinition,
    options: ExecutionOptions = {},
  ): Promise<ExecutionResult> {
    const runtime = new Runtime(options.env);
    const compilation = runtime.load(workflow);

    if (!compilation.success) {
      return {
        success: false,
        store: createStore({}, {}, undefined, undefined, options.memoryLimits),
        logs: compilation.errors,
        error: { nodeId: "", message: compilation.errors.join("; ") },
        duration: 0,
      };
    }

    return runtime.execute(options);
  }

  /**
   * Execute workflow from JSON string in one step
   */
  static async runFromJson(
    json: string,
    options: ExecutionOptions = {},
  ): Promise<ExecutionResult> {
    const runtime = new Runtime(options.env);
    const compilation = runtime.loadFromJson(json);

    if (!compilation.success) {
      return {
        success: false,
        store: createStore({}, {}, undefined, undefined, options.memoryLimits),
        logs: compilation.errors,
        error: { nodeId: "", message: compilation.errors.join("; ") },
        duration: 0,
      };
    }

    return runtime.execute(options);
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Run a workflow definition
 */
export async function runWorkflow(
  workflow: WorkflowDefinition,
  options: ExecutionOptions = {},
): Promise<ExecutionResult> {
  return Runtime.run(workflow, options);
}

/**
 * Run a workflow from JSON string
 */
export async function runWorkflowFromJson(
  json: string,
  options: ExecutionOptions = {},
): Promise<ExecutionResult> {
  return Runtime.runFromJson(json, options);
}
