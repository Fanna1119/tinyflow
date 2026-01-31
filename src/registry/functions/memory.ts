/**
 * Built-in Functions: Memory
 * In-memory key-value storage (Redis-like) for workflow state
 */

import { registerFunction, param } from "../registry";

// Global in-memory store (persists across workflow runs in same process)
const memoryStore = new Map<string, { value: unknown; expiresAt?: number }>();

// ============================================================================
// Memory Set
// ============================================================================

registerFunction(
  {
    id: "memory.set",
    name: "Memory Set",
    description: "Stores a value in persistent memory with optional TTL.",
    category: "Memory",
    params: [
      param("memoryKey", "string", {
        required: true,
        description: "Key to store the value under in memory",
      }),
      param("valueKey", "string", {
        required: true,
        description: "Key in workflow store containing the value to persist",
      }),
      param("ttl", "number", {
        required: false,
        description: "Time-to-live in seconds (optional)",
      }),
    ],
    outputs: [],
    icon: "Database",
  },
  async (params, context) => {
    const memoryKey = params.memoryKey as string;
    const valueKey = params.valueKey as string;
    const ttl = params.ttl as number | undefined;

    const value = context.store.get(valueKey);

    const entry: { value: unknown; expiresAt?: number } = { value };
    if (ttl && ttl > 0) {
      entry.expiresAt = Date.now() + ttl * 1000;
    }

    memoryStore.set(memoryKey, entry);
    context.log(`Memory SET: ${memoryKey}${ttl ? ` (TTL: ${ttl}s)` : ""}`);

    return { output: value, success: true };
  },
);

// ============================================================================
// Memory Get
// ============================================================================

registerFunction(
  {
    id: "memory.get",
    name: "Memory Get",
    description: "Retrieves a value from persistent memory.",
    category: "Memory",
    params: [
      param("memoryKey", "string", {
        required: true,
        description: "Key to retrieve from memory",
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key in workflow store to save the retrieved value",
      }),
      param("defaultValue", "object", {
        required: false,
        description: "Default value if key not found or expired",
      }),
    ],
    outputs: ["outputKey"],
    icon: "Database",
  },
  async (params, context) => {
    const memoryKey = params.memoryKey as string;
    const outputKey = params.outputKey as string;
    const defaultValue = params.defaultValue;

    const entry = memoryStore.get(memoryKey);

    // Check if expired
    if (entry && entry.expiresAt && Date.now() > entry.expiresAt) {
      memoryStore.delete(memoryKey);
      context.log(`Memory GET: ${memoryKey} (expired)`);
      context.store.set(outputKey, defaultValue ?? null);
      return { output: defaultValue ?? null, success: true };
    }

    const value = entry?.value ?? defaultValue ?? null;
    context.store.set(outputKey, value);
    context.log(
      `Memory GET: ${memoryKey} = ${JSON.stringify(value)?.substring(0, 50)}`,
    );

    return { output: value, success: true };
  },
);

// ============================================================================
// Memory Delete
// ============================================================================

registerFunction(
  {
    id: "memory.delete",
    name: "Memory Delete",
    description: "Deletes a value from persistent memory.",
    category: "Memory",
    params: [
      param("memoryKey", "string", {
        required: true,
        description: "Key to delete from memory",
      }),
    ],
    outputs: [],
    icon: "Trash2",
  },
  async (params, context) => {
    const memoryKey = params.memoryKey as string;

    const existed = memoryStore.delete(memoryKey);
    context.log(
      `Memory DELETE: ${memoryKey} (${existed ? "deleted" : "not found"})`,
    );

    return { output: existed, success: true };
  },
);

// ============================================================================
// Memory Exists
// ============================================================================

registerFunction(
  {
    id: "memory.exists",
    name: "Memory Exists",
    description: "Checks if a key exists in persistent memory.",
    category: "Memory",
    params: [
      param("memoryKey", "string", {
        required: true,
        description: "Key to check in memory",
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key in workflow store to save the boolean result",
      }),
    ],
    outputs: ["outputKey"],
    icon: "Search",
  },
  async (params, context) => {
    const memoryKey = params.memoryKey as string;
    const outputKey = params.outputKey as string;

    const entry = memoryStore.get(memoryKey);

    // Check if expired
    if (entry && entry.expiresAt && Date.now() > entry.expiresAt) {
      memoryStore.delete(memoryKey);
      context.store.set(outputKey, false);
      return { output: false, success: true };
    }

    const exists = memoryStore.has(memoryKey);
    context.store.set(outputKey, exists);
    context.log(`Memory EXISTS: ${memoryKey} = ${exists}`);

    return {
      output: exists,
      action: exists ? "success" : "error",
      success: true,
    };
  },
);

// ============================================================================
// Memory Clear (utility for testing)
// ============================================================================

registerFunction(
  {
    id: "memory.clear",
    name: "Memory Clear",
    description: "Clears all values from persistent memory.",
    category: "Memory",
    params: [],
    outputs: [],
    icon: "Trash",
  },
  async (_params, context) => {
    const count = memoryStore.size;
    memoryStore.clear();
    context.log(`Memory CLEAR: ${count} entries removed`);

    return { output: count, success: true };
  },
);
