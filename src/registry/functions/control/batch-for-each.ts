import {
  registerFunction,
  param,
  registry,
  type ExecutionContext,
} from "../../registry";

registerFunction(
  {
    id: "control.batchForEach",
    name: "Batch ForEach",
    description:
      "Processes an array in parallel using PocketFlow batch processing. More efficient than manual iteration.",
    category: "Control",
    params: [
      param("array", "object", {
        required: true,
        description:
          "Array to process in parallel (can be array literal or reference)",
      }),
      param("processorFunction", "string", {
        required: true,
        description: "Function ID to call for each item",
      }),
      param("processorParams", "object", {
        required: false,
        description: "Additional parameters to pass to the processor function",
      }),
      param("outputKey", "string", {
        required: false,
        default: "batchResults",
        description: "Key to store processing results",
      }),
      param("maxConcurrency", "number", {
        required: false,
        default: 10,
        description: "Maximum number of items to process concurrently",
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
    const outputKey = (params.outputKey as string) ?? "batchResults";
    const maxConcurrency = (params.maxConcurrency as number) ?? 10;

    if (!Array.isArray(array)) {
      context.log(`BatchForEach: "${JSON.stringify(array)}" is not an array`);
      return {
        output: null,
        success: false,
        error: `Value is not an array`,
      };
    }

    if (array.length === 0) {
      context.log(`BatchForEach: Empty array, nothing to process`);
      context.store.set(outputKey, []);
      return {
        output: [],
        success: true,
      };
    }

    // Get the processor function
    const fn = registry.getExecutable(processorFunction);
    if (!fn) {
      return {
        output: null,
        success: false,
        error: `Processor function "${processorFunction}" is not registered`,
      };
    }

    context.log(
      `BatchForEach: Processing ${array.length} items with max concurrency ${maxConcurrency}`,
    );

    // Process items in batches to respect concurrency limit
    const results: unknown[] = [];
    const batches: unknown[][] = [];

    // Split array into batches
    for (let i = 0; i < array.length; i += maxConcurrency) {
      batches.push(array.slice(i, i + maxConcurrency));
    }

    // Process each batch
    for (const batch of batches) {
      const batchPromises = batch.map(async (item, index) => {
        const globalIndex = results.length + index;

        // Create execution context for this item
        const itemContext: ExecutionContext = {
          nodeId: context.nodeId,
          store: new Map(context.store), // Clone store for isolation
          env: context.env,
          log: (message: string) => {
            context.log(`[Item ${globalIndex}] ${message}`);
          },
        };

        // Set current item in the store
        itemContext.store.set("currentItem", item);
        itemContext.store.set("currentIndex", globalIndex);

        // Merge processor params with item-specific params
        const mergedParams = {
          ...processorParams,
          currentItem: item,
          currentIndex: globalIndex,
        };

        try {
          const result = await fn(mergedParams, itemContext);
          return result.success ? result.output : null;
        } catch (e) {
          const error = e instanceof Error ? e.message : "Unknown error";
          itemContext.log(`Processing failed: ${error}`);
          return null;
        }
      });

      // Wait for this batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    // Store results
    context.store.set(outputKey, results);

    const successCount = results.filter((r) => r !== null).length;
    context.log(
      `BatchForEach: Completed ${successCount}/${array.length} items successfully`,
    );

    return {
      output: results,
      success: successCount === array.length,
    };
  },
);
