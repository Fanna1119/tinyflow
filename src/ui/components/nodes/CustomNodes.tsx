/**
 * Custom React Flow Node Types
 */

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle, Box, FlaskConical, Layers } from "lucide-react";
import { registry } from "../../../registry";
import * as LucideIcons from "lucide-react";
import type { ExecutionStatus } from "../../hooks/useDebugger";
import type { NodeHandle } from "../../../schema/types";

// ============================================================================
// Function Node
// ============================================================================

interface FunctionNodeData {
  label: string;
  functionId: string;
  params: Record<string, unknown>;
  hasError?: boolean;
  /** Execution status for debug visualization */
  executionStatus?: ExecutionStatus;
  /** Whether this node has mock values configured */
  hasMock?: boolean;
  /** Custom handles for cluster root nodes */
  handles?: NodeHandle[];
  /** Whether this is a sub-node */
  isSubNode?: boolean;
  /** Parent node ID for sub-nodes */
  parentId?: string;
}

// Dynamic icon component - renders the appropriate Lucide icon by name
const DynamicIcon = memo(function DynamicIcon({
  name,
  className,
}: {
  name?: string;
  className?: string;
}) {
  if (!name) return <Box className={className} />;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const icons = LucideIcons as any;
  const IconComponent = icons[name] ?? Box;
  return <IconComponent className={className} />;
});

// Get border/ring styles based on execution status
function getExecutionStyles(
  status?: ExecutionStatus,
  selected?: boolean,
): string {
  if (status === "running") {
    return "border-blue-500 ring-2 ring-blue-300 animate-pulse";
  }
  if (status === "success") {
    return "border-green-500 ring-2 ring-green-200";
  }
  if (status === "error") {
    return "border-red-500 ring-2 ring-red-200";
  }
  if (selected) {
    return "border-blue-500 ring-2 ring-blue-200";
  }
  return "border-gray-200 dark:border-gray-600";
}

export const FunctionNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as FunctionNodeData;
  const metadata = registry.get(nodeData.functionId)?.metadata;
  const borderStyles = getExecutionStyles(nodeData.executionStatus, selected);

  return (
    <div
      className={`
        px-4 py-2 rounded-lg shadow-md border-2 min-w-37.5
        bg-white dark:bg-gray-800
        ${borderStyles}
        transition-all duration-150
      `}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-gray-400! hover:bg-blue-500!"
      />

      <div className="flex items-center gap-2">
        <div
          className={`
          p-1 rounded text-blue-600 dark:text-blue-400
          ${
            nodeData.executionStatus === "running"
              ? "bg-blue-100 dark:bg-blue-900/50"
              : nodeData.executionStatus === "success"
                ? "bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400"
                : nodeData.executionStatus === "error"
                  ? "bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400"
                  : "bg-blue-50 dark:bg-blue-900/30"
          }
        `}
        >
          <DynamicIcon name={metadata?.icon} className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
              {nodeData.label}
            </span>
            {nodeData.hasMock && (
              <FlaskConical className="w-3 h-3 text-purple-500 shrink-0" />
            )}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {nodeData.functionId}
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-gray-400! hover:bg-blue-500!"
      />
    </div>
  );
});

FunctionNode.displayName = "FunctionNode";

// ============================================================================
// Error Node (missing function)
// ============================================================================

export const ErrorNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as FunctionNodeData;

  return (
    <div
      className={`
        px-4 py-2 rounded-lg shadow-md border-2 min-w-37.5
        bg-red-50 dark:bg-red-900/20
        ${selected ? "border-red-500 ring-2 ring-red-200" : "border-red-300 dark:border-red-700"}
        transition-all duration-150
      `}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-red-400!"
      />

      <div className="flex items-center gap-2">
        <div className="p-1 rounded bg-red-100 dark:bg-red-900/50 text-red-600">
          <AlertTriangle className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-red-700 dark:text-red-300 truncate">
            {nodeData.label}
          </div>
          <div className="text-xs text-red-500 truncate">
            {nodeData.functionId}
          </div>
        </div>
      </div>

      <div className="mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" />
        Function not registered
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-red-400!"
      />
    </div>
  );
});

ErrorNode.displayName = "ErrorNode";

// ============================================================================
// Cluster Root Node (multi-output handles)
// ============================================================================

// Default handles for cluster root nodes
const DEFAULT_CLUSTER_HANDLES: NodeHandle[] = [
  { id: "a", type: "source", label: "A" },
  { id: "b", type: "source", label: "B" },
];

// Handle colors for visual differentiation
const HANDLE_COLORS = [
  "bg-purple-500 hover:bg-purple-600",
  "bg-cyan-500 hover:bg-cyan-600",
  "bg-amber-500 hover:bg-amber-600",
  "bg-emerald-500 hover:bg-emerald-600",
  "bg-rose-500 hover:bg-rose-600",
];

