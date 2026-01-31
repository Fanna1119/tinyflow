/**
 * Function Registry Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { FunctionRegistry, param } from "../registry";

// ============================================================================
// FunctionRegistry Class Tests
// ============================================================================

describe("FunctionRegistry", () => {
  let testRegistry: FunctionRegistry;

  beforeEach(() => {
    testRegistry = new FunctionRegistry();
  });

  describe("register", () => {
    it("should register a function", () => {
      testRegistry.register({
        metadata: {
          id: "test.hello",
          name: "Hello",
          description: "A test function",
          category: "Test",
          params: [],
        },
        execute: async () => ({ output: null, success: true }),
      });

      expect(testRegistry.has("test.hello")).toBe(true);
    });

    it("should allow overwriting existing functions", () => {
      testRegistry.register({
        metadata: {
          id: "test.fn",
          name: "Version 1",
          description: "First version",
          category: "Test",
          params: [],
        },
        execute: async () => ({ output: "v1", success: true }),
      });

      testRegistry.register({
        metadata: {
          id: "test.fn",
          name: "Version 2",
          description: "Second version",
          category: "Test",
          params: [],
        },
        execute: async () => ({ output: "v2", success: true }),
      });

      expect(testRegistry.get("test.fn")?.metadata.name).toBe("Version 2");
    });
  });

  describe("get", () => {
    it("should return registered function", () => {
      testRegistry.register({
        metadata: {
          id: "test.get",
          name: "Get Test",
          description: "Test",
          category: "Test",
          params: [],
        },
        execute: async () => ({ output: null, success: true }),
      });

      const retrieved = testRegistry.get("test.get");

      expect(retrieved).toBeDefined();
      expect(retrieved?.metadata.id).toBe("test.get");
    });

    it("should return undefined for unregistered function", () => {
      expect(testRegistry.get("nonexistent")).toBeUndefined();
    });
  });

  describe("has", () => {
    it("should return true for registered function", () => {
      testRegistry.register({
        metadata: {
          id: "test.exists",
          name: "Exists",
          description: "Test",
          category: "Test",
          params: [],
        },
        execute: async () => ({ output: null, success: true }),
      });

      expect(testRegistry.has("test.exists")).toBe(true);
    });

    it("should return false for unregistered function", () => {
      expect(testRegistry.has("test.notexists")).toBe(false);
    });
  });

  describe("getIds", () => {
    it("should return all registered function IDs", () => {
      testRegistry.register({
        metadata: {
          id: "test.a",
          name: "A",
          description: "Test",
          category: "Test",
          params: [],
        },
        execute: async () => ({ output: null, success: true }),
      });
      testRegistry.register({
        metadata: {
          id: "test.b",
          name: "B",
          description: "Test",
          category: "Test",
          params: [],
        },
        execute: async () => ({ output: null, success: true }),
      });

      const ids = testRegistry.getIds();
      expect(ids.has("test.a")).toBe(true);
      expect(ids.has("test.b")).toBe(true);
    });

    it("should return empty set for empty registry", () => {
      expect(testRegistry.getIds().size).toBe(0);
    });
  });

  describe("getAllMetadata", () => {
    it("should return metadata for all functions", () => {
      testRegistry.register({
        metadata: {
          id: "test.meta",
          name: "Meta Test",
          description: "Description",
          category: "Test",
          params: [],
        },
        execute: async () => ({ output: null, success: true }),
      });

      const allMeta = testRegistry.getAllMetadata();
      expect(allMeta).toHaveLength(1);
      expect(allMeta[0].id).toBe("test.meta");
      expect(allMeta[0].name).toBe("Meta Test");
    });
  });

  describe("getMetadataByCategory", () => {
    it("should group functions by category", () => {
      testRegistry.register({
        metadata: {
          id: "cat1.a",
          name: "A",
          description: "Test",
          category: "Category1",
          params: [],
        },
        execute: async () => ({ output: null, success: true }),
      });
      testRegistry.register({
        metadata: {
          id: "cat1.b",
          name: "B",
          description: "Test",
          category: "Category1",
          params: [],
        },
        execute: async () => ({ output: null, success: true }),
      });
      testRegistry.register({
        metadata: {
          id: "cat2.a",
          name: "C",
          description: "Test",
          category: "Category2",
          params: [],
        },
        execute: async () => ({ output: null, success: true }),
      });

      const byCategory = testRegistry.getMetadataByCategory();

      expect(byCategory.get("Category1")).toHaveLength(2);
      expect(byCategory.get("Category2")).toHaveLength(1);
    });
  });
});

// ============================================================================
// param helper Tests
// ============================================================================

describe("param", () => {
  it("should create a parameter definition", () => {
    const p = param("testParam", "string", {
      required: true,
      description: "A test parameter",
    });

    expect(p.name).toBe("testParam");
    expect(p.type).toBe("string");
    expect(p.required).toBe(true);
    expect(p.description).toBe("A test parameter");
  });

  it("should handle optional parameters", () => {
    const p = param("optional", "number", {
      required: false,
      default: 42,
    });

    expect(p.required).toBe(false);
    expect(p.default).toBe(42);
  });
});

// ============================================================================
// Global Registry Tests (with built-in functions loaded)
// ============================================================================

describe("global registry with built-in functions", () => {
  // Import the global registry which includes side effects
  it("should have core functions registered", async () => {
    const { registry } = await import("../index");

    expect(registry.has("core.start")).toBe(true);
    expect(registry.has("core.end")).toBe(true);
    expect(registry.has("core.log")).toBe(true);
    expect(registry.has("core.passthrough")).toBe(true);
    expect(registry.has("core.setValue")).toBe(true);
  });

  it("should have transform functions registered", async () => {
    const { registry } = await import("../index");

    expect(registry.has("transform.jsonParse")).toBe(true);
    expect(registry.has("transform.jsonStringify")).toBe(true);
    expect(registry.has("transform.map")).toBe(true);
    expect(registry.has("transform.template")).toBe(true);
  });

  it("should have control functions registered", async () => {
    const { registry } = await import("../index");

    expect(registry.has("control.condition")).toBe(true);
    expect(registry.has("control.switch")).toBe(true);
    expect(registry.has("control.counter")).toBe(true);
  });

  it("should have http functions registered", async () => {
    const { registry } = await import("../index");

    expect(registry.has("http.request")).toBe(true);
    expect(registry.has("http.get")).toBe(true);
    expect(registry.has("http.post")).toBe(true);
  });
});
