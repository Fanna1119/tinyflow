/**
 * Middleware Tests
 *
 * Tests the middleware system:
 *   - composer (chaining, short-circuit, param mutation)
 *   - registry (register, resolve, categories)
 *   - built-in middleware (auth, logging, guard)
 *   - integration with runtime
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { composeMiddleware } from "../composer";
import { middlewareRegistry } from "../registry";
import type {
  MiddlewareFunction,
  MiddlewareContext,
  RegisteredMiddleware,
} from "../types";
import type {
  ExecutableFunction,
  FunctionResult,
} from "../../registry/registry";
import { Runtime } from "../../runtime/runtime";
import type { WorkflowDefinition } from "../../schema/types";

// ============================================================================
// Helpers
// ============================================================================

/** Simple target function that echoes params */
const echoFn: ExecutableFunction = async (params, _ctx) => ({
  output: params,
  success: true,
});

/** Target function that reads from store */
const storeFn: ExecutableFunction = async (_params, ctx) => ({
  output: ctx.store.get("data"),
  success: true,
});

function makeContext(
  overrides: Partial<MiddlewareContext> = {},
): MiddlewareContext {
  return {
    nodeId: "test-node",
    store: new Map(),
    env: {},
    log: vi.fn(),
    functionId: "test.fn",
    params: {},
    ...overrides,
  };
}

// ============================================================================
// Composer Tests
// ============================================================================

describe("composeMiddleware", () => {
  it("returns target function when no middleware", () => {
    const composed = composeMiddleware([], echoFn, "test.fn");
    expect(composed).toBe(echoFn); // exact same reference
  });

  it("chains middleware in order", async () => {
    const order: string[] = [];

    const mw1: MiddlewareFunction = async (_ctx, next) => {
      order.push("mw1-before");
      const result = await next();
      order.push("mw1-after");
      return result;
    };

    const mw2: MiddlewareFunction = async (_ctx, next) => {
      order.push("mw2-before");
      const result = await next();
      order.push("mw2-after");
      return result;
    };

    const composed = composeMiddleware([mw1, mw2], echoFn, "test.fn");
    const result = await composed({ foo: 1 }, makeContext());

    expect(result.success).toBe(true);
    expect(order).toEqual([
      "mw1-before",
      "mw2-before",
      "mw2-after",
      "mw1-after",
    ]);
  });

  it("allows middleware to short-circuit", async () => {
    const blocker: MiddlewareFunction = async (_ctx, _next) => ({
      output: null,
      success: false,
      error: "Blocked!",
    });

    const neverCalled = vi.fn(echoFn);
    const composed = composeMiddleware([blocker], neverCalled, "test.fn");
    const result = await composed({}, makeContext());

    expect(result.success).toBe(false);
    expect(result.error).toBe("Blocked!");
    expect(neverCalled).not.toHaveBeenCalled();
  });

  it("allows middleware to mutate params", async () => {
    const inject: MiddlewareFunction = async (ctx, next) => {
      ctx.params.injected = true;
      return next();
    };

    const composed = composeMiddleware([inject], echoFn, "test.fn");
    const result = await composed({ original: true }, makeContext());

    expect(result.output).toEqual({ original: true, injected: true });
  });

  it("allows middleware to transform results", async () => {
    const transform: MiddlewareFunction = async (_ctx, next) => {
      const result = await next();
      return { ...result, output: { wrapped: result.output } };
    };

    const composed = composeMiddleware([transform], echoFn, "test.fn");
    const result = await composed({ v: 1 }, makeContext());

    expect(result.output).toEqual({ wrapped: { v: 1 } });
  });

  it("rejects calling next() multiple times", async () => {
    const doubleNext: MiddlewareFunction = async (_ctx, next) => {
      await next();
      return next(); // second call should reject
    };

    const composed = composeMiddleware([doubleNext], echoFn, "test.fn");
    await expect(composed({}, makeContext())).rejects.toThrow(
      "next() called multiple times",
    );
  });

  it("passes correct functionId to middleware context", async () => {
    let capturedId = "";
    const spy: MiddlewareFunction = async (ctx, next) => {
      capturedId = ctx.functionId;
      return next();
    };

    const composed = composeMiddleware([spy], echoFn, "my.special.fn");
    await composed({}, makeContext());
    expect(capturedId).toBe("my.special.fn");
  });
});

// ============================================================================
// Registry Tests
// ============================================================================

