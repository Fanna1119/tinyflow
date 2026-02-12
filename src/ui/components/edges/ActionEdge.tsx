/**
 * ActionEdge Component
 *
 * Custom edge that displays an action label badge (e.g. "default", "success", "error").
 * Clicking the badge opens a small dropdown to change the action.
 * The source node's registered actions determine the available options.
 */

import { memo, useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  getSmoothStepPath,
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
} from "@xyflow/react";

// Style presets for different action types
const ACTION_STYLES: Record<
  string,
  { bg: string; text: string; border: string; stroke: string }
> = {
  default: {
    bg: "bg-gray-100 dark:bg-gray-700",
    text: "text-gray-600 dark:text-gray-300",
    border: "border-gray-300 dark:border-gray-600",
    stroke: "#9ca3af",
  },
  success: {
    bg: "bg-green-100 dark:bg-green-900/40",
    text: "text-green-700 dark:text-green-300",
    border: "border-green-300 dark:border-green-700",
    stroke: "#22c55e",
  },
  error: {
    bg: "bg-red-100 dark:bg-red-900/40",
    text: "text-red-700 dark:text-red-300",
    border: "border-red-300 dark:border-red-700",
    stroke: "#ef4444",
  },
  next: {
    bg: "bg-blue-100 dark:bg-blue-900/40",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-300 dark:border-blue-700",
    stroke: "#3b82f6",
  },
  complete: {
    bg: "bg-purple-100 dark:bg-purple-900/40",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-300 dark:border-purple-700",
    stroke: "#a855f7",
  },
};

function getActionStyle(action: string) {
  return (
    ACTION_STYLES[action] ?? {
      bg: "bg-amber-100 dark:bg-amber-900/40",
      text: "text-amber-700 dark:text-amber-300",
      border: "border-amber-300 dark:border-amber-700",
      stroke: "#f59e0b",
    }
  );
}

export interface ActionEdgeData {
  /** Available actions from the source node's function metadata */
  availableActions?: string[];
  /** Callback to update this edge's action */
  onActionChange?: (edgeId: string, newAction: string) => void;
}

export const ActionEdge = memo(function ActionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  label,
  selected,
}: EdgeProps) {
  const edgeData = useMemo(() => (data ?? {}) as ActionEdgeData, [data]);
  const action = (label as string) || "default";
  const style = getActionStyle(action);
  const availableActions = edgeData.availableActions ?? ["default"];
  const hasMultipleActions = availableActions.length > 1;

  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  const handleActionSelect = useCallback(
    (newAction: string) => {
      edgeData.onActionChange?.(id, newAction);
      setShowDropdown(false);
    },
    [id, edgeData],
  );

  const isAnimated = action === "error";

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? "#3b82f6" : style.stroke,
          strokeWidth: selected ? 2.5 : action === "default" ? 1.5 : 2,
          ...(isAnimated
            ? {
                strokeDasharray: "5 5",
                animation: "dashmove 0.5s linear infinite",
              }
            : {}),
        }}
      />

      {/* Action label badge */}
      {(action !== "default" || hasMultipleActions) && (
        <EdgeLabelRenderer>
          <div
            ref={dropdownRef}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan"
          >
            {/* Badge button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (hasMultipleActions) {
                  setShowDropdown((prev) => !prev);
                }
              }}
              className={`
                px-2 py-0.5 text-[10px] font-semibold rounded-full border
                ${style.bg} ${style.text} ${style.border}
                ${hasMultipleActions ? "cursor-pointer hover:opacity-80" : "cursor-default"}
                transition-opacity shadow-sm
              `}
              title={
                hasMultipleActions
                  ? "Click to change edge action"
                  : `Action: ${action}`
              }
            >
              {action}
            </button>

            {/* Dropdown */}
            {showDropdown && hasMultipleActions && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 py-1 z-50 min-w-25">
                {availableActions.map((act) => {
                  const actStyle = getActionStyle(act);
                  const isActive = act === action;
                  return (
                    <button
                      key={act}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleActionSelect(act);
                      }}
                      className={`
                        w-full px-3 py-1.5 text-left text-xs flex items-center gap-2
                        hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors
                        ${isActive ? "font-semibold" : "font-normal"}
                      `}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${actStyle.bg} border ${actStyle.border}`}
                      />
                      <span className={actStyle.text}>{act}</span>
                      {isActive && (
                        <span className="ml-auto text-blue-500">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
