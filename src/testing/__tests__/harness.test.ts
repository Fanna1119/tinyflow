/**
 * Testing Harness Tests
 */

import { describe, it, expect } from "vitest";
import {
  testWorkflow,
  createMocks,
  FunctionSpy,
  assert,
  assertEqual,
  deepEqual,
  registerTestFunction,
  clearTestFunctions,
} from "../harness";
import { registry } from "../../registry";
import type { WorkflowDefinition } from "../../schema/types";

describe("Testing Harness", () => {
  it("should test workflow with expected data", async () => {
    const workflow: WorkflowDefinition = {
      id: "test-flow",
      name: "Test Flow",
      version: "1.0.0",
      flow: {
        startNodeId: "node1",
        envs: {},
      },
      nodes: [
        {
          id: "node1",
          functionId: "core.setValue",
          params: {
            key: "result",
            value: 42,
          },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    };

    const result = await testWorkflow(workflow, {
      expectedData: { result: 42 },
      expectedSuccess: true,
    });

    expect(result.passed).toBe(true);
    expect(result.success).toBe(true);
    expect(result.data.result).toBe(42);
    expect(result.failures).toHaveLength(0);
  });

  it("should detect assertion failures", async () => {
    const workflow: WorkflowDefinition = {
      id: "test-flow-2",
      name: "Test Flow",
      version: "1.0.0",
      flow: {
        startNodeId: "node1",
        envs: {},
      },
      nodes: [
        {
          id: "node1",
          functionId: "core.setValue",
          params: {
            key: "result",
            value: 100,
          },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    };

    const result = await testWorkflow(workflow, {
      expectedData: { result: 42 }, // Wrong expected value
      expectedSuccess: true,
    });

    expect(result.passed).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.failures[0]).toContain("result");
  });

  it("should create mocks map", () => {
    const mocks = createMocks({
      node1: { data: "mocked" },
      node2: 123,
    });

    expect(mocks.size).toBe(2);
    expect(mocks.get("node1")).toMatchObject({
      output: { data: "mocked" },
      success: true,
    });
  });

  it("should track function calls with spy", async () => {
    const spy = new FunctionSpy();

    const workflow: WorkflowDefinition = {
      id: "test-flow-3",
      name: "Test Flow",
      version: "1.0.0",
      flow: {
        startNodeId: "node1",
        envs: {},
      },
      nodes: [
        {
          id: "node1",
          functionId: "core.setValue",
          params: {
            key: "value",
            value: "test",
          },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    };

    await testWorkflow(workflow, {
      onNodeComplete: spy.getCallback(),
    });

    expect(spy.wasNodeCalled("node1")).toBe(true);
    expect(spy.getCalls()).toHaveLength(1);
  });

  it("should handle test timeout", async () => {
    const workflow: WorkflowDefinition = {
      id: "test-flow-4",
      name: "Test Flow",
      version: "1.0.0",
      flow: {
        startNodeId: "node1",
        envs: {},
      },
      nodes: [
        {
          id: "node1",
          functionId: "core.delay",
          params: {
            ms: 5000,
          },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    };

    const result = await testWorkflow(workflow, {
      timeout: 100, // 100ms timeout
    });

    expect(result.passed).toBe(false);
    expect(result.error).toContain("timeout");
  }, 10000);

  it("should use assert helper", () => {
    expect(() => assert(true, "Should not throw")).not.toThrow();
    expect(() => assert(false, "Should throw")).toThrow("Should throw");
  });

  it("should use assertEqual helper", () => {
    expect(() => assertEqual(42, 42)).not.toThrow();
    expect(() => assertEqual({ a: 1 }, { a: 1 })).not.toThrow();
    expect(() => assertEqual(42, 100)).toThrow();
    expect(() => assertEqual({ a: 1 }, { a: 2 })).toThrow();
  });
});

// ============================================================================
// deepEqual
// ============================================================================

describe("deepEqual", () => {
  it("handles primitives", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual("a", "a")).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual("a", "b")).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  it("handles nested objects regardless of key order", () => {
    expect(deepEqual({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("handles arrays", () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
  });

  it("handles Dates", () => {
    const d = new Date("2025-01-01");
    expect(deepEqual(d, new Date("2025-01-01"))).toBe(true);
    expect(deepEqual(d, new Date("2026-01-01"))).toBe(false);
  });

  it("handles RegExps", () => {
    expect(deepEqual(/abc/gi, /abc/gi)).toBe(true);
    expect(deepEqual(/abc/g, /abc/i)).toBe(false);
  });

  it("handles undefined values in objects", () => {
    expect(deepEqual({ a: undefined }, { a: undefined })).toBe(true);
    // JSON.stringify would lose undefined — deepEqual does not
    expect(deepEqual({ a: undefined }, {})).toBe(false);
  });
});

// ============================================================================
// registerTestFunction / clearTestFunctions
// ============================================================================

describe("registerTestFunction", () => {
  it("registers with test. prefix and proper executable shape", async () => {
    const fullId = registerTestFunction("myFn", (params) => ({
      greeting: `Hello ${params.name}`,
    }));

    expect(fullId).toBe("test.myFn");
    expect(registry.has("test.myFn")).toBe(true);

    const fn = registry.get("test.myFn");
    expect(fn).toBeDefined();
    expect(fn!.metadata.category).toBe("Test");

    // Execute via the registry's executable wrapper
    const result = await fn!.execute(
      { name: "World" },
      {
        nodeId: "n1",
        store: new Map(),
        env: {},
        log: () => {},
      },
    );

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ greeting: "Hello World" });
  });

  it("wraps errors from the test function", async () => {
    registerTestFunction("failing", () => {
      throw new Error("boom");
    });

    const fn = registry.get("test.failing")!;
    const result = await fn.execute(
      {},
      { nodeId: "n1", store: new Map(), env: {}, log: () => {} },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("boom");
  });

  it("does not double-prefix ids already starting with test.", () => {
    const fullId = registerTestFunction("test.already", () => 1);
    expect(fullId).toBe("test.already");
  });
});

describe("clearTestFunctions", () => {
  it("removes only test-prefixed functions", () => {
    registerTestFunction("cleanup1", () => 1);
    registerTestFunction("cleanup2", () => 2);

    expect(registry.has("test.cleanup1")).toBe(true);
    expect(registry.has("test.cleanup2")).toBe(true);

    clearTestFunctions();

    expect(registry.has("test.cleanup1")).toBe(false);
    expect(registry.has("test.cleanup2")).toBe(false);
    // Built-in functions should remain
    expect(registry.has("core.setValue")).toBe(true);
  });
});

// ============================================================================
// FunctionSpy — enhanced getCallbacks()
// ============================================================================

describe("FunctionSpy enhanced", () => {
  it("captures params and timing via getCallbacks()", async () => {
    const spy = new FunctionSpy();
    const { onNodeStart, onNodeComplete } = spy.getCallbacks();

    const workflow: WorkflowDefinition = {
      id: "spy-test",
      name: "Spy Test",
      version: "1.0.0",
      flow: { startNodeId: "n1", envs: {} },
      nodes: [
        {
          id: "n1",
          functionId: "core.setValue",
          params: { key: "val", value: 42 },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    };

    await testWorkflow(workflow, { onNodeStart, onNodeComplete });

    const calls = spy.getCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].nodeId).toBe("n1");
    expect(calls[0].params).toHaveProperty("key", "val");
    expect(calls[0].params).toHaveProperty("value", 42);
    expect(calls[0].paramTypes.key).toBe("string");
    expect(calls[0].paramTypes.value).toBe("number");
    expect(calls[0].success).toBe(true);
    expect(calls[0].timestampEnd).toBeGreaterThanOrEqual(
      calls[0].timestampStart,
    );
  });

  it("legacy getCallback() still works", async () => {
    const spy = new FunctionSpy();

    const workflow: WorkflowDefinition = {
      id: "spy-legacy",
      name: "Spy Legacy",
      version: "1.0.0",
      flow: { startNodeId: "n1", envs: {} },
      nodes: [
        {
          id: "n1",
          functionId: "core.setValue",
          params: { key: "v", value: 1 },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    };

    await testWorkflow(workflow, { onNodeComplete: spy.getCallback() });

    expect(spy.wasNodeCalled("n1")).toBe(true);
    expect(spy.getCalls()).toHaveLength(1);
    // params won't be populated with legacy callback
    expect(spy.getCalls()[0].params).toEqual({});
  });

  it("reset clears calls and pending state", () => {
    const spy = new FunctionSpy();
    const { onNodeStart, onNodeComplete } = spy.getCallbacks();

    onNodeStart("x", { a: 1 });
    onNodeComplete("x", true, "done");
    expect(spy.getCalls()).toHaveLength(1);

    spy.reset();
    expect(spy.getCalls()).toHaveLength(0);
  });
});
