/**
 * Testing Harness
 * Utilities for testing TinyFlow workflows
 */

import type { WorkflowDefinition } from "../schema/types";
import { Runtime, type ExecutionOptions } from "../runtime/runtime";
import { registry } from "../registry";
import type { FunctionResult, ExecutionContext } from "../registry/registry";
import type { MockValue } from "../compiler";

// ============================================================================
// Deep Equality Helper
// ============================================================================

/**
 * Dependency-free deep equality comparison.
 * Handles primitives, plain objects, arrays, Date, RegExp, null, undefined.
 * Falls back to strict equality for unsupported types (functions, symbols, etc.).
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  // Strict identity / primitive fast path
  if (a === b) return true;

  // null / undefined
  if (a == null || b == null) return a === b;

  // Type mismatch
  if (typeof a !== typeof b) return false;

  // Date
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (a instanceof Date || b instanceof Date) return false;

  // RegExp
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }
  if (a instanceof RegExp || b instanceof RegExp) return false;

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;

  // Plain objects
  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
      if (!deepEqual(aObj[key], bObj[key])) return false;
    }
    return true;
  }

  return false;
}

// ============================================================================
// Test Options & Result
// ============================================================================

export interface TestWorkflowOptions extends ExecutionOptions {
  /** Expected final store state */
  expectedData?: Record<string, unknown>;
  /** Expected success status */
  expectedSuccess?: boolean;
  /** Expected error message (partial match) */
  expectedError?: string;
  /** Timeout in milliseconds */
  timeout?: number;
}

export interface TestResult {
  /** Whether the test passed */
  passed: boolean;
  /** Test execution duration */
  duration: number;
  /** Collected logs */
  logs: string[];
  /** Final store data */
  data: Record<string, unknown>;
  /** Execution success status */
  success: boolean;
  /** Error if any */
  error?: string;
  /** Assertion failures */
  failures: string[];
}

// ============================================================================
// testWorkflow — robust timeout handling + deepEqual comparisons
// ============================================================================

/**
 * Test a workflow with assertions.
 * Uses a cancellable timeout to avoid dangling timers after completion.
 */
export async function testWorkflow(
  workflow: WorkflowDefinition,
  options: TestWorkflowOptions = {},
): Promise<TestResult> {
  const {
    expectedData,
    expectedSuccess,
    expectedError,
    timeout = 30000,
    ...execOptions
  } = options;

  const failures: string[] = [];
  const startTime = performance.now();

  // Cancellable timeout — avoids dangling timer / unhandled rejection leak
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Test timeout")), timeout);
    });

    const executionPromise = Runtime.run(workflow, execOptions);
    const result = await Promise.race([executionPromise, timeoutPromise]);

    // Clear timeout as soon as execution wins the race
    if (timeoutId !== undefined) clearTimeout(timeoutId);

    const duration = performance.now() - startTime;

    // Check expected success
    if (expectedSuccess !== undefined && result.success !== expectedSuccess) {
      failures.push(
        `Expected success=${expectedSuccess}, got ${result.success}`,
      );
    }

    // Check expected error
    if (expectedError && !result.error?.message.includes(expectedError)) {
      failures.push(
        `Expected error containing "${expectedError}", got "${result.error?.message ?? "none"}"`,
      );
    }

    // Check expected data — uses deepEqual instead of fragile JSON.stringify
    if (expectedData) {
      const actualData = Object.fromEntries(result.store.data);
      for (const [key, expectedValue] of Object.entries(expectedData)) {
        const actualValue = actualData[key];
        if (!deepEqual(actualValue, expectedValue)) {
          failures.push(
            `Expected data.${key}=${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`,
          );
        }
      }
    }

    return {
      passed: failures.length === 0,
      duration,
      logs: result.logs,
      data: Object.fromEntries(result.store.data),
      success: result.success,
      error: result.error?.message,
      failures,
    };
  } catch (e) {
    // Clear timeout on error path too
    if (timeoutId !== undefined) clearTimeout(timeoutId);

    const duration = performance.now() - startTime;
    const error = e instanceof Error ? e.message : String(e);

    // If we expected this error, it might pass
    if (expectedError && error.includes(expectedError)) {
      return {
        passed: true,
        duration,
        logs: [],
        data: {},
        success: false,
        error,
        failures: [],
      };
    }

    return {
      passed: false,
      duration,
      logs: [],
      data: {},
      success: false,
      error,
      failures: [`Unexpected error: ${error}`],
    };
  }
}

// ============================================================================
// Mock Helpers
// ============================================================================

/**
 * Create mock values for testing
 */
export function createMocks(
  mocks: Record<string, unknown>,
): Map<string, MockValue> {
  const mockMap = new Map<string, MockValue>();

  for (const [nodeId, output] of Object.entries(mocks)) {
    mockMap.set(nodeId, {
      enabled: true,
      output,
      success: true,
      action: "default",
    });
  }

  return mockMap;
}

// ============================================================================
// Test Function Registration — uses public registry API with `test.` prefix
// ============================================================================

