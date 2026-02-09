/**
 * TinyFlow Shared Store
 *
 * PocketFlow uses a "shared" object passed through prep → exec → post.
 * This is the shared store pattern for inter-node communication.
 *
 * Design:
 * - Single source of truth for all workflow data
 * - Nodes read/write through context.store
 * - Results stored per-node for debugging
 * - Logs collected for observability
 */

import type { FunctionResult } from "../registry";

/**
 * Mock value for testing - allows overriding node behavior
 */
export interface MockValue {
  enabled: boolean;
  output: unknown;
  success: boolean;
  action?: string;
  delay?: number;
}

/**
 * Performance profile captured per-node execution
 */
export interface NodeProfile {
  /** Node ID */
  nodeId: string;
  /** Wall-clock duration in milliseconds */
  durationMs: number;
  /** Heap used before execution (bytes) */
  heapUsedBefore: number;
  /** Heap used after execution (bytes) */
  heapUsedAfter: number;
  /** Heap delta (bytes, positive = growth) */
  heapDelta: number;
  /** RSS before execution (bytes) */
  rssBefore: number;
  /** RSS after execution (bytes) */
  rssAfter: number;
  /** CPU user time consumed (microseconds) */
  cpuUserUs: number;
  /** CPU system time consumed (microseconds) */
  cpuSystemUs: number;
  /** Approximate CPU percentage (single-thread) */
  cpuPercent: number;
  /** Timestamp when measurement started (ms since epoch) */
  timestamp: number;
}

/**
 * Debug callbacks for tracking execution
 */
export interface DebugCallbacks {
  onBeforeNode?: (nodeId: string) => void | Promise<void>;
  onNodeStart?: (nodeId: string, params: Record<string, unknown>) => void;
  onNodeComplete?: (nodeId: string, success: boolean, output: unknown) => void;
  /** Called after a node completes with performance metrics (when profiling is enabled) */
  onNodeProfile?: (nodeId: string, profile: NodeProfile) => void;
}

/**
 * Memory limits to prevent unbounded growth
 */
export interface MemoryLimits {
  maxLogs?: number;
  maxNodeResults?: number;
  maxDataSize?: number;
}

/**
 * The shared store - PocketFlow's communication pattern
 * Passed to every node's prep/exec/post methods
 */
export interface SharedStore {
  /** Key-value data store for inter-node communication */
  data: Map<string, unknown>;
  /** Execution logs */
  logs: string[];
  /** Environment variables */
  env: Record<string, string>;
  /** Results per node (for debugging/inspection) */
  nodeResults: Map<string, FunctionResult>;
  /** Last error encountered */
  lastError?: { nodeId: string; error: string };
  /** Mock values for testing */
  mockValues?: Map<string, MockValue>;
  /** Debug callbacks */
  debugCallbacks?: DebugCallbacks;
  /** Memory limits */
  memoryLimits?: MemoryLimits;
}

/**
 * Default memory limits
 */
const DEFAULT_LIMITS: Required<MemoryLimits> = {
  maxLogs: 1000,
  maxNodeResults: 1000,
  maxDataSize: 10 * 1024 * 1024, // 10MB
};

/**
 * Create a new shared store
 */
export function createSharedStore(
  options: {
    initialData?: Record<string, unknown>;
    env?: Record<string, string>;
    mockValues?: Map<string, MockValue>;
    debugCallbacks?: DebugCallbacks;
    memoryLimits?: MemoryLimits;
  } = {},
): SharedStore {
  return {
    data: new Map(Object.entries(options.initialData ?? {})),
    logs: [],
    env: options.env ?? {},
    nodeResults: new Map(),
    mockValues: options.mockValues,
    debugCallbacks: options.debugCallbacks,
    memoryLimits: { ...DEFAULT_LIMITS, ...options.memoryLimits },
  };
}

/**
 * Enforce memory limits on a shared store
 */
export function enforceMemoryLimits(store: SharedStore): void {
  const limits = { ...DEFAULT_LIMITS, ...store.memoryLimits };

  // Limit logs
  if (store.logs.length > limits.maxLogs) {
    const excess = store.logs.length - limits.maxLogs;
    store.logs.splice(0, excess);
    store.logs.unshift(`[SYSTEM] Log truncated: removed ${excess} old entries`);
  }

  // Limit node results
  if (store.nodeResults.size > limits.maxNodeResults) {
    const entries = Array.from(store.nodeResults.entries());
    const excess = entries.length - limits.maxNodeResults;
    for (let i = 0; i < excess; i++) {
      store.nodeResults.delete(entries[i][0]);
    }
  }

  // Check data size (warn only)
  try {
    const dataSize = JSON.stringify(Object.fromEntries(store.data)).length;
    if (dataSize > limits.maxDataSize) {
      store.logs.push(
        `[SYSTEM] Warning: Data store size (${dataSize} bytes) exceeds limit`,
      );
    }
  } catch {
    // Ignore serialization errors
  }
}

/**
 * Helper to get a value from the store with type safety
 */
export function get<T>(store: SharedStore, key: string): T | undefined {
  return store.data.get(key) as T | undefined;
}

/**
 * Helper to set a value in the store
 */
export function set(store: SharedStore, key: string, value: unknown): void {
  store.data.set(key, value);
}

/**
 * Helper to log a message
 */
export function log(store: SharedStore, nodeId: string, message: string): void {
  const formatted = `[${nodeId}] ${message}`;
  store.logs.push(formatted);
  console.log(formatted);
}
