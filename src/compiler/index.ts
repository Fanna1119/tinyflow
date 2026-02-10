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
  getClusterOutputs,
  getClusterNodeOutput,
  getAllClusterOutputs,
  type SharedStore,
  type CompiledStore,
  type MockValue,
  type DebugCallbacks,
  type MemoryLimits,
  type NodeProfile,
  type CompilationResult,
  type CompileOptions,
  type ClusterOutputs,
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
