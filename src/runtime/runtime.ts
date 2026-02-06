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
} from "../compiler";

// Re-export MockValue for convenience
export type { MockValue } from "../compiler";

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

    // Set up debug callbacks
    const debugCallbacks: DebugCallbacks = {
      onBeforeNode: options.onBeforeNode,
      onNodeStart: options.onNodeStart,
      onNodeComplete: options.onNodeComplete,
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
