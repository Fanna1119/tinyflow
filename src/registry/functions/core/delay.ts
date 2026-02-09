import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "core.delay",
    name: "Delay",
    description: "Pauses execution for a specified duration.",
    category: "Core",
    params: [
      param("ms", "number", {
        required: true,
        description: "Delay in milliseconds",
      }),
    ],
    outputs: [],
    icon: "Clock",
  },
  async (params, context) => {
    const ms = params.ms as number;
    context.log(`Delaying for ${ms}ms`);
    await new Promise((resolve) => setTimeout(resolve, ms));
    return { output: null, success: true };
  },
);
