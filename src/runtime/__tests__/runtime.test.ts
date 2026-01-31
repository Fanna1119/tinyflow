/**
 * Runtime Tests
 */

import { describe, it, expect } from "vitest";
import { Runtime, runWorkflow, runWorkflowFromJson } from "../runtime";
import type { WorkflowDefinition } from "../../schema/types";

// ============================================================================
// Helper to create valid workflow
// ============================================================================

function createWorkflow(
  overrides: Partial<WorkflowDefinition> = {},
): WorkflowDefinition {
  return {
    id: "test-id",
    name: "test-workflow",
    version: "1.0.0",
    nodes: [
      {
        id: "start",
        functionId: "core.start",
        params: {},
        position: { x: 0, y: 0 },
      },
    ],
    edges: [],
    flow: { startNodeId: "start" },
    ...overrides,
  };
}

// ============================================================================
// Test Fixtures
// ============================================================================

const simpleWorkflow = createWorkflow({
  nodes: [
    {
      id: "start",
      functionId: "core.start",
      params: {},
      position: { x: 0, y: 0 },
    },
    {
      id: "setValue",
      functionId: "core.setValue",
      params: { key: "result", value: "success" },
      position: { x: 100, y: 0 },
    },
    {
      id: "end",
      functionId: "core.end",
      params: {},
      position: { x: 200, y: 0 },
    },
  ],
  edges: [
    { from: "start", to: "setValue", action: "default" },
    { from: "setValue", to: "end", action: "default" },
  ],
});

const loggingWorkflow = createWorkflow({
  nodes: [
    {
      id: "start",
      functionId: "core.start",
      params: {},
      position: { x: 0, y: 0 },
    },
    {
      id: "log1",
      functionId: "core.log",
      params: { key: "input", message: "First log" },
      position: { x: 100, y: 0 },
    },
    {
      id: "log2",
      functionId: "core.log",
      params: { key: "input", message: "Second log" },
      position: { x: 200, y: 0 },
    },
    {
      id: "end",
      functionId: "core.end",
      params: {},
      position: { x: 300, y: 0 },
    },
  ],
  edges: [
    { from: "start", to: "log1", action: "default" },
    { from: "log1", to: "log2", action: "default" },
    { from: "log2", to: "end", action: "default" },
  ],
});

const conditionalWorkflow = createWorkflow({
  nodes: [
    {
      id: "start",
      functionId: "core.start",
      params: {},
      position: { x: 0, y: 0 },
    },
    {
      id: "setInitial",
      functionId: "core.setValue",
      params: { key: "value", value: 10 },
      position: { x: 100, y: 0 },
    },
    {
      id: "check",
      functionId: "control.condition",
      params: { leftKey: "value", operator: "gt", rightValue: 5 },
      position: { x: 200, y: 0 },
    },
    {
      id: "successPath",
      functionId: "core.setValue",
      params: { key: "branch", value: "success" },
      position: { x: 300, y: -50 },
    },
    {
      id: "failurePath",
      functionId: "core.setValue",
      params: { key: "branch", value: "failure" },
      position: { x: 300, y: 50 },
    },
    {
      id: "end",
      functionId: "core.end",
      params: {},
      position: { x: 400, y: 0 },
    },
  ],
  edges: [
    { from: "start", to: "setInitial", action: "default" },
    { from: "setInitial", to: "check", action: "default" },
    { from: "check", to: "successPath", action: "success" },
    { from: "check", to: "failurePath", action: "error" },
    { from: "successPath", to: "end", action: "default" },
    { from: "failurePath", to: "end", action: "default" },
  ],
});

// ============================================================================
// Runtime Class Tests
// ============================================================================