describe("middlewareRegistry", () => {
  const testMw: RegisteredMiddleware = {
    id: "test.noop",
    name: "Test Noop",
    description: "Does nothing",
    category: "test",
    execute: async (_ctx, next) => next(),
  };

  it("registers and retrieves middleware", () => {
    middlewareRegistry.register(testMw);
    expect(middlewareRegistry.has("test.noop")).toBe(true);
    expect(middlewareRegistry.get("test.noop")).toEqual(testMw);
  });

  it("returns executable function", () => {
    middlewareRegistry.register(testMw);
    const fn = middlewareRegistry.getExecutable("test.noop");
    expect(fn).toBe(testMw.execute);
  });

  it("resolves ordered list", () => {
    const mw2: RegisteredMiddleware = {
      id: "test.two",
      name: "Two",
      description: "",
      category: "test",
      execute: async (_ctx, next) => next(),
    };
    middlewareRegistry.register(testMw);
    middlewareRegistry.register(mw2);

    const resolved = middlewareRegistry.resolve(["test.two", "test.noop"]);
    expect(resolved).toHaveLength(2);
    expect(resolved[0]).toBe(mw2.execute);
    expect(resolved[1]).toBe(testMw.execute);
  });

  it("skips unknown IDs during resolve", () => {
    middlewareRegistry.register(testMw);
    const resolved = middlewareRegistry.resolve([
      "test.noop",
      "does.not.exist",
    ]);
    expect(resolved).toHaveLength(1);
  });

  it("returns middleware grouped by category", () => {
    middlewareRegistry.register(testMw);
    const cats = middlewareRegistry.getByCategory();
    expect(cats.get("test")).toBeDefined();
    expect(cats.get("test")!.some((m) => m.id === "test.noop")).toBe(true);
  });

  it("lists all middleware IDs", () => {
    middlewareRegistry.register(testMw);
    const ids = middlewareRegistry.getIds();
    expect(ids.has("test.noop")).toBe(true);
  });
});

// ============================================================================
// Built-in Middleware Tests
// ============================================================================

describe("built-in middleware", () => {
  // Ensure builtins are loaded
  beforeEach(async () => {
    await import("../builtins");
  });

  describe("auth.tokenRequired", () => {
    it("blocks when env var is missing", async () => {
      const mw = middlewareRegistry.getExecutable("auth.tokenRequired")!;
      expect(mw).toBeDefined();

      const ctx = makeContext({ env: {} });
      const next = vi.fn();
      const result = await mw(ctx, next);

      expect(result.success).toBe(false);
      expect(result.error).toContain("API_TOKEN");
      expect(next).not.toHaveBeenCalled();
    });

    it("passes when env var is set", async () => {
      const mw = middlewareRegistry.getExecutable("auth.tokenRequired")!;
      const ctx = makeContext({ env: { API_TOKEN: "secret" } });
      const next = vi.fn().mockResolvedValue({ output: "ok", success: true });
      const result = await mw(ctx, next);

      expect(result.success).toBe(true);
      expect(next).toHaveBeenCalledOnce();
    });

    it("uses custom env key from params", async () => {
      const mw = middlewareRegistry.getExecutable("auth.tokenRequired")!;
      const ctx = makeContext({
        env: { MY_KEY: "val" },
        params: { tokenEnvKey: "MY_KEY" },
      });
      const next = vi.fn().mockResolvedValue({ output: "ok", success: true });
      const result = await mw(ctx, next);

      expect(result.success).toBe(true);
    });
  });

  describe("auth.envRequired", () => {
    it("blocks when required env vars are missing", async () => {
      const mw = middlewareRegistry.getExecutable("auth.envRequired")!;
      const ctx = makeContext({
        env: { A: "1" },
        params: { requiredEnvVars: ["A", "B", "C"] },
      });
      const next = vi.fn();
      const result = await mw(ctx, next);

      expect(result.success).toBe(false);
      expect(result.error).toContain("B");
      expect(result.error).toContain("C");
      expect(next).not.toHaveBeenCalled();
    });

    it("passes when all required env vars are present", async () => {
      const mw = middlewareRegistry.getExecutable("auth.envRequired")!;
      const ctx = makeContext({
        env: { A: "1", B: "2" },
        params: { requiredEnvVars: ["A", "B"] },
      });
      const next = vi.fn().mockResolvedValue({ output: "ok", success: true });
      const result = await mw(ctx, next);

      expect(result.success).toBe(true);
    });
  });

  describe("logging.nodeTimer", () => {
    it("logs duration and passes through result", async () => {
      const mw = middlewareRegistry.getExecutable("logging.nodeTimer")!;
      const logFn = vi.fn();
      const ctx = makeContext({ log: logFn, nodeId: "my-node" });
      const next = vi.fn().mockResolvedValue({ output: 42, success: true });

      const result = await mw(ctx, next);

      expect(result.success).toBe(true);
      expect(result.output).toBe(42);
      expect(logFn).toHaveBeenCalledWith(
        expect.stringContaining("[middleware] my-node took"),
      );
    });
  });

  describe("guard.readonlyStore", () => {
    it("reverts store mutations", async () => {
      const mw = middlewareRegistry.getExecutable("guard.readonlyStore")!;
      const store = new Map<string, unknown>([["key1", "original"]]);
      const ctx = makeContext({ store });

      const next = vi.fn().mockImplementation(async () => {
        // Simulate node writing to store
        store.set("key1", "mutated");
        store.set("newKey", "added");
        return { output: "done", success: true };
      });

      const result = await mw(ctx, next);

      expect(result.success).toBe(true);
      expect(store.get("key1")).toBe("original");
      expect(store.has("newKey")).toBe(false);
    });
  });
});

