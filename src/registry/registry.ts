/**
 * Function Registry
 * Source of truth for all executable functions
 */

import type { FunctionMetadata, FunctionParameter } from "../schema/types";

// ============================================================================
// Registry Types
// ============================================================================

/**
 * Execution context passed to every function
 */
export interface ExecutionContext {
  /** Node ID being executed */
  nodeId: string;
  /** Shared state across all nodes */
  store: Map<string, unknown>;
  /** Environment variables */
  env: Record<string, string>;
  /** Logger */
  log: (message: string) => void;
}

/**
 * Result returned by a function
 */
export interface FunctionResult {
  /** Output data to store */
  output: unknown;
  /** Action to determine next edge (default: 'default') */
  action?: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Executable function signature
 */
export type ExecutableFunction = (
  params: Record<string, unknown>,
  context: ExecutionContext,
) => Promise<FunctionResult>;

/**
 * Complete function registration
 */
export interface RegisteredFunction {
  metadata: FunctionMetadata;
  execute: ExecutableFunction;
}

// ============================================================================
// Registry Implementation
// ============================================================================

export class FunctionRegistry {
  private functions = new Map<string, RegisteredFunction>();

  /**
   * Register a new function
   */
  register(fn: RegisteredFunction): void {
    if (this.functions.has(fn.metadata.id)) {
      console.warn(`Function "${fn.metadata.id}" is being overwritten`);
    }
    this.functions.set(fn.metadata.id, fn);
  }

  /**
   * Unregister a function
   */
  unregister(id: string): boolean {
    return this.functions.delete(id);
  }

  /**
   * Get a registered function by ID
   */
  get(id: string): RegisteredFunction | undefined {
    return this.functions.get(id);
  }

  /**
   * Check if a function is registered
   */
  has(id: string): boolean {
    return this.functions.has(id);
  }

  /**
   * Get all registered function IDs
   */
  getIds(): Set<string> {
    return new Set(this.functions.keys());
  }

  /**
   * Get all function metadata (for UI discovery)
   */
  getAllMetadata(): FunctionMetadata[] {
    return Array.from(this.functions.values()).map((fn) => fn.metadata);
  }

  /**
   * Get metadata grouped by category
   */
  getMetadataByCategory(): Map<string, FunctionMetadata[]> {
    const byCategory = new Map<string, FunctionMetadata[]>();
    for (const fn of this.functions.values()) {
      const category = fn.metadata.category;
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }
      byCategory.get(category)!.push(fn.metadata);
    }
    return byCategory;
  }

  /**
   * Get the executable function
   */
  getExecutable(id: string): ExecutableFunction | undefined {
    return this.functions.get(id)?.execute;
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.functions.clear();
  }

  /**
   * Get count of registered functions
   */
  get size(): number {
    return this.functions.size;
  }
}

// Global registry instance
export const registry = new FunctionRegistry();

// ============================================================================
// Registration Helpers
// ============================================================================

/**
 * Helper to create a function registration
 */
export function defineFunction(
  metadata: FunctionMetadata,
  execute: ExecutableFunction,
): RegisteredFunction {
  return { metadata, execute };
}

/**
 * Helper to create function parameters
 */
export function param(
  name: string,
  type: FunctionParameter["type"],
  options: Partial<Omit<FunctionParameter, "name" | "type">> = {},
): FunctionParameter {
  return {
    name,
    type,
    required: options.required ?? true,
    default: options.default,
    description: options.description,
  };
}

/**
 * Quick registration helper
 */
export function registerFunction(
  metadata: FunctionMetadata,
  execute: ExecutableFunction,
): void {
  registry.register(defineFunction(metadata, execute));
}
