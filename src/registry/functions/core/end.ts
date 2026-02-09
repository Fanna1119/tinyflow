import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "core.end",
    name: "End",
    description: "Terminal node for the workflow. Collects final output.",
    category: "Core",
    params: [
      param("outputKey", "string", {
        required: false,
        default: "result",
        description: "Key to read from store as final output",
      }),
    ],
    outputs: ["result"],
    icon: "Square",
  },
  async (params, context) => {
    const outputKey = (params.outputKey as string) ?? "result";
    const result = context.store.get(outputKey);
    context.log(`Workflow complete. Result: ${JSON.stringify(result)}`);
    return { output: result, success: true };
  },
);