// ============================================================================
// Integration: Middleware with Runtime
// ============================================================================

describe("middleware runtime integration", () => {
  function createWorkflow(
    overrides: Partial<WorkflowDefinition> = {},
  ): WorkflowDefinition {
    return {
      id: "mw-test",
      name: "Middleware Test",
      version: "1.0.0",
      nodes: [
        {
          id: "start",
          functionId: "core.start",
          params: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "set",
          functionId: "core.setValue",
          params: { key: "result", value: "hello" },
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
        { from: "start", to: "set", action: "default" },
        { from: "set", to: "end", action: "default" },
      ],
      flow: { startNodeId: "start" },
      ...overrides,
    };
  }

  it("runs workflow normally without middleware", async () => {
    const workflow = createWorkflow();
    const result = await Runtime.run(workflow);

    expect(result.success).toBe(true);
    expect(result.store.data.get("result")).toBe("hello");
  });

  it("applies logging middleware to workflow execution", async () => {
    const workflow = createWorkflow({
      flow: {
        startNodeId: "start",
        middleware: ["logging.nodeTimer"],
      },
    });

    const result = await Runtime.run(workflow);

    expect(result.success).toBe(true);
    // Timer middleware adds timing logs
    const hasTimerLog = result.logs.some(
      (l) => l.includes("[middleware]") && l.includes("took"),
    );
    expect(hasTimerLog).toBe(true);
  });

  it("auth middleware blocks execution without token", async () => {
    const workflow = createWorkflow({
      flow: {
        startNodeId: "start",
        middleware: ["auth.tokenRequired"],
      },
    });

    const result = await Runtime.run(workflow);

    // Should fail because API_TOKEN env var is not set
    expect(result.success).toBe(false);
  });

  it("auth middleware passes with token set", async () => {
    const workflow = createWorkflow({
      flow: {
        startNodeId: "start",
        middleware: ["auth.tokenRequired"],
      },
    });

    const result = await Runtime.run(workflow, {
      env: { API_TOKEN: "my-secret-token" },
    });

    expect(result.success).toBe(true);
    expect(result.store.data.get("result")).toBe("hello");
  });

  it("stacks multiple middleware in order", async () => {
    const workflow = createWorkflow({
      flow: {
        startNodeId: "start",
        middleware: ["auth.tokenRequired", "logging.nodeTimer"],
      },
    });

    const result = await Runtime.run(workflow, {
      env: { API_TOKEN: "token123" },
    });

    expect(result.success).toBe(true);
    expect(result.store.data.get("result")).toBe("hello");
    const hasTimerLog = result.logs.some(
      (l) => l.includes("[middleware]") && l.includes("took"),
    );
    expect(hasTimerLog).toBe(true);
  });

  it("ignores unknown middleware IDs gracefully", async () => {
    const workflow = createWorkflow({
      flow: {
        startNodeId: "start",
        middleware: ["nonexistent.middleware"],
      },
    });

    // Should still succeed — unknown middleware is skipped with a warning
    const result = await Runtime.run(workflow);
    expect(result.success).toBe(true);
    expect(result.store.data.get("result")).toBe("hello");
  });
});
