import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "core.setValue",
    name: "Set Value",
    description: "Sets a static value in the store.",
    category: "Core",
    params: [
      param("key", "string", {
        required: true,
        description: "Key to set in store",
      }),
      param("value", "object", {
        required: true,
        description: "Value to set",
      }),
    ],
    outputs: ["key"],
    icon: "PenLine",
  },
  async (params, context) => {
    const key = params.key as string;
    const value = params.value;
    context.store.set(key, value);
    context.log(`Set "${key}" = ${JSON.stringify(value)}`);
    return { output: value, success: true };
  },
);
