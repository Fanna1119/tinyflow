/**
 * TinyFlow PocketFlow Integration Layer
 *
 * A clean, thin wrapper over PocketFlow's 6 core primitives:
 * 1. Node - Single step with retry logic
 * 2. Flow - Multiple steps connected by actions
 * 3. BatchNode - Sequential repeat steps (data-intensive)
 * 4. ParallelBatchNode - Concurrent repeat steps (I/O-bound)
 * 5. BatchFlow - Sequential sub-flow execution
 * 6. ParallelBatchFlow - Concurrent sub-flow execution
 *
 * Plus the Shared Store pattern for inter-node communication.
 *
 * Design Philosophy:
 * - Minimal wrapping - leverage PocketFlow's battle-tested implementation
 * - 1:1 mapping to PocketFlow primitives
 * - JSON workflow → PocketFlow graph compilation
 * - Shared store for all inter-node communication
 */

// Re-export all PocketFlow primitives
export {
  BaseNode,
  Node,
  Flow,
  BatchNode,
  ParallelBatchNode,
  BatchFlow,
  ParallelBatchFlow,
} from "pocketflow";

// Export our types
export * from "./types";
export * from "./nodes";
export * from "./shared";
export * from "./compiler";
