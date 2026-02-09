import { registerFunction, param, registry } from "../../registry";

registerFunction(
  {
    id: "control.parallel",
    name: "Parallel",
    description:
      "Processes an array in parallel using PocketFlow ParallelBatchNode. Use for I/O-bound operations.",
    category: "Control",
    params: [
      param("array", "object", {
        required: true,
        description: "Array to process in parallel",
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
        default: "parallelResults",
        description: "Key to store results",
      }),
    ],
    outputs: ["outputKey"],
    icon: "Zap",
  },
  async (params, context) => {
    const array = params.array as unknown[];
    const processorFunction = params.processorFunction as string;
    const processorParams =
      (params.processorParams as Record<string, unknown>) ?? {};
    const outputKey = (params.outputKey as string) ?? "parallelResults";

    if (!Array.isArray(array)) {
      context.log(`Parallel: "${JSON.stringify(array)}" is not an array`);
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

    context.log(`Parallel: Processing ${array.length} items concurrently`);

    const promises = array.map(async (item, i) => {
      const mergedParams = {
        ...processorParams,
        currentItem: item,
        currentIndex: i,
      };
      try {
        const result = await fn(mergedParams, context);
        return { output: result.output, success: result.success };
      } catch (e) {
        context.log(
          `Parallel: Item ${i} failed: ${e instanceof Error ? e.message : "Unknown error"}`,
        );
        return { output: null, success: false };
      }
    });

    const allResults = await Promise.all(promises);
    const results = allResults.map((r) => r.output);
    const failures = allResults.filter((r) => !r.success).length;

    context.store.set(outputKey, results);
    context.log(
      `Parallel: Completed ${array.length - failures}/${array.length} items`,
    );

    return { output: results, success: failures === 0 };
  },
);
