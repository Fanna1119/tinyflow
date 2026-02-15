/**
 * Middleware Registry
 *
 * Manages registered middleware separately from functions.
 * Middleware is looked up by ID from the flow's `middleware` array.
 */

import type { RegisteredMiddleware, MiddlewareFunction } from "./types";

class MiddlewareRegistry {
  private middlewares = new Map<string, RegisteredMiddleware>();

  /** Register a middleware */
  register(mw: RegisteredMiddleware): void {
    if (this.middlewares.has(mw.id)) {
      console.warn(`Middleware "${mw.id}" is being overwritten`);
    }
    this.middlewares.set(mw.id, mw);
  }

  /** Get a middleware by ID */
  get(id: string): RegisteredMiddleware | undefined {
    return this.middlewares.get(id);
  }

  /** Get the executable middleware function */
  getExecutable(id: string): MiddlewareFunction | undefined {
    return this.middlewares.get(id)?.execute;
  }

  /** Check if a middleware is registered */
  has(id: string): boolean {
    return this.middlewares.has(id);
  }

  /** Get all registered middleware IDs */
  getIds(): Set<string> {
    return new Set(this.middlewares.keys());
  }

  /** Get all middleware metadata */
  getAll(): RegisteredMiddleware[] {
    return Array.from(this.middlewares.values());
  }

  /** Get middleware grouped by category */
  getByCategory(): Map<string, RegisteredMiddleware[]> {
    const byCategory = new Map<string, RegisteredMiddleware[]>();
    for (const mw of this.middlewares.values()) {
      const list = byCategory.get(mw.category) ?? [];
      list.push(mw);
      byCategory.set(mw.category, list);
    }
    return byCategory;
  }

  /** Resolve an ordered list of middleware IDs to executable functions */
  resolve(ids: string[]): MiddlewareFunction[] {
    const resolved: MiddlewareFunction[] = [];
    for (const id of ids) {
      const fn = this.getExecutable(id);
      if (fn) {
        resolved.push(fn);
      } else {
        console.warn(`Middleware "${id}" not found in registry, skipping`);
      }
    }
    return resolved;
  }

  /** Clear all registrations */
  clear(): void {
    this.middlewares.clear();
  }

  /** Count of registered middleware */
  get size(): number {
    return this.middlewares.size;
  }
}

/** Global middleware registry instance */
export const middlewareRegistry = new MiddlewareRegistry();
