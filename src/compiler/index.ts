/**
 * Compiler Module
 *
 * Re-exports the refactored PocketFlow-based compiler.
 * The new compiler provides direct 1:1 mapping to PocketFlow primitives:
 * - Node → TinyFlowNode
 * - BatchNode → TinyFlowBatchNode
 * - ParallelBatchNode → TinyFlowParallelNode
 * - Flow → used directly
 * - BatchFlow/ParallelBatchFlow → TinyFlowCluster
 */

// Export from new PocketFlow integration layer
export {
  compileWorkflow,
  compileWorkflowFromJson,
  createSharedStore,
  createStore,
  type SharedStore,
  type CompiledStore,
  type MockValue,
  type DebugCallbacks,
  type MemoryLimits,
  type CompilationResult,
  type CompileOptions,
} from "../pocketflow/compiler";

// Also export PocketFlow primitives for advanced usage
export {
  TinyFlowNode,
  TinyFlowBatchNode,
  TinyFlowParallelNode,
  TinyFlowCluster,
  createNode,
  createCluster,
} from "../pocketflow/nodes";

// Legacy export for backward compatibility
export { ClusterRootNode } from "./clusterNode";
