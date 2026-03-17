// Runtime Module — stub, pending Flowneer integration

import type { WorkflowDefinition } from "../schema/types";

// ============================================================================
// Execution Types
// ============================================================================

export interface ExecutionOptions {
  initialData?: Record<string, unknown>;
  env?: Record<string, string>;
  onLog?: (message: string) => void;
  onBeforeNode?: (nodeId: string) => void | Promise<void>;
  onNodeStart?: (nodeId: string, params: Record<string, unknown>) => void;
  onNodeComplete?: (nodeId: string, success: boolean, output: unknown) => void;
  onError?: (nodeId: string, error: string) => void;
  profiling?: boolean;
  onNodeProfile?: (nodeId: string, profile: Record<string, unknown>) => void;
}

export interface ExecutionResult {
  success: boolean;
  store: Record<string, unknown>;
  logs: string[];
  error?: { nodeId: string; message: string };
  duration: number;
}

// ============================================================================
// Runtime Class — pending Flowneer integration
// ============================================================================

export class Runtime {
  constructor(_globalEnvs: Record<string, string> = {}) {}

  load(_workflow: WorkflowDefinition): { success: boolean; errors: string[] } {
    throw new Error(
      "Runtime not yet implemented (pending Flowneer integration)",
    );
  }

  loadFromJson(_json: string): { success: boolean; errors: string[] } {
    throw new Error(
      "Runtime not yet implemented (pending Flowneer integration)",
    );
  }

  isReady(): boolean {
    return false;
  }

  async execute(_options: ExecutionOptions = {}): Promise<ExecutionResult> {
    throw new Error(
      "Runtime not yet implemented (pending Flowneer integration)",
    );
  }

  static async run(
    _workflow: WorkflowDefinition,
    _options: ExecutionOptions = {},
  ): Promise<ExecutionResult> {
    throw new Error(
      "Runtime not yet implemented (pending Flowneer integration)",
    );
  }

  static async runFromJson(
    _json: string,
    _options: ExecutionOptions = {},
  ): Promise<ExecutionResult> {
    throw new Error(
      "Runtime not yet implemented (pending Flowneer integration)",
    );
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

export async function runWorkflow(
  workflow: WorkflowDefinition,
  options: ExecutionOptions = {},
): Promise<ExecutionResult> {
  return Runtime.run(workflow, options);
}

export async function runWorkflowFromJson(
  json: string,
  options: ExecutionOptions = {},
): Promise<ExecutionResult> {
  return Runtime.runFromJson(json, options);
}
