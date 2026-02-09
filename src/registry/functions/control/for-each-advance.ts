import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "control.forEachAdvance",
    name: "ForEach Advance",
    description:
      "Advances the forEach iterator to the next item. Call after processing each item.",
    category: "Control",
    params: [
      param("indexKey", "string", {
        required: false,
        default: "currentIndex",
        description: "Key containing current index",
      }),
      param("resultKey", "string", {
        required: false,
        description: "Key containing result from current iteration",
      }),
      param("outputKey", "string", {
        required: false,
        default: "forEachResults",
        description: "Key to accumulate results",
      }),
    ],
    outputs: ["indexKey", "outputKey"],
    icon: "ArrowRight",
  },
  async (params, context) => {
    const indexKey = (params.indexKey as string) ?? "currentIndex";
    const resultKey = params.resultKey as string;
    const outputKey = (params.outputKey as string) ?? "forEachResults";

    // Increment index
    const currentIndex = ((context.store.get(indexKey) as number) ?? 0) + 1;
    context.store.set(indexKey, currentIndex);

    // Collect result if resultKey is provided
    if (resultKey) {
      const result = context.store.get(resultKey);
      const results = (context.store.get(outputKey) as unknown[]) ?? [];
      results.push(result);
      context.store.set(outputKey, results);
    }

    context.log(`ForEach: Advanced to index ${currentIndex}`);

    return {
      output: currentIndex,
      success: true,
    };
  },
);
