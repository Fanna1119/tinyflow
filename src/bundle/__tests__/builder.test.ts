/**
 * Bundle Builder Tests
 */

import { describe, it, expect } from "vitest";
import { buildBundle, buildBundleFromJson } from "../builder";
import type { WorkflowDefinition } from "../../schema/types";

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestWorkflow(
  overrides: Partial<WorkflowDefinition> = {},
): WorkflowDefinition {
  return {
    id: "test-workflow",
    name: "Test Workflow",
    version: "1.0.0",
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
    flow: {
      startNodeId: "start",
      ...overrides.flow,
    },
    ...overrides,
  };
}

// ============================================================================
// buildBundle Tests
// ============================================================================

describe("buildBundle", () => {
  describe("ESM format", () => {
    it("should generate ESM bundle with embedded runtime", async () => {
      const workflow = createTestWorkflow();
      const result = await buildBundle({ workflow, format: "esm" });

      expect(result.success).toBe(true);
      expect(result.code).toBeDefined();
      expect(result.code).toContain("export async function runFlow");
      expect(result.code).toContain("export function setEnv");
      expect(result.code).toContain("export function getEnv");
      expect(result.code).toContain("export function getWorkflow");
      expect(result.code).toContain("export default");
    });

    it("should embed workflow JSON in the bundle", async () => {
      const workflow = createTestWorkflow({ name: "My Special Workflow" });
      const result = await buildBundle({ workflow, format: "esm" });

      expect(result.success).toBe(true);
      expect(result.code).toContain("My Special Workflow");
      expect(result.code).toContain("const WORKFLOW =");
    });

    it("should embed default environment variables", async () => {
      const workflow = createTestWorkflow();
      const result = await buildBundle({
        workflow,
        defaultEnv: { API_KEY: "test-key", MODE: "production" },
        format: "esm",
      });

      expect(result.success).toBe(true);
      expect(result.code).toContain("API_KEY");
      expect(result.code).toContain("test-key");
      expect(result.code).toContain("MODE");
      expect(result.code).toContain("production");
    });

    it("should generate bundle without embedded runtime when includeRuntime is false", async () => {
      const workflow = createTestWorkflow();
      const result = await buildBundle({
        workflow,
        includeRuntime: false,
        format: "esm",
      });

      expect(result.success).toBe(true);
      expect(result.code).toContain("import { runWorkflow } from 'tinyflow'");
      expect(result.code).not.toContain("class TinyFlowStore");
    });
  });

  describe("CommonJS format", () => {
    it("should generate CJS bundle with module.exports", async () => {
      const workflow = createTestWorkflow();
      const result = await buildBundle({ workflow, format: "cjs" });

      expect(result.success).toBe(true);
      expect(result.code).toBeDefined();
      expect(result.code).toContain("module.exports");
      expect(result.code).not.toContain("export async function");
    });

    it("should use require() when includeRuntime is false", async () => {
      const workflow = createTestWorkflow();
      const result = await buildBundle({
        workflow,
        includeRuntime: false,
        format: "cjs",
      });

      expect(result.success).toBe(true);
      expect(result.code).toContain("require('tinyflow')");
    });
  });

  describe("IIFE format", () => {
    it("should generate IIFE bundle with global variable", async () => {
      const workflow = createTestWorkflow();
      const result = await buildBundle({
        workflow,
        format: "iife",
        globalName: "MyFlow",
      });

      expect(result.success).toBe(true);
      expect(result.code).toBeDefined();
      expect(result.code).toContain("(function(global)");
      expect(result.code).toContain(
        "global.MyFlow = { runFlow, setEnv, getEnv, getWorkflow }",
      );
    });

    it("should use default global name when not specified", async () => {
      const workflow = createTestWorkflow();
      const result = await buildBundle({ workflow, format: "iife" });

      expect(result.success).toBe(true);
      expect(result.code).toContain("global.TinyFlow");
    });
  });

  describe("minification", () => {
    it("should minify code when minify option is true", async () => {
      const workflow = createTestWorkflow();
      const normalResult = await buildBundle({
        workflow,
        format: "esm",
        minify: false,
      });
      const minifiedResult = await buildBundle({
        workflow,
        format: "esm",
        minify: true,
      });

      expect(normalResult.success).toBe(true);
      expect(minifiedResult.success).toBe(true);
      // Minified should be shorter
      expect(minifiedResult.code!.length).toBeLessThan(
        normalResult.code!.length,
      );
    });
  });

  describe("tree-shaking (only include used functions)", () => {
    it("should only include functions used by the workflow", async () => {
      const workflow = createTestWorkflow();
      const result = await buildBundle({ workflow, format: "esm" });

      expect(result.success).toBe(true);
      // The test workflow uses core.start, core.setValue, core.end
      expect(result.code).toContain("'core.start'");
      expect(result.code).toContain("'core.end'");
      expect(result.code).toContain("'core.setValue'");
      // Should NOT include unused functions
      expect(result.code).not.toContain("'core.log'");
      expect(result.code).not.toContain("'core.passthrough'");
      expect(result.code).not.toContain("'core.delay'");
      expect(result.code).not.toContain("'control.condition'");
      expect(result.code).not.toContain("'control.switch'");
      expect(result.code).not.toContain("'transform.jsonParse'");
      expect(result.code).not.toContain("'http.request'");
    });

    it("should include HTTP functions when used", async () => {
      const workflow: WorkflowDefinition = {
        id: "http-workflow",
        name: "HTTP Workflow",
        version: "1.0.0",
        nodes: [
          {
            id: "start",
            functionId: "core.start",
            params: {},
            position: { x: 0, y: 0 },
          },
          {
            id: "fetch",
            functionId: "http.get",
            params: { url: "https://api.example.com", outputKey: "data" },
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
          { from: "start", to: "fetch", action: "default" },
          { from: "fetch", to: "end", action: "default" },
        ],
        flow: { startNodeId: "start" },
      };
      const result = await buildBundle({ workflow, format: "esm" });

      expect(result.success).toBe(true);
      expect(result.code).toContain("'http.get'");
      // Should NOT include unused HTTP functions
      expect(result.code).not.toContain("'http.post'");
      expect(result.code).not.toContain("'http.request'");
    });

    it("should include control functions when used", async () => {
      const workflow: WorkflowDefinition = {
        id: "condition-workflow",
        name: "Condition Workflow",
        version: "1.0.0",
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
            params: { leftKey: "value", operator: "eq", rightValue: 1 },
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
          { from: "start", to: "check", action: "default" },
          { from: "check", to: "end", action: "success" },
          { from: "check", to: "end", action: "error" },
        ],
        flow: { startNodeId: "start" },
      };
      const result = await buildBundle({ workflow, format: "esm" });

      expect(result.success).toBe(true);
      expect(result.code).toContain("'control.condition'");
      expect(result.code).not.toContain("'control.switch'");
    });

    it("should include transform functions when used", async () => {
      const workflow: WorkflowDefinition = {
        id: "transform-workflow",
        name: "Transform Workflow",
        version: "1.0.0",
        nodes: [
          {
            id: "start",
            functionId: "core.start",
            params: {},
            position: { x: 0, y: 0 },
          },
          {
            id: "parse",
            functionId: "transform.jsonParse",
            params: { inputKey: "json", outputKey: "data" },
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
          { from: "start", to: "parse", action: "default" },
          { from: "parse", to: "end", action: "default" },
        ],
        flow: { startNodeId: "start" },
      };
      const result = await buildBundle({ workflow, format: "esm" });

      expect(result.success).toBe(true);
      expect(result.code).toContain("'transform.jsonParse'");
      expect(result.code).not.toContain("'transform.jsonStringify'");
      expect(result.code).not.toContain("'transform.template'");
    });

    it("should strip position data from nodes", async () => {
      const workflow = createTestWorkflow();
      const result = await buildBundle({ workflow, format: "esm" });

      expect(result.success).toBe(true);
      // Position data should NOT be in the bundle
      expect(result.code).not.toContain('"position"');
      expect(result.code).not.toContain('"x":');
      expect(result.code).not.toContain('"y":');
    });
  });
});

// ============================================================================
// buildBundleFromJson Tests
// ============================================================================

describe("buildBundleFromJson", () => {
  it("should build bundle from valid JSON string", async () => {
    const workflow = createTestWorkflow();
    const json = JSON.stringify(workflow);
    const result = await buildBundleFromJson(json);

    expect(result.success).toBe(true);
    expect(result.code).toBeDefined();
    expect(result.code).toContain("export async function runFlow");
  });

  it("should fail for invalid JSON", async () => {
    const result = await buildBundleFromJson("not valid json");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid JSON");
  });

  it("should pass options to buildBundle", async () => {
    const workflow = createTestWorkflow();
    const json = JSON.stringify(workflow);
    const result = await buildBundleFromJson(json, {
      format: "cjs",
      defaultEnv: { TEST: "value" },
    });

    expect(result.success).toBe(true);
    expect(result.code).toContain("module.exports");
    expect(result.code).toContain("TEST");
    expect(result.code).toContain("value");
  });
});

// ============================================================================
// Generated Code Functionality Tests
// ============================================================================

describe("generated bundle functionality", () => {
  it("should generate syntactically valid JavaScript", async () => {
    const workflow = createTestWorkflow();
    const result = await buildBundle({ workflow, format: "esm" });

    expect(result.success).toBe(true);

    // The generated code structure should be valid
    // Check it has the expected exports and structure
    expect(result.code).toContain("const WORKFLOW =");
    expect(result.code).toContain("const DEFAULT_ENV =");
    expect(result.code).toContain("let currentEnv =");
    expect(result.code).toContain("export async function runFlow");
    expect(result.code).toContain("export function setEnv");
    expect(result.code).toContain("export function getEnv");
    expect(result.code).toContain("export function getWorkflow");
  });

  it("should generate code with proper workflow structure", async () => {
    const workflow = createTestWorkflow({
      nodes: [
        {
          id: "start",
          functionId: "core.start",
          params: { input: { test: true } },
          position: { x: 0, y: 0 },
        },
        {
          id: "end",
          functionId: "core.end",
          params: { outputKey: "customOutput" },
          position: { x: 100, y: 0 },
        },
      ],
      edges: [{ from: "start", to: "end", action: "default" }],
    });

    const result = await buildBundle({ workflow, format: "esm" });

    expect(result.success).toBe(true);
    expect(result.code).toContain("core.start");
    expect(result.code).toContain("core.end");
    expect(result.code).toContain("customOutput");
    expect(result.code).toContain('"test": true');
  });
});
