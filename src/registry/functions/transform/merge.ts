import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "transform.merge",
    name: "Merge",
    description: "Merges multiple objects into one.",
    category: "Transform",
    params: [
      param("keys", "array", {
        required: true,
        description: "Array of keys to merge",
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store merged object",
      }),
    ],
    outputs: ["outputKey"],
    icon: "Merge",
  },
  async (params, context) => {
    const keys = params.keys as string[];
    const outputKey = params.outputKey as string;

    const merged: Record<string, unknown> = {};
    for (const key of keys) {
      const value = context.store.get(key);
      if (typeof value === "object" && value !== null) {
        Object.assign(merged, value);
      }
    }

    context.store.set(outputKey, merged);
    context.log(`Merged [${keys.join(", ")}] into "${outputKey}"`);
    return { output: merged, success: true };
  },
);
