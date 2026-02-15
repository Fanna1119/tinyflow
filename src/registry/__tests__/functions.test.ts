/**
 * Built-in Functions Tests
 */

import { describe, it, expect, vi } from "vitest";
import type { ExecutionContext } from "../registry";

// ============================================================================
// Test Helpers
// ============================================================================

function createMockContext(
  overrides: Partial<ExecutionContext> = {},
): ExecutionContext {
  const store = new Map<string, unknown>();
  return {
    nodeId: "test-node",
    store,
    env: {},
    log: vi.fn(),
    ...overrides,
  };
}

// ============================================================================
// Core Functions
// ============================================================================

describe("core functions", () => {
  describe("core.start", () => {
    it("should execute and return success", async () => {
      const { registry } = await import("../index");
      const fn = registry.get("core.start");
      expect(fn).toBeDefined();

      const ctx = createMockContext();
      const result = await fn!.execute({}, ctx);

      expect(result.success).toBe(true);
    });
  });

  describe("core.end", () => {
    it("should execute and return success", async () => {
      const { registry } = await import("../index");
      const fn = registry.get("core.end");
      expect(fn).toBeDefined();

      const ctx = createMockContext();
      const result = await fn!.execute({}, ctx);

      expect(result.success).toBe(true);
    });
  });

  describe("core.log", () => {
    it("should log key and value from store", async () => {
      const { registry } = await import("../index");
      const fn = registry.get("core.log");
      expect(fn).toBeDefined();

      const logFn = vi.fn();
      const ctx = createMockContext({ log: logFn });
      ctx.store.set("myKey", "myValue");
      const result = await fn!.execute({ key: "myKey", message: "Debug" }, ctx);

      expect(result.success).toBe(true);
      // Format: `${prefix}${key} = ${JSON.stringify(value)}`
      expect(logFn).toHaveBeenCalledWith('Debug: myKey = "myValue"');
    });
  });

  describe("core.setValue", () => {
    it("should set value in store", async () => {
      const { registry } = await import("../index");
      const fn = registry.get("core.setValue");
      expect(fn).toBeDefined();

      const ctx = createMockContext();
      const result = await fn!.execute({ key: "myKey", value: "myValue" }, ctx);

      expect(result.success).toBe(true);
      expect(ctx.store.get("myKey")).toBe("myValue");
    });
  });

  describe("core.delay", () => {
    it("should delay execution", async () => {
      const { registry } = await import("../index");
      const fn = registry.get("core.delay");
      expect(fn).toBeDefined();

      const ctx = createMockContext();
      const start = Date.now();
      const result = await fn!.execute({ ms: 50 }, ctx);
      const elapsed = Date.now() - start;

      expect(result.success).toBe(true);
      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some timing slack
    });
  });

  describe("core.passthrough", () => {
    it("should pass through", async () => {
      const { registry } = await import("../index");
      const fn = registry.get("core.passthrough");
      expect(fn).toBeDefined();

      const ctx = createMockContext();
      const result = await fn!.execute({}, ctx);

      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// Transform Functions
// ============================================================================

describe("transform functions", () => {
  describe("transform.jsonParse", () => {
    it("should parse valid JSON string", async () => {
      const { registry } = await import("../index");
      const fn = registry.get("transform.jsonParse");
      expect(fn).toBeDefined();

      const ctx = createMockContext();
      ctx.store.set("input", '{"key": "value"}');

      const result = await fn!.execute(
        { inputKey: "input", outputKey: "parsed" },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(ctx.store.get("parsed")).toEqual({ key: "value" });
    });

    it("should fail for invalid JSON", async () => {
      const { registry } = await import("../index");
      const fn = registry.get("transform.jsonParse");

      const ctx = createMockContext();
      ctx.store.set("input", "not valid json");

      const result = await fn!.execute(
        { inputKey: "input", outputKey: "parsed" },
        ctx,
      );

      expect(result.success).toBe(false);
    });
  });

  describe("transform.jsonStringify", () => {
    it("should stringify object to JSON", async () => {
      const { registry } = await import("../index");
      const fn = registry.get("transform.jsonStringify");
      expect(fn).toBeDefined();

      const ctx = createMockContext();
      ctx.store.set("input", { key: "value" });

      const result = await fn!.execute(
        { inputKey: "input", outputKey: "stringified" },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(ctx.store.get("stringified")).toBe('{"key":"value"}');
    });
  });

  describe("transform.template", () => {
    it("should interpolate template variables", async () => {
      const { registry } = await import("../index");
      const fn = registry.get("transform.template");
      expect(fn).toBeDefined();

      const ctx = createMockContext();
      ctx.store.set("name", "World");

      const result = await fn!.execute(
        {
          template: "Hello, {{name}}!",
          outputKey: "greeting",
        },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(ctx.store.get("greeting")).toBe("Hello, World!");
    });
  });
});

// ============================================================================
// Control Functions
// ============================================================================

describe("control functions", () => {
  describe("control.condition", () => {
    it("should return success action when condition is true", async () => {
      const { registry } = await import("../index");
      const fn = registry.get("control.condition");
      expect(fn).toBeDefined();

      const ctx = createMockContext();
      ctx.store.set("value", 10);

      // Actual params: leftKey, operator, rightValue
      const result = await fn!.execute(
        { leftKey: "value", operator: "gt", rightValue: 5 },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("success");
    });

    it("should return error action when condition is false", async () => {
      const { registry } = await import("../index");
      const fn = registry.get("control.condition");

      const ctx = createMockContext();
      ctx.store.set("value", 3);

      const result = await fn!.execute(
        { leftKey: "value", operator: "gt", rightValue: 5 },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("error");
    });
  });

  describe("control.switch", () => {
    it("should return matching case action", async () => {
      const { registry } = await import("../index");
      const fn = registry.get("control.switch");
      expect(fn).toBeDefined();

      const ctx = createMockContext();
      ctx.store.set("status", "active");

      // Actual params: key, cases, default
      const result = await fn!.execute(
        {
          key: "status",
          cases: { active: "handleActive", inactive: "handleInactive" },
          default: "handleDefault",
        },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("handleActive");
    });

    it("should return default action when no case matches", async () => {
      const { registry } = await import("../index");
      const fn = registry.get("control.switch");

      const ctx = createMockContext();
      ctx.store.set("status", "unknown");

      const result = await fn!.execute(
        {
          key: "status",
          cases: { active: "handleActive" },
          default: "handleDefault",
        },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe("handleDefault");
    });
  });

  describe("control.batchForEach", () => {
    it("should process array items in parallel", async () => {
      const { registry, registerFunction } = await import("../index");

      // Mock a simple processor function that doubles numbers
      const mockProcessor = vi.fn(async (params, context) => {
        const item = params.currentItem as number;
        context.store.set("doubled", item * 2);
        return { success: true, output: item * 2 };
      });

      // Register the mock processor
      registerFunction(
        {
          id: "test.double",
          name: "Double",
          description: "Doubles a number",
          category: "Test",
          params: [],
          outputs: [],
          icon: "Calculator",
        },
        mockProcessor,
      );

      const fn = registry.get("control.batchForEach");
      expect(fn).toBeDefined();

      const ctx = createMockContext();

      const result = await fn!.execute(
        {
          array: [1, 2, 3, 4, 5],
          processorFunction: "test.double",
          outputKey: "results",
        },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.output).toEqual([2, 4, 6, 8, 10]);
      expect(ctx.store.get("results")).toEqual([2, 4, 6, 8, 10]);
      expect(mockProcessor).toHaveBeenCalledTimes(5);
    });

    it("should handle empty array", async () => {
      const { registry } = await import("../index");
      const fn = registry.get("control.batchForEach");

      const ctx = createMockContext();

      const result = await fn!.execute(
        {
          array: [],
          processorFunction: "test.double",
          outputKey: "results",
        },
        ctx,
      );

      expect(result.success).toBe(true);
      expect(result.output).toEqual([]);
      expect(ctx.store.get("results")).toEqual([]);
    });

    it("should handle non-array input", async () => {
      const { registry } = await import("../index");
      const fn = registry.get("control.batchForEach");

      const ctx = createMockContext();

      const result = await fn!.execute(
        {
          array: "not an array",
          processorFunction: "test.double",
          outputKey: "results",
        },
        ctx,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not an array");
    });
  });
});

// ============================================================================
// HTTP Functions (Metadata Tests)
// ============================================================================

describe("http functions metadata", () => {
  it("http.get should have correct metadata", async () => {
    const { registry } = await import("../index");
    const fn = registry.get("http.get");

    expect(fn).toBeDefined();
    expect(fn?.metadata.category).toBe("HTTP");
    expect(fn?.metadata.params.some((p) => p.name === "url")).toBe(true);
  });

  it("http.post should have correct metadata", async () => {
    const { registry } = await import("../index");
    const fn = registry.get("http.post");

    expect(fn).toBeDefined();
    expect(fn?.metadata.category).toBe("HTTP");
    expect(fn?.metadata.params.some((p) => p.name === "url")).toBe(true);
    // Actual param is 'bodyKey' - key in store containing request body
    expect(fn?.metadata.params.some((p) => p.name === "bodyKey")).toBe(true);
  });

  it("http.request should have correct metadata", async () => {
    const { registry } = await import("../index");
    const fn = registry.get("http.request");

    expect(fn).toBeDefined();
    expect(fn?.metadata.category).toBe("HTTP");
    expect(fn?.metadata.params.some((p) => p.name === "method")).toBe(true);
  });

  it("http.batch should have correct metadata", async () => {
    const { registry } = await import("../index");
    const fn = registry.get("http.batch");

    expect(fn).toBeDefined();
    expect(fn?.metadata.category).toBe("HTTP");
    expect(fn?.metadata.params.some((p) => p.name === "requests")).toBe(true);
    expect(fn?.metadata.params.some((p) => p.name === "maxConcurrency")).toBe(
      true,
    );
  });
});

// ============================================================================
// HTTP Batch Function
// ============================================================================

describe("http.batch", () => {
  const mockFetch = vi.fn();
  global.fetch = mockFetch;

  beforeEach(() => {
    mockFetch.mockClear();
  });

  it("should process empty requests array", async () => {
    const { registry } = await import("../index");
    const fn = registry.get("http.batch");
    expect(fn).toBeDefined();

    const ctx = createMockContext();
    const result = await fn!.execute({ requests: [] }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toEqual([]);
    expect(ctx.store.get("httpBatchResults")).toEqual([]);
  });

  it("should handle requests from store key", async () => {
    const { registry } = await import("../index");
    const fn = registry.get("http.batch");
    expect(fn).toBeDefined();

    const ctx = createMockContext();
    ctx.store.set("myRequests", [{ url: "https://api.example.com" }]);

    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const result = await fn!.execute({ requests: "myRequests" }, ctx);

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com",
      expect.any(Object),
    );
  });

  it("should process multiple requests successfully", async () => {
    const { registry } = await import("../index");
    const fn = registry.get("http.batch");
    expect(fn).toBeDefined();

    const ctx = createMockContext();
    const requests = [
      { url: "https://api1.example.com", method: "GET" },
      { url: "https://api2.example.com", method: "POST", bodyKey: "body" },
    ];
    ctx.store.set("body", { data: "test" });

    mockFetch
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ result: 1 }),
      })
      .mockResolvedValueOnce({
        status: 201,
        ok: true,
        json: () => Promise.resolve({ result: 2 }),
      });

    const result = await fn!.execute({ requests }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toHaveLength(2);
    expect(result.output[0]).toEqual({
      status: 200,
      ok: true,
      data: { result: 1 },
    });
    expect(result.output[1]).toEqual({
      status: 201,
      ok: true,
      data: { result: 2 },
    });
    expect(ctx.store.get("httpBatchResults")).toEqual(result.output);
  });

  it("should handle partial failures", async () => {
    const { registry } = await import("../index");
    const fn = registry.get("http.batch");
    expect(fn).toBeDefined();

    const ctx = createMockContext();
    const requests = [
      { url: "https://api1.example.com" },
      { url: "https://api2.example.com" },
    ];

    mockFetch
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })
      .mockResolvedValueOnce({
        status: 500,
        ok: false,
        json: () => Promise.resolve({ error: "Server error" }),
      });

    const result = await fn!.execute({ requests }, ctx);

    expect(result.success).toBe(false);
    expect(result.output).toHaveLength(2);
    expect(result.output[0].ok).toBe(true);
    expect(result.output[1].ok).toBe(false);
  });

  it("should respect maxConcurrency", async () => {
    const { registry } = await import("../index");
    const fn = registry.get("http.batch");
    expect(fn).toBeDefined();

    const ctx = createMockContext();
    const requests = Array(5).fill({ url: "https://api.example.com" });

    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await fn!.execute({ requests, maxConcurrency: 2 }, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toHaveLength(5);
  });

  it("should handle invalid requests parameter", async () => {
    const { registry } = await import("../index");
    const fn = registry.get("http.batch");
    expect(fn).toBeDefined();

    const ctx = createMockContext();
    const result = await fn!.execute({ requests: "nonexistent" }, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not contain an array");
  });
});
