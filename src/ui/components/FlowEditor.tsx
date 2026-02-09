/**
 * Main Flow Editor Component
 * Combines React Flow with sidebar and config panel
 */

import { useCallback, useState, useMemo, useEffect } from "react";
import type { Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Sidebar } from "./Sidebar";
import { NodeConfigPanel } from "./NodeConfigPanel";
import { Toolbar } from "./Toolbar";
import { DebugPanel } from "./DebugPanel";
import { SettingsModal } from "./SettingsModal";
import { createEmptyWorkflow } from "./WorkflowTabs";
import { BundleModal } from "./BundleModal";
import { FlowCanvas } from "./FlowCanvas";
import { useFlowEditor } from "../hooks/useFlowEditor";
import { useDebugger } from "../hooks/useDebugger";
import { useFileOperations } from "../hooks/useFileOperations";
import { useWorkflowExecution } from "../hooks/useWorkflowExecution";
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
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBundleModal, setShowBundleModal] = useState(false);
  const [editorSettings, setEditorSettings] =
    useState<TinyFlowSettings>(DEFAULT_SETTINGS);
  const [profilingEnabled, setProfilingEnabled] = useState(false);

  // File operations hook
  const fileOps = useFileOperations({
    onImport: actions.importWorkflow,
    onExport: actions.exportWorkflow,
    onSave,
    onAfterImport: () => {
      const result = actions.validate();
      setValidationErrors(result.errors);
    },
  });

  // Workflow execution hook
  const execution = useWorkflowExecution({
    debugActions: {
      startSession: debugActions.startSession,
      endSession: debugActions.endSession,
      onNodeStart: debugActions.onNodeStart,
      onNodeComplete: debugActions.onNodeComplete,
      onNodeProfile: debugActions.onNodeProfile,
    },
    stepMode: debugState.stepMode,
    profiling: profilingEnabled,
    getMockValues: debugActions.getMockValues,
  });

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

  // Handle node selection
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
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

  // Run workflow
  const handleRun = useCallback(() => {
    const workflow = actions.exportWorkflow();
    setShowDebugPanel(true); // Auto-open debug panel
    execution.run(workflow);
  }, [actions, execution]);

  // Clear
  const handleClear = useCallback(() => {
    if (confirm("Are you sure you want to clear the workflow?")) {
      actions.clear();
      setValidationErrors([]);
      debugActions.reset();
      execution.reset();
    }
  }, [actions, debugActions, execution]);

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
        ref={fileOps.fileInputRef}
        type="file"
        accept=".json"
        onChange={fileOps.handleFileChange}
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
          onImport={fileOps.handleImport}
          onExport={fileOps.handleExport}
          onSave={fileOps.handleSave}
          canSave={fileOps.canSave}
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
          <FlowCanvas
            nodes={enhancedNodes}
            edges={state.edges}
            onNodesChange={actions.onNodesChange}
            onEdgesChange={actions.onEdgesChange}
            onConnect={actions.onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onAddNode={actions.addNode}
            settings={editorSettings}
            isRunning={execution.isRunning}
            validationErrors={validationErrors}
            onDismissValidation={() => setValidationErrors([])}
          />

          {/* Debug Panel */}
          <DebugPanel
            steps={debugState.steps}
            activeNodeId={debugState.activeNodeId}
            isOpen={showDebugPanel}
            onToggle={() => setShowDebugPanel(!showDebugPanel)}
            onClear={() => debugActions.clearSteps()}
            isRunning={execution.isRunning}
            duration={execution.lastDuration}
            hasTestValues={debugState.testValues.size > 0}
            enabledTestCount={
              Array.from(debugState.testValues.values()).filter(
                (v) => v.enabled,
              ).length
            }
            onStepClick={(nodeId) => actions.selectNode(nodeId)}
            stepMode={debugState.stepMode}
            onToggleStepMode={debugActions.toggleStepMode}
            isPaused={execution.isPaused}
            onNextStep={execution.step}
            profilingEnabled={profilingEnabled}
            onToggleProfiling={() => setProfilingEnabled((p) => !p)}
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
          nodeType={actions.getNodeType(selectedNode.id)}
          handles={actions.getNodeHandles(selectedNode.id)}
          onConvertToClusterRoot={() =>
            actions.convertToClusterRoot(selectedNode.id)
          }
          onConvertToRegularNode={() =>
            actions.convertToRegularNode(selectedNode.id)
          }
          onAddHandle={(label) =>
            actions.addClusterHandle(selectedNode.id, label)
          }
          onRemoveHandle={(handleId) =>
            actions.removeClusterHandle(selectedNode.id, handleId)
          }
          onRenameHandle={(handleId, newLabel) =>
            actions.renameClusterHandle(selectedNode.id, handleId, newLabel)
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
