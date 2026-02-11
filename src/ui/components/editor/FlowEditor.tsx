/**
 * Main Flow Editor Component
 * Combines React Flow with sidebar and config panel
 */

import { useCallback, useState, useMemo, useEffect, useRef } from "react";
import type { Node, Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Puzzle } from "lucide-react";

import { Sidebar } from "./Sidebar";
import { Toolbar } from "./Toolbar";
import { createEmptyWorkflow } from "./WorkflowTabs";
import { NodeConfigPanel } from "../debug/NodeConfigPanel";
import { DebugPanel } from "../debug/DebugPanel";
import { SettingsModal } from "../modals/SettingsModal";
import { BundleModal } from "../modals/BundleModal";
import { TemplateGallery } from "../modals/TemplateGallery";
import { SaveAsTemplateModal } from "../modals/SaveAsTemplateModal";
import { SaveAsPatternModal } from "../modals/SaveAsPatternModal";
import { FlowCanvas } from "../canvas/FlowCanvas";
import { useFlowEditor } from "../../hooks/useFlowEditor";
import { useDebugger } from "../../hooks/useDebugger";
import { useFileOperations } from "../../hooks/useFileOperations";
import { useWorkflowExecution } from "../../hooks/useWorkflowExecution";
import { useDataFlowAnalysis } from "../../hooks/useDataFlowAnalysis";
import type { WorkflowDefinition } from "../../../schema/types";
import { saveTemplate, savePattern } from "../../utils/serverApi";
import {
  type TinyFlowSettings,
  DEFAULT_SETTINGS,
  initSettingsAccess,
  loadSettings,
} from "../../utils/settings";

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
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showSavePattern, setShowSavePattern] = useState(false);
  const [editorSettings, setEditorSettings] =
    useState<TinyFlowSettings>(DEFAULT_SETTINGS);
  const [profilingEnabled, setProfilingEnabled] = useState(false);

  // Selection tracking for pattern saving
  const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<Edge[]>([]);

  // Ref for sidebar pattern refresh
  const patternsRefreshRef = useRef<(() => void) | null>(null);

  // Create ref for file input
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Analyze data flow across the graph
  const dataFlow = useDataFlowAnalysis(state.nodes, state.edges);

  // Enhance nodes with execution status, mock indicators, and data flow
  const enhancedNodes = useMemo(() => {
    return state.nodes.map((node) => {
      const flow = dataFlow.get(node.id);
      const availableKeySet = new Set(
        flow?.availableKeys.map((k) => k.key) ?? [],
      );
      const connectedInputs = new Set(
        (flow?.consumes ?? [])
          .filter((c) => availableKeySet.has(c.key))
          .map((c) => c.key),
      );

      return {
        ...node,
        data: {
          ...node.data,
          executionStatus: debugState.nodeStatus.get(node.id),
          hasMock:
            debugState.testValues.has(node.id) &&
            debugState.testValues.get(node.id)?.enabled,
          producedKeys: flow?.produces.map((p) => p.key) ?? [],
          consumedKeys: flow?.consumes.map((c) => c.key) ?? [],
          connectedInputs,
        },
      };
    });
  }, [state.nodes, debugState.nodeStatus, debugState.testValues, dataFlow]);

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

  // Save current workflow as a template
  const handleSaveAsTemplate = useCallback(
    async (templateMeta: import("../../templates/types").WorkflowTemplate) => {
      const workflow = actions.exportWorkflow();

      const fullTemplate: import("../../templates/types").WorkflowTemplate = {
        ...templateMeta,
        nodes: workflow.nodes,
        edges: workflow.edges,
        startNodeId: workflow.flow?.startNodeId ?? workflow.nodes[0]?.id ?? "",
      };

      await saveTemplate(fullTemplate);
      setShowSaveTemplate(false);
    },
    [actions],
  );

  // Handle selection changes from the canvas
  const handleSelectionChange = useCallback(
    ({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) => {
      setSelectedNodes(nodes);
      setSelectedEdges(edges);
    },
    [],
  );

  // Save selected nodes/edges as a reusable pattern
  const handleSaveAsPattern = useCallback(
    async (pattern: import("../../templates/types").WorkflowPattern) => {
      await savePattern(pattern);
      setShowSavePattern(false);
      // Refresh sidebar patterns list
      patternsRefreshRef.current?.();
    },
    [],
  );

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
        onChange={fileOps.handleFileChange}
        className="hidden"
      />

      {/* Sidebar */}
      <Sidebar
        onAddNode={actions.addNode}
        onInsertPattern={actions.insertPattern}
        onOpenTemplates={() => setShowTemplateGallery(true)}
        onPatternsRefreshRef={patternsRefreshRef}
      />

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
          onSaveAsTemplate={() => setShowSaveTemplate(true)}
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
            onSelectionChange={handleSelectionChange}
            settings={editorSettings}
            isRunning={execution.isRunning}
            validationErrors={validationErrors}
            onDismissValidation={() => setValidationErrors([])}
          />

          {/* Floating "Save as Pattern" button — visible when ≥ 1 node is selected */}
          {selectedNodes.length > 0 && (
            <div className="absolute top-3 left-3 z-10">
              <button
                onClick={() => setShowSavePattern(true)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-full shadow-lg transition-all hover:scale-105"
              >
                <Puzzle className="w-4 h-4" />
                Save {selectedNodes.length} node
                {selectedNodes.length !== 1 ? "s" : ""} as Pattern
              </button>
            </div>
          )}

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
          dataFlow={dataFlow.get(selectedNode.id)}
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

      {/* Template Gallery */}
      <TemplateGallery
        isOpen={showTemplateGallery}
        onClose={() => setShowTemplateGallery(false)}
        onSelect={(template) => {
          actions.loadTemplate(template);
        }}
      />

      {/* Save As Template */}
      <SaveAsTemplateModal
        isOpen={showSaveTemplate}
        onClose={() => setShowSaveTemplate(false)}
        onSave={handleSaveAsTemplate}
        defaultName={state.workflowMeta.name}
        defaultDescription={state.workflowMeta.description}
        nodeCount={state.nodes.length}
        edgeCount={state.edges.length}
      />

      {/* Save As Pattern */}
      <SaveAsPatternModal
        isOpen={showSavePattern}
        onClose={() => setShowSavePattern(false)}
        onSave={handleSaveAsPattern}
        selectedNodes={selectedNodes}
        selectedEdges={selectedEdges}
      />
    </div>
  );
}
