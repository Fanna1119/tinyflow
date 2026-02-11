/**
 * Flow Canvas Component
 * ReactFlow canvas with background, controls, and overlays
 */

import { useCallback, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  type ReactFlowInstance,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type OnSelectionChangeFunc,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { nodeTypes } from "../nodes/nodeTypes";
import { SubNodeEdge } from "../edges/SubNodeEdge";
import { ValidationPanel } from "./ValidationPanel";
import { RunningIndicator } from "./RunningIndicator";
import type { TinyFlowSettings } from "../../utils/settings";

// Edge types for cluster connections
const edgeTypes = {
  subnode: SubNodeEdge,
};

interface FlowCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onPaneClick: () => void;
  onAddNode: (functionId: string, position: { x: number; y: number }) => void;
  onMoveNodeToCluster?: (nodeId: string, clusterId: string) => boolean;
  onSelectionChange?: OnSelectionChangeFunc;
  settings: TinyFlowSettings;
  isRunning: boolean;
  validationErrors: string[];
  onDismissValidation: () => void;
}

export function FlowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onPaneClick,
  onAddNode,
  onMoveNodeToCluster,
  onSelectionChange,
  settings,
  isRunning,
  validationErrors,
  onDismissValidation,
}: FlowCanvasProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reactFlowInstance = useRef<ReactFlowInstance<any> | null>(null);

  // Handle drop from sidebar
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const functionId = event.dataTransfer.getData(
        "application/tinyflow-function",
      );
      if (!functionId || !reactFlowInstance.current) return;

      const position = reactFlowInstance.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      onAddNode(functionId, position);
    },
    [onAddNode],
  );

  // Handle node drag stop - check if dropped onto a cluster
  const onNodeDragStop = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (!onMoveNodeToCluster || !reactFlowInstance.current) return;

      // Don't move cluster nodes into other clusters
      if (node.type === "cluster") return;

      // Find cluster nodes and check if this node overlaps any of them
      const clusterNodes = nodes.filter(
        (n) => n.type === "cluster" && n.id !== node.id,
      );

      for (const cluster of clusterNodes) {
        // Get cluster bounds (position and size)
        const clusterWidth = cluster.measured?.width ?? 200;
        const clusterHeight = cluster.measured?.height ?? 150;

        const clusterBounds = {
          left: cluster.position.x,
          right: cluster.position.x + clusterWidth,
          top: cluster.position.y,
          bottom: cluster.position.y + clusterHeight,
        };

        // Check if node center is within cluster bounds
        const nodeWidth = node.measured?.width ?? 150;
        const nodeHeight = node.measured?.height ?? 40;
        const nodeCenterX = node.position.x + nodeWidth / 2;
        const nodeCenterY = node.position.y + nodeHeight / 2;

        if (
          nodeCenterX >= clusterBounds.left &&
          nodeCenterX <= clusterBounds.right &&
          nodeCenterY >= clusterBounds.top &&
          nodeCenterY <= clusterBounds.bottom
        ) {
          // Node was dropped onto this cluster
          onMoveNodeToCluster(node.id, cluster.id);
          break;
        }
      }
    },
    [nodes, onMoveNodeToCluster],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      onNodeDragStop={onNodeDragStop}
      onPaneClick={onPaneClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onInit={(instance) => {
        reactFlowInstance.current = instance;
      }}
      onSelectionChange={onSelectionChange}
      selectionOnDrag
      panOnDrag={[1, 2]}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      snapToGrid={settings.editor.snapToGrid}
      snapGrid={[settings.editor.gridSize, settings.editor.gridSize]}
      deleteKeyCode={["Backspace", "Delete"]}
      defaultEdgeOptions={{
        type: "smoothstep",
        animated: false,
      }}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={settings.editor.gridSize} size={1} />
      <Controls />
      {settings.editor.showMinimap && (
        <MiniMap
          nodeColor={(node) => {
            if (node.type === "error") return "#ef4444";
            if (node.type === "clusterRoot") return "#a855f7";
            if (node.type === "subNode") return "#06b6d4";
            return "#3b82f6";
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
      )}

      {/* Running indicator */}
      {isRunning && (
        <Panel position="top-center">
          <RunningIndicator />
        </Panel>
      )}

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <Panel position="top-right">
          <ValidationPanel
            errors={validationErrors}
            onDismiss={onDismissValidation}
          />
        </Panel>
      )}
    </ReactFlow>
  );
}
