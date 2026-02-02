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
} from "../harness";
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
