import { registerFunction, param } from "../../registry";

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
