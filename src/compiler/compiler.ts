/**
 * TinyFlow Compiler
 * Transforms workflow JSON + registry into executable PocketFlow Flow
 */

import { Node, Flow } from "pocketflow";
import type {
  WorkflowDefinition,
  WorkflowNode,
  ValidationResult,
} from "../schema/types";
import { validateWorkflow } from "../schema/validator";
import {
  registry,
  type ExecutionContext,
  type FunctionResult,
} from "../registry";

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

    // Return action for edge routing
    return execRes.action ?? (execRes.success ? "default" : "error");
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

  // Build node map
  const nodeMap = new Map<string, TinyFlowNode>();

  for (const nodeDef of workflow.nodes) {
    const node = new TinyFlowNode(nodeDef, flowEnvs);
    nodeMap.set(nodeDef.id, node);
  }

  // Connect nodes based on edges
  for (const edge of workflow.edges) {
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
): CompiledStore {
  return {
    data: new Map(Object.entries(initialData)),
    logs: [],
    env,
    nodeResults: new Map(),
    mockValues,
    debugCallbacks,
  };
}
