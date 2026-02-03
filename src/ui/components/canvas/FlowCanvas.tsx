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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { nodeTypes } from "../nodes/nodeTypes";
import { ValidationPanel } from "./ValidationPanel";
import { RunningIndicator } from "./RunningIndicator";
import type { TinyFlowSettings } from "../../utils/settings";

interface FlowCanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onPaneClick: () => void;
  onAddNode: (functionId: string, position: { x: number; y: number }) => void;
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

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onInit={(instance) => {
        reactFlowInstance.current = instance;
      }}
      nodeTypes={nodeTypes}
      fitView
      snapToGrid={settings.editor.snapToGrid}
      snapGrid={[settings.editor.gridSize, settings.editor.gridSize]}
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
          nodeColor={(node) => (node.type === "error" ? "#ef4444" : "#3b82f6")}
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
