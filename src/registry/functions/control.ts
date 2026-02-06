/**
 * Built-in Functions: Control Flow
 * Conditional and branching functions
 */

import {
  registerFunction,
  param,
  registry,
  type ExecutionContext,
} from "../registry";

// ============================================================================
// Condition
// ============================================================================

registerFunction(
  {
    id: "control.condition",
    name: "Condition",
    description: "Evaluates a condition and returns success or error action.",
    category: "Control",
    params: [
      param("leftKey", "string", {
        required: true,
        description: "Key for left side value",
      }),
      param("operator", "string", {
        required: true,
        description:
          "Comparison operator (eq, ne, gt, lt, gte, lte, truthy, falsy)",
      }),
      param("rightValue", "object", {
        required: false,
        description: "Right side value (not needed for truthy/falsy)",
      }),
    ],
    outputs: [],
    icon: "GitFork",
  },
  async (params, context) => {
    const leftKey = params.leftKey as string;
    const operator = params.operator as string;
    const rightValue = params.rightValue;
    const leftValue = context.store.get(leftKey);

    let result = false;
    switch (operator) {
      case "eq":
        result = leftValue === rightValue;
        break;
      case "ne":
        result = leftValue !== rightValue;
        break;
      case "gt":
        result = (leftValue as number) > (rightValue as number);
        break;
      case "lt":
        result = (leftValue as number) < (rightValue as number);
        break;
      case "gte":
        result = (leftValue as number) >= (rightValue as number);
        break;
      case "lte":
        result = (leftValue as number) <= (rightValue as number);
        break;
      case "truthy":
        result = Boolean(leftValue);
        break;
      case "falsy":
        result = !leftValue;
        break;
    }

    context.log(`Condition: ${leftKey} ${operator} ${rightValue} = ${result}`);
    return {
      output: result,
      action: result ? "success" : "error",
      success: true,
    };
  },
);

// ============================================================================
// Switch
// ============================================================================

registerFunction(
  {
    id: "control.switch",
    name: "Switch",
    description: "Routes to different paths based on a value.",
    category: "Control",
    params: [
      param("key", "string", {
        required: true,
        description: "Key to read value from",
      }),
      param("cases", "object", {
        required: true,
        description: "Object mapping values to action names",
      }),
      param("default", "string", {
        required: false,
        default: "default",
        description: "Action if no case matches",
      }),
    ],
    outputs: [],
    icon: "Route",
  },
  async (params, context) => {
    const key = params.key as string;
    const cases = params.cases as Record<string, string>;
    const defaultAction = (params.default as string) ?? "default";
    const value = String(context.store.get(key));

    const action = cases[value] ?? defaultAction;
    context.log(`Switch on "${key}" = "${value}" -> action: ${action}`);
    return { output: value, action, success: true };
  },
);

// ============================================================================
// Loop Counter
// ============================================================================

registerFunction(
  {
    id: "control.counter",
    name: "Counter",
    description: "Maintains a counter, useful for loops.",
    category: "Control",
    params: [
      param("counterKey", "string", {
        required: true,
        description: "Key to store counter",
      }),
      param("operation", "string", {
        required: true,
        description: "Operation: init, increment, decrement",
      }),
      param("initialValue", "number", {
        required: false,
        default: 0,
        description: "Initial value for init operation",
      }),
      param("step", "number", {
        required: false,
        default: 1,
        description: "Step value for increment/decrement",
      }),
    ],
    outputs: ["counterKey"],
    icon: "Hash",
  },
  async (params, context) => {
    const counterKey = params.counterKey as string;
    const operation = params.operation as string;
    const initialValue = (params.initialValue as number) ?? 0;
    const step = (params.step as number) ?? 1;

    let value = (context.store.get(counterKey) as number) ?? 0;

    switch (operation) {
      case "init":
        value = initialValue;
        break;
      case "increment":
        value += step;
        break;
      case "decrement":
        value -= step;
        break;
    }

    context.store.set(counterKey, value);
    context.log(`Counter "${counterKey}" = ${value}`);
    return { output: value, success: true };
  },
);

// ============================================================================
// Loop Check
// ============================================================================

registerFunction(
  {
    id: "control.loopCheck",
    name: "Loop Check",
    description: "Checks if loop should continue based on counter and limit.",
    category: "Control",
    params: [
      param("counterKey", "string", {
        required: true,
        description: "Key containing counter value",
      }),
      param("limit", "number", {
        required: true,
        description: "Maximum iterations",
      }),
    ],
    outputs: [],
    icon: "Repeat",
  },
  async (params, context) => {
    const counterKey = params.counterKey as string;
    const limit = params.limit as number;
    const counter = (context.store.get(counterKey) as number) ?? 0;

    const shouldContinue = counter < limit;
    context.log(`Loop check: ${counter} < ${limit} = ${shouldContinue}`);
    return {
      output: shouldContinue,
      action: shouldContinue ? "success" : "default",
      success: true,
    };
  },
);

// ============================================================================
// Error Handler
// ============================================================================

registerFunction(
  {
    id: "control.errorHandler",
    name: "Error Handler",
    description: "Catches and handles errors, optionally continuing flow.",
    category: "Control",
    params: [
      param("errorKey", "string", {
        required: false,
        default: "lastError",
        description: "Key where error info is stored",
      }),
      param("fallbackValue", "object", {
        required: false,
        description: "Value to set if error occurred",
      }),
      param("outputKey", "string", {
        required: false,
        description: "Key to store fallback value",
      }),
    ],
    outputs: ["outputKey"],
    icon: "ShieldAlert",
  },
  async (params, context) => {
    const errorKey = (params.errorKey as string) ?? "lastError";
    const fallbackValue = params.fallbackValue;
    const outputKey = params.outputKey as string;

    const error = context.store.get(errorKey);
    if (error) {
      context.log(`Error caught: ${JSON.stringify(error)}`);
      if (outputKey && fallbackValue !== undefined) {
        context.store.set(outputKey, fallbackValue);
      }
    }

    return { output: error ?? null, success: true };
  },
);

// ============================================================================
// ForEach Iterator
// ============================================================================

registerFunction(
  {
    id: "control.forEach",
    name: "ForEach",
    description:
      "Iterates over an array, setting current item and index for each iteration. Use with loop edges to process each item.",
    category: "Control",
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

// ============================================================================
// ForEach Advance
// ============================================================================

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

// ============================================================================
// Batch ForEach
// ============================================================================

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

// ============================================================================
// Batch (Sequential) - Maps to PocketFlow BatchNode
// ============================================================================

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

// ============================================================================
// Parallel - Maps to PocketFlow ParallelBatchNode
// ============================================================================

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
