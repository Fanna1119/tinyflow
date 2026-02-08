import { registerFunction, param } from "../../registry";
import { memoryStore } from "./shared";

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
