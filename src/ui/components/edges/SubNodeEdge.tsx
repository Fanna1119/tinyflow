/**
 * SubNode Edge Component
 * Animated edge style for connections between cluster root nodes and their sub-nodes
 * Features: colored bezier path, animated circle indicator, gradient stroke
 */

import { memo } from "react";
import {
  getBezierPath,
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
} from "@xyflow/react";

// Edge colors matching handle colors
const SUBNODE_EDGE_COLORS = {
  purple: { stroke: "#a855f7", glow: "#c084fc" },
  cyan: { stroke: "#06b6d4", glow: "#22d3ee" },
  amber: { stroke: "#f59e0b", glow: "#fbbf24" },
  emerald: { stroke: "#10b981", glow: "#34d399" },
  rose: { stroke: "#f43f5e", glow: "#fb7185" },
};

type ColorKey = keyof typeof SUBNODE_EDGE_COLORS;

export interface SubNodeEdgeData {
  /** Color theme for this edge */
  color?: ColorKey;
  /** Label to display on the edge */
  label?: string;
}

export const SubNodeEdge = memo(function SubNodeEdge({
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
  const edgeData = (data ?? {}) as SubNodeEdgeData;
  const colorKey = edgeData.color ?? "purple";
  const colors = SUBNODE_EDGE_COLORS[colorKey];

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const displayLabel = edgeData.label ?? label;

  return (
    <>
      {/* Glow effect layer */}
      <BaseEdge
        id={`${id}-glow`}
        path={edgePath}
        style={{
          stroke: colors.glow,
          strokeWidth: 8,
          opacity: 0.3,
          filter: "blur(4px)",
        }}
      />

      {/* Main edge path */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: colors.stroke,
          strokeWidth: selected ? 3 : 2,
          strokeDasharray: "8 4",
          animation: "dashmove 0.5s linear infinite",
        }}
      />

      {/* Edge label */}
      {displayLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 10,
              backgroundColor: colors.stroke,
              color: "white",
              padding: "2px 6px",
              borderRadius: 4,
              fontWeight: 500,
              pointerEvents: "all",
              boxShadow: `0 2px 4px ${colors.glow}40`,
            }}
            className="nodrag nopan"
          >
            {displayLabel}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Animated circle indicator */}
      <circle
        r="4"
        fill={colors.stroke}
        style={{
          filter: `drop-shadow(0 0 3px ${colors.glow})`,
        }}
      >
        <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
      </circle>
    </>
  );
});

// CSS animation for dashed line movement (add to global CSS or use styled-components)
// @keyframes dashmove { to { stroke-dashoffset: -12; } }
