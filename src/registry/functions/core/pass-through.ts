import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "core.passthrough",
    name: "Pass Through",
    description: "Passes data from one key to another without modification.",
    category: "Core",
    params: [
      param("fromKey", "string", {
        required: true,
        description: "Source key in store",
      }),
      param("toKey", "string", {
        required: true,
        description: "Destination key in store",
      }),
    ],
    outputs: ["toKey"],
    icon: "ArrowRight",
  },
  async (params, context) => {
    const fromKey = params.fromKey as string;
    const toKey = params.toKey as string;
    const value = context.store.get(fromKey);
    context.store.set(toKey, value);
    context.log(`Passed "${fromKey}" -> "${toKey}"`);
    return { output: value, success: true };
  },
);
