/**
 * Built-in Functions: Transform
 * Data transformation functions
 */

import { registerFunction, param } from "../registry";

// ============================================================================
// JSON Parse
// ============================================================================

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

// ============================================================================
// JSON Stringify
// ============================================================================

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

// ============================================================================
// Map
// ============================================================================

registerFunction(
  {
    id: "transform.map",
    name: "Map",
    description: "Extracts a nested value using a dot-notation path.",
    category: "Transform",
    params: [
      param("inputKey", "string", {
        required: true,
        description: "Key containing source object",
      }),
      param("path", "string", {
        required: true,
        description: 'Dot-notation path (e.g., "data.items[0].name")',
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store extracted value",
      }),
    ],
    outputs: ["outputKey"],
    icon: "GitBranch",
  },
  async (params, context) => {
    const inputKey = params.inputKey as string;
    const path = params.path as string;
    const outputKey = params.outputKey as string;
    const source = context.store.get(inputKey);

    // Simple path resolution
    const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
    let value: unknown = source;
    for (const part of parts) {
      if (value === null || value === undefined) break;
      value = (value as Record<string, unknown>)[part];
    }

    context.store.set(outputKey, value);
    context.log(`Mapped "${inputKey}.${path}" to "${outputKey}"`);
    return { output: value, success: true };
  },
);

// ============================================================================
// Merge
// ============================================================================

registerFunction(
  {
    id: "transform.merge",
    name: "Merge",
    description: "Merges multiple objects into one.",
    category: "Transform",
    params: [
      param("keys", "array", {
        required: true,
        description: "Array of keys to merge",
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store merged object",
      }),
    ],
    outputs: ["outputKey"],
    icon: "Merge",
  },
  async (params, context) => {
    const keys = params.keys as string[];
    const outputKey = params.outputKey as string;

    const merged: Record<string, unknown> = {};
    for (const key of keys) {
      const value = context.store.get(key);
      if (typeof value === "object" && value !== null) {
        Object.assign(merged, value);
      }
    }

    context.store.set(outputKey, merged);
    context.log(`Merged [${keys.join(", ")}] into "${outputKey}"`);
    return { output: merged, success: true };
  },
);

// ============================================================================
// Template
// ============================================================================

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

// ============================================================================
// Filter Array
// ============================================================================

registerFunction(
  {
    id: "transform.filter",
    name: "Filter Array",
    description: "Filters an array based on a simple condition.",
    category: "Transform",
    params: [
      param("inputKey", "string", {
        required: true,
        description: "Key containing array",
      }),
      param("field", "string", {
        required: true,
        description: "Field to check on each item",
      }),
      param("operator", "string", {
        required: true,
        description: "Comparison operator (eq, ne, gt, lt, gte, lte, contains)",
      }),
      param("value", "object", {
        required: true,
        description: "Value to compare against",
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store filtered array",
      }),
    ],
    outputs: ["outputKey"],
    icon: "Filter",
  },
  async (params, context) => {
    const inputKey = params.inputKey as string;
    const field = params.field as string;
    const operator = params.operator as string;
    const compareValue = params.value;
    const outputKey = params.outputKey as string;

    const array = context.store.get(inputKey) as unknown[];
    if (!Array.isArray(array)) {
      return {
        output: [],
        success: false,
        error: `${inputKey} is not an array`,
      };
    }

    const filtered = array.filter((item) => {
      const itemValue = (item as Record<string, unknown>)[field];
      switch (operator) {
        case "eq":
          return itemValue === compareValue;
        case "ne":
          return itemValue !== compareValue;
        case "gt":
          return (itemValue as number) > (compareValue as number);
        case "lt":
          return (itemValue as number) < (compareValue as number);
        case "gte":
          return (itemValue as number) >= (compareValue as number);
        case "lte":
          return (itemValue as number) <= (compareValue as number);
        case "contains":
          return String(itemValue).includes(String(compareValue));
        default:
          return true;
      }
    });

    context.store.set(outputKey, filtered);
    context.log(`Filtered ${array.length} -> ${filtered.length} items`);
    return { output: filtered, success: true };
  },
);
