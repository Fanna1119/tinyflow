/**
 * Middleware Composer
 *
 * Composes an ordered list of middleware functions into a single
 * function that wraps the original node function. Uses Koa-style
 * `async (ctx, next) => ...` chaining.
 *
 * Usage:
 *   const composed = compose(middlewares, originalFn);
 *   const result = await composed(params, executionContext);
 */

import type { ExecutableFunction, FunctionResult } from "../registry/registry";
import type {
  MiddlewareFunction,
  MiddlewareContext,
  NextFunction,
} from "./types";

/**
 * Compose middleware array + target function into a single ExecutableFunction.
 *
 * Execution order for [mw1, mw2, mw3]:
 *   mw1 → mw2 → mw3 → targetFn
 *
 * Each middleware calls `next()` to proceed; if it doesn't, the chain
 * short-circuits and the returned FunctionResult is used.
 */
export function composeMiddleware(
  middlewares: MiddlewareFunction[],
  targetFn: ExecutableFunction,
  functionId: string,
): ExecutableFunction {
  if (middlewares.length === 0) {
    return targetFn;
  }

  return async (params, context): Promise<FunctionResult> => {
    // Build the middleware context (superset of ExecutionContext)
    const mwCtx: MiddlewareContext = {
      ...context,
      functionId,
      params: { ...params },
    };

    let index = -1;

    const dispatch = (i: number): Promise<FunctionResult> => {
      if (i <= index) {
        return Promise.reject(new Error("next() called multiple times"));
      }
      index = i;

      if (i < middlewares.length) {
        const mw = middlewares[i];
        const next: NextFunction = () => dispatch(i + 1);
        return mw(mwCtx, next);
      }

      // End of middleware chain — call the actual node function
      // Pass potentially-modified params from middleware context
      return targetFn(mwCtx.params, context);
    };

    return dispatch(0);
  };
}
