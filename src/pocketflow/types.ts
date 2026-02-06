/**
 * TinyFlow PocketFlow Type Definitions
 *
 * Core types for the PocketFlow integration layer.
 */

import type { FunctionResult } from "../registry";

/**
 * Node execution mode - determines which PocketFlow primitive to use
 */
export type NodeMode =
  | "single" // Node - single step with retry
  | "batch" // BatchNode - sequential array processing
  | "parallel" // ParallelBatchNode - concurrent array processing
  | "cluster"; // ParallelBatchFlow - concurrent sub-flow execution

/**
 * Result of a batch operation
 */
export interface BatchResult {
  results: FunctionResult[];
  successCount: number;
  failureCount: number;
  totalCount: number;
}

/**
 * Configuration for batch/parallel processing
 */
export interface BatchConfig {
  /** The array to process */
  array: unknown[];
  /** Function ID to call for each item */
  processorFunction: string;
  /** Additional params for processor */
  processorParams?: Record<string, unknown>;
  /** Key to store results */
  outputKey?: string;
}

/**
 * Configuration for cluster (parallel sub-flow) execution
 */
export interface ClusterConfig {
  /** Sub-node IDs to execute in parallel */
  subNodeIds: string[];
  /** Maximum concurrency (default: unlimited) */
  maxConcurrency?: number;
}

/**
 * Node type classification for routing
 */
export type NodeType = "default" | "clusterRoot" | "subNode";

/**
 * Edge action types for flow routing
 */
export type EdgeAction =
  | "default"
  | "success"
  | "error"
  | "next"
  | "complete"
  | string;
