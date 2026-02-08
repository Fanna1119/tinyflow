import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "transform.map",
    name: "Map",
    description: "Extracts a nested value using a dot-notation path.",
    category: "Transform",
    params: [
      param("inputKey", "string", {
        required: true,
        description: "Key containing source object",
      }),
      param("path", "string", {
        required: true,
        description: 'Dot-notation path (e.g., "data.items[0].name")',
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store extracted value",
      }),
    ],
    outputs: ["outputKey"],
    icon: "GitBranch",
  },
  async (params, context) => {
    const inputKey = params.inputKey as string;
    const path = params.path as string;
    const outputKey = params.outputKey as string;
    const source = context.store.get(inputKey);

    // Simple path resolution
    const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
    let value: unknown = source;
    for (const part of parts) {
      if (value === null || value === undefined) break;
      value = (value as Record<string, unknown>)[part];
    }

    context.store.set(outputKey, value);
    context.log(`Mapped "${inputKey}.${path}" to "${outputKey}"`);
    return { output: value, success: true };
  },
);
