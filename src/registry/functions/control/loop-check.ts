import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "control.loopCheck",
    name: "Loop Check",
    description: "Checks if loop should continue based on counter and limit.",
    category: "Control",
    params: [
      param("counterKey", "string", {
        required: true,
        description: "Key containing counter value",
      }),
      param("limit", "number", {
        required: true,
        description: "Maximum iterations",
      }),
    ],
    outputs: [],
    icon: "Repeat",
    actions: ["success", "default"],
  },
  async (params, context) => {
    const counterKey = params.counterKey as string;
    const limit = params.limit as number;
    const counter = (context.store.get(counterKey) as number) ?? 0;

    const shouldContinue = counter < limit;
    context.log(`Loop check: ${counter} < ${limit} = ${shouldContinue}`);
    return {
      output: shouldContinue,
      action: shouldContinue ? "success" : "default",
      success: true,
    };
  },
);