export const ClusterRootNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as FunctionNodeData;
  const metadata = registry.get(nodeData.functionId)?.metadata;
  const borderStyles = getExecutionStyles(nodeData.executionStatus, selected);

  // Get handles from node data or use defaults
  const subNodeHandles = (nodeData.handles ?? DEFAULT_CLUSTER_HANDLES).filter(
    (h) => h.type === "source",
  );

  // Calculate handle positions evenly spaced along the bottom edge
  const handleSpacing = 100 / (subNodeHandles.length + 1);

  return (
    <div
      className={`
        px-4 py-2 pb-4 rounded-lg shadow-md border-2 min-w-37.5
        bg-gradient-to-br from-purple-50 to-white dark:from-purple-900/20 dark:to-gray-800
        ${borderStyles}
        transition-all duration-150
      `}
    >
      {/* Input handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-gray-400! hover:bg-blue-500!"
      />

      <div className="flex items-center gap-2">
        <div
          className={`
          p-1 rounded text-purple-600 dark:text-purple-400
          ${
            nodeData.executionStatus === "running"
              ? "bg-purple-100 dark:bg-purple-900/50"
              : nodeData.executionStatus === "success"
                ? "bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400"
                : nodeData.executionStatus === "error"
                  ? "bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400"
                  : "bg-purple-100 dark:bg-purple-900/30"
          }
        `}
        >
          <Layers className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
              {nodeData.label}
            </span>
            {nodeData.hasMock && (
              <FlaskConical className="w-3 h-3 text-purple-500 shrink-0" />
            )}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {metadata?.name ?? nodeData.functionId}
          </div>
        </div>
      </div>

      {/* Sub-node handle indicators (bottom bar) */}
      <div className="flex items-center justify-center gap-1 mt-2 pt-2 border-t border-purple-200 dark:border-purple-700">
        {subNodeHandles.map((handle, idx) => (
          <div
            key={handle.id}
            className={`px-2 py-0.5 text-xs rounded ${HANDLE_COLORS[idx % HANDLE_COLORS.length].split(" ")[0]} text-white`}
            title={handle.label ?? handle.id}
          >
            {handle.label ?? handle.id}
          </div>
        ))}
      </div>

      {/* Main output handle (right) - goes to next node after cluster completes */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="w-3 h-3 bg-gray-400! hover:bg-blue-500!"
      />

      {/* Sub-node handles (bottom) - connect to sub-nodes that execute with this node */}
      {subNodeHandles.map((handle, idx) => (
        <Handle
          key={handle.id}
          type="source"
          position={Position.Bottom}
          id={handle.id}
          className={`w-3 h-3 ${HANDLE_COLORS[idx % HANDLE_COLORS.length]}!`}
          style={{
            left: `${handleSpacing * (idx + 1)}%`,
          }}
          title={handle.label ?? handle.id}
        />
      ))}
    </div>
  );
});

ClusterRootNode.displayName = "ClusterRootNode";

// ============================================================================
// Sub-Node (attached to cluster root)
// ============================================================================

export const SubNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as FunctionNodeData;
  const metadata = registry.get(nodeData.functionId)?.metadata;
  const borderStyles = getExecutionStyles(nodeData.executionStatus, selected);

  return (
    <div
      className={`
        px-4 py-2 pt-4 rounded-lg shadow-md border-2 min-w-37.5
        bg-gradient-to-br from-cyan-50 to-white dark:from-cyan-900/20 dark:to-gray-800
        border-dashed
        ${borderStyles}
        transition-all duration-150
      `}
    >
      {/* Input handle from cluster root (top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-cyan-400! hover:bg-cyan-500! border-2 border-white!"
      />

      <div className="flex items-center gap-2">
        <div
          className={`
          p-1 rounded text-cyan-600 dark:text-cyan-400
          ${
            nodeData.executionStatus === "running"
              ? "bg-cyan-100 dark:bg-cyan-900/50"
              : nodeData.executionStatus === "success"
                ? "bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400"
                : nodeData.executionStatus === "error"
                  ? "bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400"
                  : "bg-cyan-100 dark:bg-cyan-900/30"
          }
        `}
        >
          <DynamicIcon name={metadata?.icon} className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
              {nodeData.label}
            </span>
            {nodeData.hasMock && (
              <FlaskConical className="w-3 h-3 text-purple-500 shrink-0" />
            )}
          </div>
          <div className="text-xs text-cyan-600 dark:text-cyan-400 truncate flex items-center gap-1">
            <span className="opacity-60">sub-node</span>
            <span>•</span>
            <span>{metadata?.name ?? nodeData.functionId}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

SubNode.displayName = "SubNode";
