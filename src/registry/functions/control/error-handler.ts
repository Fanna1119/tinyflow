import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "control.errorHandler",
    name: "Error Handler",
    description: "Catches and handles errors, optionally continuing flow.",
    category: "Control",
    params: [
      param("errorKey", "string", {
        required: false,
        default: "lastError",
        description: "Key where error info is stored",
      }),
      param("fallbackValue", "object", {
        required: false,
        description: "Value to set if error occurred",
      }),
      param("outputKey", "string", {
        required: false,
        description: "Key to store fallback value",
      }),
    ],
    outputs: ["outputKey"],
    icon: "ShieldAlert",
  },
  async (params, context) => {
    const errorKey = (params.errorKey as string) ?? "lastError";
    const fallbackValue = params.fallbackValue;
    const outputKey = params.outputKey as string;

    const error = context.store.get(errorKey);
    if (error) {
      context.log(`Error caught: ${JSON.stringify(error)}`);
      if (outputKey && fallbackValue !== undefined) {
        context.store.set(outputKey, fallbackValue);
      }
    }

    return { output: error ?? null, success: true };
  },
);
