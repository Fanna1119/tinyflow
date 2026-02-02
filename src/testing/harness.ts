/**
 * Testing Harness
 * Utilities for testing TinyFlow workflows
 */

import type { WorkflowDefinition } from "../schema/types";
import { Runtime, type ExecutionOptions } from "../runtime/runtime";
import { registry } from "../registry";
import type { MockValue } from "../compiler";

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

/**
 * Test a workflow with assertions
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

  try {
    // Run with timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Test timeout")), timeout),
    );

    const executionPromise = Runtime.run(workflow, execOptions);
    const result = await Promise.race([executionPromise, timeoutPromise]);

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

    // Check expected data
    if (expectedData) {
      const actualData = Object.fromEntries(result.store.data);
      for (const [key, expectedValue] of Object.entries(expectedData)) {
        const actualValue = actualData[key];
        if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
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

/**
 * Register a test-only function
 */
export function registerTestFunction(
  id: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (...args: any[]) => any,
): void {
  // Use registry's internal registration (for testing only)
  // This is a simplified version - real implementation would need proper typing
  (registry as any).functions.set(id, {
    id,
    name: `Test: ${id}`,
    description: "Test function",
    category: "Test",
    params: [],
    outputs: [],
  });
  (registry as any).executables.set(id, fn);
}

/**
 * Clear test functions
 */
export function clearTestFunctions(): void {
  // Remove all test functions from registry
  const testFunctions = (
    Array.from((registry as any).functions.keys()) as string[]
  ).filter((id) => id.startsWith("test."));

  for (const id of testFunctions) {
    (registry as any).functions.delete(id);
    (registry as any).executables.delete(id);
  }
}

/**
 * Spy on function calls during execution
 */
export class FunctionSpy {
  private calls: Array<{
    nodeId: string;
    params: Record<string, unknown>;
    output: unknown;
    success: boolean;
  }> = [];

  getCallback() {
    return (nodeId: string, success: boolean, output: unknown) => {
      this.calls.push({
        nodeId,
        params: {}, // Would need to capture from context
        output,
        success,
      });
    };
  }

  getCalls(): typeof this.calls {
    return [...this.calls];
  }

  getCallsForNode(nodeId: string): typeof this.calls {
    return this.calls.filter((call) => call.nodeId === nodeId);
  }

  wasNodeCalled(nodeId: string): boolean {
    return this.calls.some((call) => call.nodeId === nodeId);
  }

  reset(): void {
    this.calls = [];
  }
}

/**
 * Assert helper for cleaner test code
 */
export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Deep equality check
 */
export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    const msg = message ?? `Expected ${expectedJson}, got ${actualJson}`;
    throw new Error(`Assertion failed: ${msg}`);
  }
}
