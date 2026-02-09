import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "core.start",
    name: "Start",
    description: "Entry point for the workflow. Passes through input data.",
    category: "Core",
    params: [
      param("input", "object", {
        required: false,
        default: {},
        description: "Initial input data",
      }),
    ],
    outputs: ["input"],
    icon: "Play",
  },
  async (params, context) => {
    const input = params.input ?? {};
    context.store.set("input", input);
    context.log(`Start node initialized with: ${JSON.stringify(input)}`);
    return { output: input, success: true };
  },
);