/**
 * Register a test-only function.
 * The id is automatically prefixed with `test.` so that `clearTestFunctions`
 * can reliably remove all test registrations without affecting real functions.
 *
 * @param id - Short id (will be stored as `test.<id>`)
 * @param fn - Implementation. May be sync or async. Receives
 *             `(params, context)` matching `ExecutableFunction` or a simpler
 *             `(params) => result` shape — both are wrapped safely.
 * @returns The full prefixed id that was registered.
 */
export function registerTestFunction(
  id: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (...args: any[]) => any,
): string {
  const fullId = id.startsWith("test.") ? id : `test.${id}`;

  // Wrap the provided fn into a proper ExecutableFunction
  const execute = async (
    params: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<FunctionResult> => {
    try {
      const result = await fn(params, context);

      // If the fn already returns a FunctionResult-shaped object, pass through
      if (
        result !== null &&
        typeof result === "object" &&
        "success" in result &&
        "output" in result
      ) {
        return result as FunctionResult;
      }

      // Otherwise wrap the raw return value
      return { output: result, success: true };
    } catch (e) {
      return {
        output: undefined,
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  };

  registry.register({
    metadata: {
      id: fullId,
      name: `Test: ${id}`,
      description: "Test function",
      category: "Test",
      params: [],
      outputs: [],
    },
    execute,
  });

  return fullId;
}

/**
 * Clear all test functions (those with `test.` prefix) from the registry.
 * Uses the public `registry.unregister()` API — no internal map access.
 */
export function clearTestFunctions(): void {
  const testIds = Array.from(registry.getIds()).filter((id) =>
    id.startsWith("test."),
  );
  for (const id of testIds) {
    registry.unregister(id);
  }
}

// ============================================================================
// FunctionSpy — captures params, timing, and output
// ============================================================================

/** Shape of a single recorded spy call */
export interface SpyCall {
  nodeId: string;
  params: Record<string, unknown>;
  paramTypes: Record<string, string>;
  output: unknown;
  success: boolean;
  timestampStart: number;
  timestampEnd: number;
}

/**
 * Infer a human-readable type string for a value.
 */
function inferType(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  if (value instanceof RegExp) return "regexp";
  return typeof value; // 'string' | 'number' | 'boolean' | 'object' | 'function' | 'symbol' | 'bigint'
}

/**
 * Spy on function calls during execution.
 *
 * Supports both the legacy single-callback pattern (`getCallback()`) and the
 * enhanced dual-callback pattern (`getCallbacks()`) which captures params via
 * `onNodeStart` and results via `onNodeComplete`.
 */
export class FunctionSpy {
  private calls: SpyCall[] = [];
  /** Temporary storage for in-flight calls keyed by nodeId */
  private pending = new Map<
    string,
    {
      params: Record<string, unknown>;
      paramTypes: Record<string, string>;
      timestampStart: number;
    }
  >();

  /**
   * Returns `{ onNodeStart, onNodeComplete }` callbacks that can be spread
   * into `ExecutionOptions` to capture full call data including params.
   */
  getCallbacks(): {
    onNodeStart: (nodeId: string, params: Record<string, unknown>) => void;
    onNodeComplete: (nodeId: string, success: boolean, output: unknown) => void;
  } {
    return {
      onNodeStart: (nodeId: string, params: Record<string, unknown>) => {
        const paramTypes: Record<string, string> = {};
        for (const [k, v] of Object.entries(params)) {
          paramTypes[k] = inferType(v);
        }
        this.pending.set(nodeId, {
          params: { ...params },
          paramTypes,
          timestampStart: performance.now(),
        });
      },
      onNodeComplete: (nodeId: string, success: boolean, output: unknown) => {
        const started = this.pending.get(nodeId);
        this.pending.delete(nodeId);

        this.calls.push({
          nodeId,
          params: started?.params ?? {},
          paramTypes: started?.paramTypes ?? {},
          output,
          success,
          timestampStart: started?.timestampStart ?? performance.now(),
          timestampEnd: performance.now(),
        });
      },
    };
  }

  /**
   * Legacy callback — returns an `onNodeComplete` handler only.
   * Params will be empty (`{}`); prefer `getCallbacks()` for full capture.
   */
  getCallback(): (nodeId: string, success: boolean, output: unknown) => void {
    return (nodeId: string, success: boolean, output: unknown) => {
      this.calls.push({
        nodeId,
        params: {},
        paramTypes: {},
        output,
        success,
        timestampStart: performance.now(),
        timestampEnd: performance.now(),
      });
    };
  }

  getCalls(): SpyCall[] {
    return [...this.calls];
  }

  getCallsForNode(nodeId: string): SpyCall[] {
    return this.calls.filter((call) => call.nodeId === nodeId);
  }

  wasNodeCalled(nodeId: string): boolean {
    return this.calls.some((call) => call.nodeId === nodeId);
  }

  reset(): void {
    this.calls = [];
    this.pending.clear();
  }
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert helper for cleaner test code
 */
export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Deep equality check — uses robust `deepEqual` instead of JSON.stringify.
 * Handles nested objects, arrays, Date, RegExp, undefined values, and
 * properties in different order.
 */
export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (!deepEqual(actual, expected)) {
    const msg =
      message ??
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
    throw new Error(`Assertion failed: ${msg}`);
  }
}
