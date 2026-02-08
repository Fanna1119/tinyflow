import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "core.log",
    name: "Log",
    description: "Logs a value from the store for debugging.",
    category: "Core",
    params: [
      param("key", "string", {
        required: true,
        description: "Key to read and log",
      }),
      param("message", "string", {
        required: false,
        description: "Optional prefix message",
      }),
    ],
    outputs: [],
    icon: "MessageSquare",
  },
  async (params, context) => {
    const key = params.key as string;
    const message = params.message as string | undefined;
    const value = context.store.get(key);
    const prefix = message ? `${message}: ` : "";
    context.log(`${prefix}${key} = ${JSON.stringify(value, null, 2)}`);
    return { output: value, success: true };
  },
);
