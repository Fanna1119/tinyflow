/**
 * Main Flow Editor Component
 * Combines React Flow with sidebar and config panel
 */

import { useCallback, useRef, useState, useMemo, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Sidebar } from "./Sidebar";
import { NodeConfigPanel } from "./NodeConfigPanel";
import { Toolbar } from "./Toolbar";
import { DebugPanel } from "./DebugPanel";
import { SettingsModal } from "./SettingsModal";
import { createEmptyWorkflow } from "./WorkflowTabs";
import { BundleModal } from "./BundleModal";
import { nodeTypes } from "./nodeTypes";
import { useFlowEditor } from "../hooks/useFlowEditor";
import { useDebugger } from "../hooks/useDebugger";
import { executeWorkflowOnServer } from "../utils/serverApi";
import type { WorkflowDefinition } from "../../schema/types";
import {
  type TinyFlowSettings,
  DEFAULT_SETTINGS,
  initSettingsAccess,
  loadSettings,
} from "../utils/settings";

interface FlowEditorProps {
  initialWorkflow?: WorkflowDefinition;
  onSave?: (workflow: WorkflowDefinition) => void;
}

export function FlowEditor({ initialWorkflow, onSave }: FlowEditorProps) {
  const [state, actions] = useFlowEditor(
    initialWorkflow ?? createEmptyWorkflow("Untitled Workflow"),
  );
  const [debugState, debugActions] = useDebugger();
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBundleModal, setShowBundleModal] = useState(false);
  const [lastDuration, setLastDuration] = useState<number | undefined>();
  const [hasPendingSteps, setHasPendingSteps] = useState(false);
  const [editorSettings, setEditorSettings] =
    useState<TinyFlowSettings>(DEFAULT_SETTINGS);
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(
    null,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reactFlowInstance = useRef<ReactFlowInstance<any> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load settings on mount
  useEffect(() => {
    initSettingsAccess().then((hasAccess) => {
      if (hasAccess) {
        loadSettings().then(setEditorSettings);
      }
    });
  }, []);

  // Enhance nodes with execution status and mock indicators
  const enhancedNodes = useMemo(() => {
    return state.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        executionStatus: debugState.nodeStatus.get(node.id),
        hasMock:
          debugState.testValues.has(node.id) &&
          debugState.testValues.get(node.id)?.enabled,
      },
    }));
  }, [state.nodes, debugState.nodeStatus, debugState.testValues]);

  // Get selected node data
  const selectedNode = state.selectedNodeId
    ? state.nodes.find((n) => n.id === state.selectedNodeId)
    : null;

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

      actions.addNode(functionId, position);
    },
    [actions],
  );

  // Handle node selection
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      actions.selectNode(node.id);
    },
    [actions],
  );

  const onPaneClick = useCallback(() => {
    actions.selectNode(null);
  }, [actions]);

  // Validation
  const handleValidate = useCallback(() => {
    const result = actions.validate();
    setValidationErrors(result.errors);
  }, [actions]);

  // Import using File System Access API (for save support) or fallback
  const handleImport = useCallback(async () => {
    // Try File System Access API first (Chrome/Edge)
    if ("showOpenFilePicker" in window) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [handle] = await (window as any).showOpenFilePicker({
          types: [
            {
              description: "JSON files",
              accept: { "application/json": [".json"] },
            },
          ],
        });
        const file = await handle.getFile();
        const json = await file.text();
        const result = actions.importWorkflow(json);
        if (!result.success) {
          alert(`Import failed: ${result.error}`);
        } else {
          if (result.warnings?.length) {
            console.warn("Import warnings:", result.warnings);
            // Optionally show to user
            alert(`Imported with warnings:\n• ${result.warnings.join("\n• ")}`);
          }
          setFileHandle(handle); // Store handle for saving
          handleValidate();
        }
      } catch (err) {
        // User cancelled or API not supported
        if ((err as Error).name !== "AbortError") {
          console.error("File picker error:", err);
        }
      }
    } else {
      // Fallback to file input
      fileInputRef.current?.click();
    }
  }, [actions, handleValidate]);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const json = e.target?.result as string;
        const result = actions.importWorkflow(json);
        if (!result.success) {
          alert(`Import failed: ${result.error}`);
        } else {
          if (result.warnings?.length) {
            console.warn("Import warnings:", result.warnings);
            alert(`Imported with warnings:\n• ${result.warnings.join("\n• ")}`);
          }
          setFileHandle(null); // No handle available with fallback
          handleValidate();
        }
      };
      reader.readAsText(file);

      // Reset input
      event.target.value = "";
    },
    [actions, handleValidate],
  );

  // Save to file (overwrites original)
  const handleSave = useCallback(async () => {
    const workflow = actions.exportWorkflow();
    const json = JSON.stringify(workflow, null, 2);

    if (fileHandle) {
      // Save to the same file
      try {
        const writable = await fileHandle.createWritable();
        await writable.write(json);
        await writable.close();
        onSave?.(workflow);
      } catch (err) {
        console.error("Save failed:", err);
        alert("Save failed. Try using Export instead.");
      }
    } else if ("showSaveFilePicker" in window) {
      // No existing file, prompt for save location
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: `${workflow.id}.json`,
          types: [
            {
              description: "JSON files",
              accept: { "application/json": [".json"] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        setFileHandle(handle); // Store for future saves
        onSave?.(workflow);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Save failed:", err);
        }
      }
    } else {
      // Fallback: download
      alert(
        "Your browser does not support direct file saving. Use Export instead.",
      );
    }
  }, [actions, fileHandle, onSave]);

  // Export
  const handleExport = useCallback(() => {
    const workflow = actions.exportWorkflow();
    const json = JSON.stringify(workflow, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workflow.id}.json`;
    a.click();
    URL.revokeObjectURL(url);

    onSave?.(workflow);
  }, [actions, onSave]);

  // Store for step-by-step playback
  const pendingEventsRef = useRef<
    Array<{
      type: "start" | "complete";
      nodeId: string;
      params?: Record<string, unknown>;
      success?: boolean;
      output?: unknown;
    }>
  >([]);
  const executionResultRef = useRef<{
    success: boolean;
    duration: number;
  } | null>(null);

  // Process next step in step mode
  const processNextEvent = useCallback(() => {
    if (pendingEventsRef.current.length === 0) {
      setHasPendingSteps(false);
      setIsRunning(false);
      // End session with stored result
      if (executionResultRef.current) {
        debugActions.endSession(executionResultRef.current.success);
        setLastDuration(executionResultRef.current.duration);
        executionResultRef.current = null;
      }
      return false;
    }

    const event = pendingEventsRef.current.shift()!;
    if (event.type === "start") {
      debugActions.onNodeStart(event.nodeId, event.params || {});
    } else {
      debugActions.onNodeComplete(event.nodeId, event.success!, event.output);
    }

    // Update pending state
    setHasPendingSteps(pendingEventsRef.current.length > 0);

    // If no more events, we're done
    if (pendingEventsRef.current.length === 0) {
      setIsRunning(false);
      if (executionResultRef.current) {
        debugActions.endSession(executionResultRef.current.success);
        setLastDuration(executionResultRef.current.duration);
        executionResultRef.current = null;
      }
    }

    return pendingEventsRef.current.length > 0;
  }, [debugActions]);

  // Handle step button click
  const handleStep = useCallback(() => {
    processNextEvent();
  }, [processNextEvent]);

  // Run workflow
  const handleRun = useCallback(async () => {
    const workflow = actions.exportWorkflow();
    setIsRunning(true);
    setLastDuration(undefined);
    setShowDebugPanel(true); // Auto-open debug panel
    setHasPendingSteps(false);

    // Start debug session
    debugActions.startSession();
    pendingEventsRef.current = [];
    executionResultRef.current = null;

    // Convert mock values to plain object for server
    const mockValuesObj: Record<string, unknown> = {};
    const mockMap = debugActions.getMockValues();
    if (mockMap) {
      for (const [key, value] of mockMap.entries()) {
        mockValuesObj[key] = value;
      }
    }

    try {
      if (debugState.stepMode) {
        // Step mode: collect all events first, then play back one by one
        const collectedEvents: Array<{
          type: "start" | "complete";
          nodeId: string;
          params?: Record<string, unknown>;
          success?: boolean;
          output?: unknown;
        }> = [];

        const result = await executeWorkflowOnServer(workflow, {
          mockValues:
            Object.keys(mockValuesObj).length > 0 ? mockValuesObj : undefined,
          callbacks: {
            onNodeStart: (nodeId, params) => {
              collectedEvents.push({ type: "start", nodeId, params });
            },
            onNodeComplete: (nodeId, success, output) => {
              collectedEvents.push({
                type: "complete",
                nodeId,
                success,
                output,
              });
            },
            onError: (nodeId, error) => {
              console.error(`Error in "${nodeId}": ${error}`);
            },
          },
        });

        // Store events for playback and result for later
        pendingEventsRef.current = collectedEvents;
        executionResultRef.current = {
          success: result.success,
          duration: result.duration,
        };

        if (collectedEvents.length > 0) {
          setHasPendingSteps(true);
          // Process first event automatically
          processNextEvent();
        } else {
          // No events, end immediately
          debugActions.endSession(result.success);
          setLastDuration(result.duration);
          setIsRunning(false);
        }
      } else {
        // Normal mode: show events in real-time
        const result = await executeWorkflowOnServer(workflow, {
          mockValues:
            Object.keys(mockValuesObj).length > 0 ? mockValuesObj : undefined,
          callbacks: {
            onNodeStart: (nodeId, params) => {
              debugActions.onNodeStart(nodeId, params);
            },
            onNodeComplete: (nodeId, success, output) => {
              debugActions.onNodeComplete(nodeId, success, output);
            },
            onError: (nodeId, error) => {
              console.error(`Error in "${nodeId}": ${error}`);
            },
          },
        });

        debugActions.endSession(result.success);
        setLastDuration(result.duration);
        setIsRunning(false);
        console.log("Execution result:", result);
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Unknown error";
      debugActions.endSession(false);
      setIsRunning(false);
      setHasPendingSteps(false);
      console.error("Execution error:", errorMsg);
    }
  }, [actions, debugActions, debugState.stepMode, processNextEvent]);

  // Clear
  const handleClear = useCallback(() => {
    if (confirm("Are you sure you want to clear the workflow?")) {
      actions.clear();
      setValidationErrors([]);
      debugActions.reset();
    }
  }, [actions, debugActions]);

  // Get current workflow for bundle modal
  const currentWorkflow = useMemo(() => {
    const workflow = actions.exportWorkflow();
    return [
      {
        id: workflow.id,
        name: workflow.name,
        workflow,
      },
    ];
  }, [actions]);

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-950">
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Sidebar */}
      <Sidebar onAddNode={actions.addNode} />

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <Toolbar
          workflowName={state.workflowMeta.name}
          isDirty={state.isDirty}
          validationErrors={validationErrors}
          onImport={handleImport}
          onExport={handleExport}
          onSave={handleSave}
          canSave={fileHandle !== null || "showSaveFilePicker" in window}
          onRun={handleRun}
          onClear={handleClear}
          onValidate={handleValidate}
          onNameChange={(name) => actions.updateMeta({ name })}
          onSettings={() => setShowSettings(true)}
          onBundle={() => setShowBundleModal(true)}
          showBundle={true}
        />

        {/* React Flow Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={enhancedNodes}
            edges={state.edges}
            onNodesChange={actions.onNodesChange}
            onEdgesChange={actions.onEdgesChange}
            onConnect={actions.onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onInit={(instance) => {
              reactFlowInstance.current = instance;
            }}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid={editorSettings.editor.snapToGrid}
            snapGrid={[
              editorSettings.editor.gridSize,
              editorSettings.editor.gridSize,
            ]}
            defaultEdgeOptions={{
              type: "smoothstep",
              animated: false,
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={editorSettings.editor.gridSize} size={1} />
            <Controls />
            {editorSettings.editor.showMinimap && (
              <MiniMap
                nodeColor={(node) =>
                  node.type === "error" ? "#ef4444" : "#3b82f6"
                }
                maskColor="rgba(0, 0, 0, 0.1)"
              />
            )}

            {/* Running indicator */}
            {isRunning && (
              <Panel position="top-center">
                <div className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Running workflow...
                </div>
              </Panel>
            )}

            {/* Validation errors */}
            {validationErrors.length > 0 && (
              <Panel position="top-right">
                <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 max-w-sm shadow-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      {validationErrors.length} issue
                      {validationErrors.length > 1 ? "s" : ""}
                    </span>
                    <button
                      onClick={() => setValidationErrors([])}
                      className="text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200 text-xs"
                    >
                      Dismiss
                    </button>
                  </div>
                  <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
                    {validationErrors.slice(0, 5).map((err, i) => (
                      <li key={i}>• {err}</li>
                    ))}
                    {validationErrors.length > 5 && (
                      <li className="text-amber-500">
                        ...and {validationErrors.length - 5} more
                      </li>
                    )}
                  </ul>
                </div>
              </Panel>
            )}
          </ReactFlow>

          {/* Debug Panel */}
          <DebugPanel
            steps={debugState.steps}
            activeNodeId={debugState.activeNodeId}
            isOpen={showDebugPanel}
            onToggle={() => setShowDebugPanel(!showDebugPanel)}
            onClear={() => debugActions.clearSteps()}
            isRunning={isRunning}
            duration={lastDuration}
            hasTestValues={debugState.testValues.size > 0}
            enabledTestCount={
              Array.from(debugState.testValues.values()).filter(
                (v) => v.enabled,
              ).length
            }
            onStepClick={(nodeId) => actions.selectNode(nodeId)}
            stepMode={debugState.stepMode}
            onToggleStepMode={debugActions.toggleStepMode}
            isPaused={hasPendingSteps && debugState.stepMode}
            onNextStep={handleStep}
          />
        </div>
      </div>

      {/* Config Panel */}
      {selectedNode && (
        <NodeConfigPanel
          nodeId={selectedNode.id}
          functionId={selectedNode.data.functionId as string}
          label={selectedNode.data.label as string}
          params={(selectedNode.data.params as Record<string, unknown>) ?? {}}
          hasError={state.nodeErrors.has(selectedNode.id)}
          onUpdateParams={(params) =>
            actions.updateNodeParams(selectedNode.id, params)
          }
          onUpdateLabel={(label) =>
            actions.updateNodeLabel(selectedNode.id, label)
          }
          onClose={() => actions.selectNode(null)}
          onDelete={() => actions.removeNode(selectedNode.id)}
          testValue={debugState.testValues.get(selectedNode.id)}
          onUpdateTestValue={(value) =>
            debugActions.setTestValue(selectedNode.id, value)
          }
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSettingsChange={(settings) => {
          setEditorSettings(settings);
        }}
      />

      {/* Bundle Modal */}
      <BundleModal
        isOpen={showBundleModal}
        onClose={() => setShowBundleModal(false)}
        workflows={currentWorkflow}
      />
    </div>
  );
}
