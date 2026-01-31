/**
 * Built-in Functions: Core
 * Essential utility functions
 */

import { registerFunction, param } from "../registry";

// ============================================================================
// Start Node
// ============================================================================

registerFunction(
  {
    id: "core.start",
    name: "Start",
    description: "Entry point for the workflow. Passes through input data.",
    category: "Core",
    params: [
      param("input", "object", {
        required: false,
        default: {},
        description: "Initial input data",
      }),
    ],
    outputs: ["input"],
    icon: "Play",
  },
  async (params, context) => {
    const input = params.input ?? {};
    context.store.set("input", input);
    context.log(`Start node initialized with: ${JSON.stringify(input)}`);
    return { output: input, success: true };
  },
);

// ============================================================================
// End Node
// ============================================================================

registerFunction(
  {
    id: "core.end",
    name: "End",
    description: "Terminal node for the workflow. Collects final output.",
    category: "Core",
    params: [
      param("outputKey", "string", {
        required: false,
        default: "result",
        description: "Key to read from store as final output",
      }),
    ],
    outputs: ["result"],
    icon: "Square",
  },
  async (params, context) => {
    const outputKey = (params.outputKey as string) ?? "result";
    const result = context.store.get(outputKey);
    context.log(`Workflow complete. Result: ${JSON.stringify(result)}`);
    return { output: result, success: true };
  },
);

// ============================================================================
// Pass Through
// ============================================================================

registerFunction(
  {
    id: "core.passthrough",
    name: "Pass Through",
    description: "Passes data from one key to another without modification.",
    category: "Core",
    params: [
      param("fromKey", "string", {
        required: true,
        description: "Source key in store",
      }),
      param("toKey", "string", {
        required: true,
        description: "Destination key in store",
      }),
    ],
    outputs: ["toKey"],
    icon: "ArrowRight",
  },
  async (params, context) => {
    const fromKey = params.fromKey as string;
    const toKey = params.toKey as string;
    const value = context.store.get(fromKey);
    context.store.set(toKey, value);
    context.log(`Passed "${fromKey}" -> "${toKey}"`);
    return { output: value, success: true };
  },
);

// ============================================================================
// Set Value
// ============================================================================

registerFunction(
  {
    id: "core.setValue",
    name: "Set Value",
    description: "Sets a static value in the store.",
    category: "Core",
    params: [
      param("key", "string", {
        required: true,
        description: "Key to set in store",
      }),
      param("value", "object", {
        required: true,
        description: "Value to set",
      }),
    ],
    outputs: ["key"],
    icon: "PenLine",
  },
  async (params, context) => {
    const key = params.key as string;
    const value = params.value;
    context.store.set(key, value);
    context.log(`Set "${key}" = ${JSON.stringify(value)}`);
    return { output: value, success: true };
  },
);

// ============================================================================
// Log
// ============================================================================

registerFunction(
  {
    id: "core.log",
    name: "Log",
    description: "Logs a value from the store for debugging.",
    category: "Core",
    params: [
      param("key", "string", {
        required: true,
        description: "Key to read and log",
      }),
      param("message", "string", {
        required: false,
        description: "Optional prefix message",
      }),
    ],
    outputs: [],
    icon: "MessageSquare",
  },
  async (params, context) => {
    const key = params.key as string;
    const message = params.message as string | undefined;
    const value = context.store.get(key);
    const prefix = message ? `${message}: ` : "";
    context.log(`${prefix}${key} = ${JSON.stringify(value, null, 2)}`);
    return { output: value, success: true };
  },
);

// ============================================================================
// Delay
// ============================================================================

registerFunction(
  {
    id: "core.delay",
    name: "Delay",
    description: "Pauses execution for a specified duration.",
    category: "Core",
    params: [
      param("ms", "number", {
        required: true,
        description: "Delay in milliseconds",
      }),
    ],
    outputs: [],
    icon: "Clock",
  },
  async (params, context) => {
    const ms = params.ms as number;
    context.log(`Delaying for ${ms}ms`);
    await new Promise((resolve) => setTimeout(resolve, ms));
    return { output: null, success: true };
  },
);
