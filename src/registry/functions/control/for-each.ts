import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "control.forEach",
    name: "ForEach",
    description:
      "Iterates over an array, setting current item and index for each iteration. Use with loop edges to process each item.",
    category: "Control",
    actions: ["next", "complete"],
    params: [
      param("array", "object", {
        required: true,
        description:
          "Array to iterate over (can be array literal or reference)",
      }),
      param("itemKey", "string", {
        required: false,
        default: "currentItem",
        description: "Key to store current item",
      }),
      param("indexKey", "string", {
        required: false,
        default: "currentIndex",
        description: "Key to store current index",
      }),
      param("outputKey", "string", {
        required: false,
        default: "forEachResults",
        description: "Key to store collected results",
      }),
    ],
    outputs: ["itemKey", "indexKey", "outputKey"],
    icon: "Repeat",
  },
  async (params, context) => {
    const array = params.array as unknown[];
    const itemKey = (params.itemKey as string) ?? "currentItem";
    const indexKey = (params.indexKey as string) ?? "currentIndex";
    const outputKey = (params.outputKey as string) ?? "forEachResults";

    if (!Array.isArray(array)) {
      context.log(`ForEach: "${JSON.stringify(array)}" is not an array`);
      return {
        output: null,
        success: false,
        error: `Value is not an array`,
      };
    }

    // Get current index (initialize to 0 if not set)
    let currentIndex = (context.store.get(indexKey) as number) ?? 0;

    // Check if we've completed iteration
    if (currentIndex >= array.length) {
      const results = context.store.get(outputKey) ?? [];
      context.log(`ForEach: Completed iteration over ${array.length} items`);

      // Reset for potential re-use
      context.store.set(indexKey, 0);

      return {
        output: results,
        action: "complete",
        success: true,
      };
    }

    // Get current item
    const currentItem = array[currentIndex];

    // Store current item and index
    context.store.set(itemKey, currentItem);
    context.store.set(indexKey, currentIndex);

    context.log(`ForEach: Processing item ${currentIndex + 1}/${array.length}`);

    return {
      output: currentItem,
      action: "next",
      success: true,
    };
  },
);
