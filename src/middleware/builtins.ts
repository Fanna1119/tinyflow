/**
 * Built-in Middleware
 *
 * Registers commonly-needed middleware out of the box:
 *   - auth.tokenRequired  — abort unless an API token env var is set
 *   - auth.envRequired    — abort unless specified env vars are present
 *   - logging.nodeTimer   — logs wall-clock time for each node
 *   - guard.readonlyStore — prevents nodes from mutating the store
 */

import { middlewareRegistry } from "./registry";
import type { RegisteredMiddleware } from "./types";

// ============================================================================
// auth.tokenRequired
// ============================================================================

const authTokenRequired: RegisteredMiddleware = {
  id: "auth.tokenRequired",
  name: "API Token Required",
  description:
    "Aborts execution unless the env var specified by params.tokenEnvKey " +
    "(default 'API_TOKEN') is set and non-empty.",
  category: "auth",
  execute: async (ctx, next) => {
    const envKey = (ctx.params.tokenEnvKey as string) || "API_TOKEN";
    const token = ctx.env[envKey];
    if (!token) {
      ctx.log(`[middleware] auth.tokenRequired: missing ${envKey}`);
      return {
        output: null,
        success: false,
        error: `Authentication required: environment variable "${envKey}" is not set`,
      };
    }
    return next();
  },
};

// ============================================================================
// auth.envRequired
// ============================================================================

const authEnvRequired: RegisteredMiddleware = {
  id: "auth.envRequired",
  name: "Environment Variables Required",
  description:
    "Aborts execution unless ALL env vars listed in params.requiredEnvVars are set.",
  category: "auth",
  execute: async (ctx, next) => {
    const requiredKeys = (ctx.params.requiredEnvVars as string[]) ?? [];
    const missing = requiredKeys.filter((k) => !ctx.env[k]);
    if (missing.length > 0) {
      ctx.log(
        `[middleware] auth.envRequired: missing env vars: ${missing.join(", ")}`,
      );
      return {
        output: null,
        success: false,
        error: `Missing required environment variables: ${missing.join(", ")}`,
      };
    }
    return next();
  },
};

// ============================================================================
// logging.nodeTimer
// ============================================================================

const loggingNodeTimer: RegisteredMiddleware = {
  id: "logging.nodeTimer",
  name: "Node Timer",
  description: "Logs wall-clock duration of each node execution.",
  category: "logging",
  execute: async (ctx, next) => {
    const start = Date.now();
    const result = await next();
    const elapsed = Date.now() - start;
    ctx.log(`[middleware] ${ctx.nodeId} took ${elapsed}ms`);
    return result;
  },
};

// ============================================================================
// guard.readonlyStore
// ============================================================================

const guardReadonlyStore: RegisteredMiddleware = {
  id: "guard.readonlyStore",
  name: "Read-Only Store Guard",
  description:
    "Prevents downstream node from writing to the shared store. " +
    "Useful for pure-function validation steps.",
  category: "guard",
  execute: async (ctx, next) => {
    // Snapshot keys before execution
    const keysBefore = new Set(ctx.store.keys());
    const snapshot = new Map<string, unknown>();
    for (const [k, v] of ctx.store.entries()) {
      snapshot.set(k, v);
    }

    const result = await next();

    // Restore any mutations
    for (const [k, v] of snapshot.entries()) {
      ctx.store.set(k, v);
    }
    // Remove any new keys
    for (const k of ctx.store.keys()) {
      if (!keysBefore.has(k)) {
        ctx.store.delete(k);
      }
    }

    return result;
  },
};

// ============================================================================
// Register all
// ============================================================================

middlewareRegistry.register(authTokenRequired);
middlewareRegistry.register(authEnvRequired);
middlewareRegistry.register(loggingNodeTimer);
middlewareRegistry.register(guardReadonlyStore);
