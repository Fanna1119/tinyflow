/**
 * Middleware Types
 *
 * Middleware follows a Koa-style async (ctx, next) pattern.
 * Each middleware receives the execution context and a `next` function
 * to delegate to the next middleware (or the actual node function).
 *
 * Middleware can:
 * - Augment context (add headers, user info, etc.)
 * - Short-circuit by returning a FunctionResult without calling next()
 * - Transform results by modifying what next() returns
 * - Log, meter, or enforce policies
 */

import type { ExecutionContext, FunctionResult } from "../registry/registry";

// ============================================================================
// Middleware Context — superset of ExecutionContext
// ============================================================================

/**
 * Context passed to middleware. Extends ExecutionContext with
 * the current node's params and function ID so middleware can
 * inspect and modify them.
 */
export interface MiddlewareContext extends ExecutionContext {
  /** The function ID about to execute */
  functionId: string;
  /** The node params (mutable — middleware may modify) */
  params: Record<string, unknown>;
}

/**
 * Next function — calls the next middleware or the real node function
 */
export type NextFunction = () => Promise<FunctionResult>;

/**
 * Middleware function signature (Koa-style)
 */
export type MiddlewareFunction = (
  ctx: MiddlewareContext,
  next: NextFunction,
) => Promise<FunctionResult>;

/**
 * Registered middleware entry
 */
export interface RegisteredMiddleware {
  /** Unique identifier (e.g., 'auth.token', 'logging.requests') */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** Category for grouping in UI */
  category: string;
  /** The middleware implementation */
  execute: MiddlewareFunction;
}