describe("Runtime", () => {
  describe("constructor", () => {
    it("should create runtime without env", () => {
      const runtime = new Runtime();
      expect(runtime.isReady()).toBe(false);
    });

    it("should create runtime with global env", () => {
      const runtime = new Runtime({ API_KEY: "test" });
      expect(runtime.isReady()).toBe(false);
    });
  });

  describe("load", () => {
    it("should load and compile workflow", () => {
      const runtime = new Runtime();
      const result = runtime.load(simpleWorkflow);

      expect(result.success).toBe(true);
      expect(runtime.isReady()).toBe(true);
    });

    it("should fail to load invalid workflow", () => {
      const runtime = new Runtime();
      const result = runtime.load({} as WorkflowDefinition);

      expect(result.success).toBe(false);
      expect(runtime.isReady()).toBe(false);
    });
  });

  describe("loadFromJson", () => {
    it("should load workflow from JSON string", () => {
      const runtime = new Runtime();
      const result = runtime.loadFromJson(JSON.stringify(simpleWorkflow));

      expect(result.success).toBe(true);
      expect(runtime.isReady()).toBe(true);
    });

    it("should fail for invalid JSON", () => {
      const runtime = new Runtime();
      const result = runtime.loadFromJson("not json");

      expect(result.success).toBe(false);
    });
  });

  describe("execute", () => {
    it("should execute simple workflow", async () => {
      const runtime = new Runtime();
      runtime.load(simpleWorkflow);

      const result = await runtime.execute();

      expect(result.success).toBe(true);
      expect(result.store.data.get("result")).toBe("success");
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("should execute with initial state", async () => {
      const runtime = new Runtime();
      runtime.load(simpleWorkflow);

      const result = await runtime.execute({
        initialData: { existingKey: "existingValue" },
      });

      expect(result.success).toBe(true);
      expect(result.store.data.get("existingKey")).toBe("existingValue");
      expect(result.store.data.get("result")).toBe("success");
    });

    it("should collect logs during execution", async () => {
      const runtime = new Runtime();
      runtime.load(loggingWorkflow);

      const result = await runtime.execute();

      expect(result.success).toBe(true);
      // Logs contain the full log message: `${prefix}${key} = ${JSON.stringify(value)}`
      expect(result.logs.some((l) => l.includes("First log:"))).toBe(true);
      expect(result.logs.some((l) => l.includes("Second log:"))).toBe(true);
    });

    it("should execute conditional workflow correctly", async () => {
      const runtime = new Runtime();
      runtime.load(conditionalWorkflow);

      const result = await runtime.execute();

      expect(result.success).toBe(true);
      expect(result.store.data.get("branch")).toBe("success");
    });

    it("should return error result if workflow not loaded", async () => {
      const runtime = new Runtime();

      const result = await runtime.execute();
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("No workflow loaded");
    });
  });

  describe("isReady", () => {
    it("should return false before loading", () => {
      const runtime = new Runtime();
      expect(runtime.isReady()).toBe(false);
    });

    it("should return true after loading", () => {
      const runtime = new Runtime();
      runtime.load(simpleWorkflow);
      expect(runtime.isReady()).toBe(true);
    });
  });
});

// ============================================================================
// Convenience Function Tests
// ============================================================================

describe("runWorkflow", () => {
  it("should execute workflow in one call", async () => {
    const result = await runWorkflow(simpleWorkflow);

    expect(result.success).toBe(true);
    expect(result.store.data.get("result")).toBe("success");
  });

  it("should accept options", async () => {
    const result = await runWorkflow(simpleWorkflow, {
      initialData: { preloaded: true },
    });

    expect(result.success).toBe(true);
    expect(result.store.data.get("preloaded")).toBe(true);
  });

  it("should accept global env", async () => {
    const result = await runWorkflow(simpleWorkflow, {
      env: { MODE: "test" },
    });

    expect(result.success).toBe(true);
  });
});

describe("runWorkflowFromJson", () => {
  it("should execute workflow from JSON string", async () => {
    const json = JSON.stringify(simpleWorkflow);
    const result = await runWorkflowFromJson(json);

    expect(result.success).toBe(true);
    expect(result.store.data.get("result")).toBe("success");
  });

  it("should fail for invalid JSON", async () => {
    const result = await runWorkflowFromJson("not json");

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("edge cases", () => {
  it("should handle workflow with single node", async () => {
    const singleNode = createWorkflow();

    const result = await runWorkflow(singleNode);
    expect(result.success).toBe(true);
  });

  it("should preserve data between nodes", async () => {
    const dataFlow = createWorkflow({
      nodes: [
        {
          id: "start",
          functionId: "core.start",
          params: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "set1",
          functionId: "core.setValue",
          params: { key: "a", value: 1 },
          position: { x: 100, y: 0 },
        },
        {
          id: "set2",
          functionId: "core.setValue",
          params: { key: "b", value: 2 },
          position: { x: 200, y: 0 },
        },
        {
          id: "set3",
          functionId: "core.setValue",
          params: { key: "c", value: 3 },
          position: { x: 300, y: 0 },
        },
        {
          id: "end",
          functionId: "core.end",
          params: {},
          position: { x: 400, y: 0 },
        },
      ],
      edges: [
        { from: "start", to: "set1", action: "default" },
        { from: "set1", to: "set2", action: "default" },
        { from: "set2", to: "set3", action: "default" },
        { from: "set3", to: "end", action: "default" },
      ],
    });

    const result = await runWorkflow(dataFlow);

    expect(result.store.data.get("a")).toBe(1);
    expect(result.store.data.get("b")).toBe(2);
    expect(result.store.data.get("c")).toBe(3);
  });
});
