import { registerFunction, param } from "../../registry";
import { memoryStore } from "./shared";

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
