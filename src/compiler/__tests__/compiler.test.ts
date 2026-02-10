/**
 * Compiler Tests
 */

import { describe, it, expect } from "vitest";
import { compileWorkflow, compileWorkflowFromJson, createStore } from "..";
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
      id: "log",
      functionId: "core.log",
      params: { message: "Hello from test!" },
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
    { from: "start", to: "log", action: "default" },
    { from: "log", to: "end", action: "default" },
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
      id: "check",
      functionId: "control.condition",
      params: { expression: "value > 5" },
      position: { x: 100, y: 0 },
    },
    {
      id: "success",
      functionId: "core.log",
      params: { message: "Condition met!" },
      position: { x: 200, y: -50 },
    },
    {
      id: "failure",
      functionId: "core.log",
      params: { message: "Condition not met" },
      position: { x: 200, y: 50 },
    },
    {
      id: "end",
      functionId: "core.end",
      params: {},
      position: { x: 300, y: 0 },
    },
  ],
  edges: [
    { from: "start", to: "check", action: "default" },
    { from: "check", to: "success", action: "success" },
    { from: "check", to: "failure", action: "error" },
    { from: "success", to: "end", action: "default" },
    { from: "failure", to: "end", action: "default" },
  ],
});

const workflowWithEnvs = createWorkflow({
  nodes: [
    {
      id: "start",
      functionId: "core.start",
      params: {},
      position: { x: 0, y: 0 },
      envs: { API_KEY: "secret123" },
    },
  ],
});

const workflowWithRuntime = createWorkflow({
  nodes: [
    {
      id: "retry-node",
      functionId: "core.log",
      params: { message: "Retrying..." },
      position: { x: 0, y: 0 },
      runtime: { maxRetries: 3, retryDelay: 100 },
    },
  ],
  flow: { startNodeId: "retry-node" },
});

// ============================================================================
// compileWorkflow Tests
// ============================================================================

describe("compileWorkflow", () => {
  it("should compile a simple workflow successfully", () => {
    const result = compileWorkflow(simpleWorkflow);

    expect(result.success).toBe(true);
    expect(result.flow).toBeDefined();
    expect(result.startNodeId).toBe("start");
    expect(result.errors).toHaveLength(0);
  });

  it("should compile a conditional workflow", () => {
    const result = compileWorkflow(conditionalWorkflow);

    expect(result.success).toBe(true);
    expect(result.flow).toBeDefined();
  });

  it("should compile workflow with environment variables", () => {
    const result = compileWorkflow(workflowWithEnvs, {
      globalEnvs: { GLOBAL_VAR: "global_value" },
    });

    expect(result.success).toBe(true);
  });

  it("should compile workflow with runtime configuration", () => {
    const result = compileWorkflow(workflowWithRuntime);

    expect(result.success).toBe(true);
  });

  it("should fail for invalid workflow", () => {
    const invalid = { name: "invalid" } as WorkflowDefinition;

    const result = compileWorkflow(invalid);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should fail with unknown function ID by default (validation is on)", () => {
    const workflowWithUnknown = createWorkflow({
      nodes: [
        {
          id: "unknown",
          functionId: "nonexistent.function",
          params: {},
          position: { x: 0, y: 0 },
        },
      ],
      flow: { startNodeId: "unknown" },
    });

    const result = compileWorkflow(workflowWithUnknown);
    // Should fail - function validation is on by default
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("nonexistent.function"))).toBe(
      true,
    );
  });

  it("should identify the start node correctly", () => {
    // Workflow where start node is not first in array
    const workflow = createWorkflow({
      nodes: [
        {
          id: "end",
          functionId: "core.end",
          params: {},
          position: { x: 100, y: 0 },
        },
        {
          id: "actual-start",
          functionId: "core.start",
          params: {},
          position: { x: 0, y: 0 },
        },
      ],
      edges: [{ from: "actual-start", to: "end", action: "default" }],
      flow: { startNodeId: "actual-start" },
    });

    const result = compileWorkflow(workflow);
    expect(result.startNodeId).toBe("actual-start");
  });

  it("should skip registry validation when option is set", () => {
    const workflowWithUnknown = createWorkflow({
      nodes: [
        {
          id: "unknown",
          functionId: "nonexistent.function",
          params: {},
          position: { x: 0, y: 0 },
        },
      ],
      flow: { startNodeId: "unknown" },
    });

    const result = compileWorkflow(workflowWithUnknown, {
      skipRegistryValidation: true,
    });

    // Should compile without warnings about missing function
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// compileWorkflowFromJson Tests
// ============================================================================

describe("compileWorkflowFromJson", () => {
  it("should compile from JSON string", () => {
    const json = JSON.stringify(simpleWorkflow);
    const result = compileWorkflowFromJson(json);

    expect(result.success).toBe(true);
    expect(result.flow).toBeDefined();
  });

  it("should fail for invalid JSON", () => {
    const result = compileWorkflowFromJson("not valid json");

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should fail for JSON that is not a valid workflow", () => {
    const result = compileWorkflowFromJson('{"foo": "bar"}');

    expect(result.success).toBe(false);
  });
});

// ============================================================================
// createStore Tests
// ============================================================================

describe("createStore", () => {
  it("should create store with empty data", () => {
    const store = createStore();

    expect(store.data).toBeInstanceOf(Map);
    expect(store.data.size).toBe(0);
    expect(store.logs).toEqual([]);
    expect(store.env).toEqual({});
    expect(store.nodeResults).toBeInstanceOf(Map);
  });

  it("should create store with initial data", () => {
    const store = createStore({ key: "value", count: 42 });

    expect(store.data.get("key")).toBe("value");
    expect(store.data.get("count")).toBe(42);
  });

  it("should create store with environment variables", () => {
    const store = createStore({}, { API_KEY: "secret", DEBUG: "true" });

    expect(store.env.API_KEY).toBe("secret");
    expect(store.env.DEBUG).toBe("true");
  });

  it("should create store with both initial data and env", () => {
    const store = createStore({ input: "test" }, { MODE: "test" });

    expect(store.data.get("input")).toBe("test");
    expect(store.env.MODE).toBe("test");
  });
});
