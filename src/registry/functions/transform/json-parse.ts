import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "transform.jsonParse",
    name: "JSON Parse",
    description: "Parses a JSON string into an object.",
    category: "Transform",
    params: [
      param("inputKey", "string", {
        required: true,
        description: "Key containing JSON string",
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store parsed object",
      }),
    ],
    outputs: ["outputKey"],
    icon: "FileJson",
  },
  async (params, context) => {
    const inputKey = params.inputKey as string;
    const outputKey = params.outputKey as string;
    const jsonString = context.store.get(inputKey) as string;

    try {
      const parsed = JSON.parse(jsonString);
      context.store.set(outputKey, parsed);
      context.log(`Parsed JSON from "${inputKey}" to "${outputKey}"`);
      return { output: parsed, success: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : "Unknown error";
      return {
        output: null,
        success: false,
        error: `JSON parse failed: ${error}`,
      };
    }
  },
);
