import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "transform.template",
    name: "Template",
    description:
      "Interpolates values into a template string using {{key}} syntax.",
    category: "Transform",
    params: [
      param("template", "string", {
        required: true,
        description: "Template string with {{key}} placeholders",
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store result",
      }),
    ],
    outputs: ["outputKey"],
    icon: "FileText",
  },
  async (params, context) => {
    const template = params.template as string;
    const outputKey = params.outputKey as string;

    const result = template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
      // First try direct store lookup
      let value = context.store.get(path);

      // If not found, try path resolution
      if (value === undefined && path.includes(".")) {
        const [rootKey, ...rest] = path.split(".");
        let obj = context.store.get(rootKey);
        for (const part of rest) {
          if (obj === null || obj === undefined) break;
          obj = (obj as Record<string, unknown>)[part];
        }
        value = obj;
      }

      return value !== undefined ? String(value) : `{{${path}}}`;
    });

    context.store.set(outputKey, result);
    context.log(`Template result: ${result}`);
    return { output: result, success: true };
  },
);
