import { registerFunction, param } from "../../registry";
import { memoryStore } from "./shared";

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
