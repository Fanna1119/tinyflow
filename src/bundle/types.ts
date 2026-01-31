/**
 * Bundle Types
 */

import type { WorkflowDefinition } from "../schema/types";

/**
 * Options for building a bundle
 */
export interface BundleOptions {
  /** The workflow to bundle */
  workflow: WorkflowDefinition;
  /** Default environment variables embedded in bundle */
  defaultEnv?: Record<string, string>;
  /** Include TinyFlow runtime (default: true for standalone bundles) */
  includeRuntime?: boolean;
  /** Minify the output (default: false) */
  minify?: boolean;
  /** Output format */
  format?: "esm" | "cjs" | "iife";
  /** Global variable name for IIFE format */
  globalName?: string;
}

/**
 * Result of building a bundle
 */
export interface BundleResult {
  /** Whether the build was successful */
  success: boolean;
  /** The generated code */
  code?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Runtime API exposed by the generated bundle
 */
export interface BundleRuntimeAPI {
  /**
   * Run the embedded workflow
   * @param options Execution options
   * @returns Execution result
   */
  runFlow: (options?: BundleExecutionOptions) => Promise<BundleExecutionResult>;

  /**
   * Set environment variable(s) for subsequent runs
   * @param key Environment variable name or object of key-value pairs
   * @param value Environment variable value (when key is string)
   */
  setEnv: (key: string | Record<string, string>, value?: string) => void;

  /**
   * Get current environment variables
   * @returns Current environment variables
   */
  getEnv: () => Record<string, string>;

  /**
   * Get the embedded workflow definition (readonly)
   * @returns The workflow definition
   */
  getWorkflow: () => WorkflowDefinition;
}

/**
 * Execution options for bundle runFlow
 */
export interface BundleExecutionOptions {
  /** Initial data to populate the store */
  initialData?: Record<string, unknown>;
  /** Override environment variables for this run only */
  env?: Record<string, string>;
  /** Callback for log messages */
  onLog?: (message: string) => void;
  /** Callback when a node completes */
  onNodeComplete?: (nodeId: string, success: boolean, output: unknown) => void;
  /** Callback for errors */
  onError?: (nodeId: string, error: string) => void;
}

/**
 * Execution result from bundle runFlow
 */
export interface BundleExecutionResult {
  /** Whether execution completed successfully */
  success: boolean;
  /** Final store data */
  data: Record<string, unknown>;
  /** All logs from execution */
  logs: string[];
  /** Error information if failed */
  error?: { nodeId: string; message: string };
  /** Execution duration in milliseconds */
  duration: number;
}
