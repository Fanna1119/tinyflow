import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "transform.jsonStringify",
    name: "JSON Stringify",
    description: "Converts an object to a JSON string.",
    category: "Transform",
    params: [
      param("inputKey", "string", {
        required: true,
        description: "Key containing object",
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store JSON string",
      }),
      param("pretty", "boolean", {
        required: false,
        default: false,
        description: "Whether to pretty-print",
      }),
    ],
    outputs: ["outputKey"],
    icon: "FileJson",
  },
  async (params, context) => {
    const inputKey = params.inputKey as string;
    const outputKey = params.outputKey as string;
    const pretty = params.pretty as boolean;
    const value = context.store.get(inputKey);

    const jsonString = pretty
      ? JSON.stringify(value, null, 2)
      : JSON.stringify(value);
    context.store.set(outputKey, jsonString);
    context.log(`Stringified "${inputKey}" to "${outputKey}"`);
    return { output: jsonString, success: true };
  },
);
