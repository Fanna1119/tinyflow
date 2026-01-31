/**
 * Schema Validator Tests
 */

import { describe, it, expect } from "vitest";
import { validateWorkflow, parseWorkflow, isValidWorkflow } from "../validator";
import type { WorkflowDefinition, WorkflowNode, WorkflowEdge } from "../types";

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
    flow: {
      startNodeId: "start",
    },
    ...overrides,
  };
}

// ============================================================================
// Test Fixtures
// ============================================================================

const validWorkflow = createWorkflow({
  nodes: [
    {
      id: "start",
      functionId: "core.start",
      params: {},
      position: { x: 0, y: 0 },
    },
    {
      id: "end",
      functionId: "core.end",
      params: {},
      position: { x: 200, y: 0 },
    },
  ],
  edges: [{ from: "start", to: "end", action: "default" }],
});

const minimalWorkflow = createWorkflow();

// ============================================================================
// validateWorkflow Tests
// ============================================================================

describe("validateWorkflow", () => {
  it("should validate a correct workflow", () => {
    const result = validateWorkflow(validWorkflow);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should validate a minimal workflow", () => {
    const result = validateWorkflow(minimalWorkflow);
    expect(result.valid).toBe(true);
  });

  it("should reject workflow missing required fields", () => {
    const invalid = { nodes: [], edges: [] };
    const result = validateWorkflow(invalid as unknown as WorkflowDefinition);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should reject workflow with invalid node (missing id)", () => {
    const invalid = createWorkflow({
      nodes: [
        {
          functionId: "core.start",
          params: {},
          position: { x: 0, y: 0 },
        } as unknown as WorkflowNode,
      ],
    });
    const result = validateWorkflow(invalid);
    expect(result.valid).toBe(false);
  });

  it("should reject workflow with invalid edge (missing from)", () => {
    const invalid = createWorkflow({
      edges: [{ to: "start", action: "default" } as unknown as WorkflowEdge],
    });
    const result = validateWorkflow(invalid);
    expect(result.valid).toBe(false);
  });

  it("should detect duplicate node IDs", () => {
    const invalid = createWorkflow({
      nodes: [
        {
          id: "node1",
          functionId: "core.start",
          params: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "node1",
          functionId: "core.end",
          params: {},
          position: { x: 100, y: 0 },
        },
      ],
      flow: { startNodeId: "node1" },
    });
    const result = validateWorkflow(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Duplicate"))).toBe(
      true,
    );
  });

  it("should detect edges referencing non-existent nodes", () => {
    const invalid = createWorkflow({
      edges: [{ from: "start", to: "nonexistent", action: "default" }],
    });
    const result = validateWorkflow(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("nonexistent"))).toBe(
      true,
    );
  });

  it("should include errors for unknown function IDs when registry provided", () => {
    const workflow = createWorkflow({
      nodes: [
        {
          id: "node1",
          functionId: "unknown.function",
          params: {},
          position: { x: 0, y: 0 },
        },
      ],
      flow: { startNodeId: "node1" },
    });
    // Must pass registered functions to enable function validation
    const registeredFunctions = new Set(["core.start", "core.end"]);
    const result = validateWorkflow(workflow, registeredFunctions);
    // Unknown functions produce errors (not warnings)
    expect(
      result.errors.some((e) => e.message.includes("unknown.function")),
    ).toBe(true);
  });

  it("should validate node with runtime configuration", () => {
    const workflow = createWorkflow({
      nodes: [
        {
          id: "node1",
          functionId: "core.start",
          params: {},
          position: { x: 0, y: 0 },
          runtime: {
            maxRetries: 3,
            retryDelay: 1000,
          },
        },
      ],
      flow: { startNodeId: "node1" },
    });
    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(true);
  });

  it("should validate node with environment variables", () => {
    const workflow = createWorkflow({
      nodes: [
        {
          id: "node1",
          functionId: "http.get",
          params: { url: "https://api.example.com" },
          position: { x: 0, y: 0 },
          envs: {
            API_KEY: "secret",
          },
        },
      ],
      flow: { startNodeId: "node1" },
    });
    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// parseWorkflow Tests
// ============================================================================

describe("parseWorkflow", () => {
  it("should parse valid JSON into workflow", () => {
    const json = JSON.stringify(validWorkflow);
    const result = parseWorkflow(json);
    expect(result.validation.valid).toBe(true);
    expect(result.workflow).toBeDefined();
    expect(result.workflow?.name).toBe("test-workflow");
  });

  it("should reject invalid JSON", () => {
    const result = parseWorkflow("not valid json");
    expect(result.validation.valid).toBe(false);
    expect(result.workflow).toBeNull();
  });

  it("should reject JSON that is not an object", () => {
    const result = parseWorkflow('"just a string"');
    expect(result.validation.valid).toBe(false);
  });

  it("should validate after parsing", () => {
    const invalidJson = JSON.stringify({ name: "test" }); // missing required fields
    const result = parseWorkflow(invalidJson);
    expect(result.validation.valid).toBe(false);
  });
});

// ============================================================================
// isValidWorkflow Tests
// ============================================================================

describe("isValidWorkflow", () => {
  it("should return true for valid workflow", () => {
    expect(isValidWorkflow(validWorkflow)).toBe(true);
  });

  it("should return false for invalid workflow", () => {
    expect(isValidWorkflow({} as WorkflowDefinition)).toBe(false);
  });

  it("should return false for null", () => {
    expect(isValidWorkflow(null as unknown as WorkflowDefinition)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(isValidWorkflow(undefined as unknown as WorkflowDefinition)).toBe(
      false,
    );
  });
});
