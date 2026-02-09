import { registerFunction, param, registry } from "../../registry";

registerFunction(
  {
    id: "control.batch",
    name: "Batch (Sequential)",
    description:
      "Processes an array sequentially using PocketFlow BatchNode. Use for ordered, data-intensive operations.",
    category: "Control",
    params: [
      param("array", "object", {
        required: true,
        description: "Array to process sequentially",
      }),
      param("processorFunction", "string", {
        required: true,
        description: "Function ID to call for each item",
      }),
      param("processorParams", "object", {
        required: false,
        description: "Additional parameters to pass to the processor",
      }),
      param("outputKey", "string", {
        required: false,
        default: "batchResults",
        description: "Key to store results",
      }),
    ],
    outputs: ["outputKey"],
    icon: "ListOrdered",
  },
  async (params, context) => {
    const array = params.array as unknown[];
    const processorFunction = params.processorFunction as string;
    const processorParams =
      (params.processorParams as Record<string, unknown>) ?? {};
    const outputKey = (params.outputKey as string) ?? "batchResults";

    if (!Array.isArray(array)) {
      context.log(`Batch: "${JSON.stringify(array)}" is not an array`);
      return { output: null, success: false, error: "Value is not an array" };
    }

    const fn = registry.getExecutable(processorFunction);
    if (!fn) {
      return {
        output: null,
        success: false,
        error: `Processor "${processorFunction}" not found`,
      };
    }

    context.log(`Batch: Processing ${array.length} items sequentially`);

    const results: unknown[] = [];
    let failures = 0;

    for (let i = 0; i < array.length; i++) {
      const item = array[i];
      const mergedParams = {
        ...processorParams,
        currentItem: item,
        currentIndex: i,
      };

      try {
        const result = await fn(mergedParams, context);
        results.push(result.output);
        if (!result.success) failures++;
      } catch (e) {
        results.push(null);
        failures++;
        context.log(
          `Batch: Item ${i} failed: ${e instanceof Error ? e.message : "Unknown error"}`,
        );
      }
    }

    context.store.set(outputKey, results);
    context.log(
      `Batch: Completed ${array.length - failures}/${array.length} items`,
    );

    return { output: results, success: failures === 0 };
  },
);
