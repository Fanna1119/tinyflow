/**
 * Middleware Module
 *
 * Provides a pluggable middleware layer for TinyFlow workflows.
 * Middleware functions wrap node execution with Koa-style async (ctx, next) chains.
 *
 * Usage:
 *   import { middlewareRegistry, composeMiddleware } from './middleware';
 *
 *   // Register middleware
 *   middlewareRegistry.register({ id: 'auth.token', ... });
 *
 *   // Add to workflow
 *   workflow.flow.middleware = ['auth.token', 'logging.requests'];
 */

// Types
export type {
  MiddlewareContext,
  MiddlewareFunction,
  NextFunction,
  RegisteredMiddleware,
} from "./types";

// Registry
export { middlewareRegistry } from "./registry";

// Composer
export { composeMiddleware } from "./composer";

// Built-in middleware (side-effect: registers on import)
import "./builtins";
