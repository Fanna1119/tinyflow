/**
 * Node Configuration Panel
 * Edit parameters for selected nodes
 */

import { useState } from "react";
import {
  X,
  AlertTriangle,
  Settings,
  Code,
  FlaskConical,
  Layers,
  Plus,
  Trash2,
} from "lucide-react";
import { registry } from "../../../registry";
import type {
  FunctionParameter,
  NodeType,
  NodeHandle,
} from "../../../schema/types";
import type { MockValue } from "../../../compiler";

interface NodeConfigPanelProps {
  nodeId: string;
  functionId: string;
  label: string;
  params: Record<string, unknown>;
  hasError: boolean;
  onUpdateParams: (params: Record<string, unknown>) => void;
  onUpdateLabel: (label: string) => void;
  onClose: () => void;
  onDelete: () => void;
  /** Current test/mock value for this node */
  testValue?: MockValue;
  /** Callback to update test value */
  onUpdateTestValue?: (value: MockValue | null) => void;
  /** Current node type (default, clusterRoot, subNode) */
  nodeType?: NodeType;
  /** Current handles for cluster root nodes */
  handles?: NodeHandle[];
  /** Convert node to cluster root */
  onConvertToClusterRoot?: () => void;
  /** Convert cluster root back to regular node */
  onConvertToRegularNode?: () => void;
  /** Add a handle to cluster root */
  onAddHandle?: (label?: string) => void;
  /** Remove a handle from cluster root */
  onRemoveHandle?: (handleId: string) => void;
  /** Rename a handle */
  onRenameHandle?: (handleId: string, newLabel: string) => void;
}

type TabType = "params" | "test";

export function NodeConfigPanel({
  nodeId,
  functionId,
  label,
  params,
  hasError,
  onUpdateParams,
  onUpdateLabel,
  onClose,
  onDelete,
  testValue,
  onUpdateTestValue,
  nodeType,
  handles,
  onConvertToClusterRoot,
  onConvertToRegularNode,
  onAddHandle,
  onRemoveHandle,
  onRenameHandle,
}: NodeConfigPanelProps) {
  const metadata = registry.get(functionId)?.metadata;
  const [editingHandleId, setEditingHandleId] = useState<string | null>(null);
  const [editingHandleLabel, setEditingHandleLabel] = useState("");
  const [localParams, setLocalParams] = useState(params);
  const [localLabel, setLocalLabel] = useState(label);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonValue, setJsonValue] = useState(() =>
    JSON.stringify(params, null, 2),
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [trackedNodeId, setTrackedNodeId] = useState(nodeId);
  const [activeTab, setActiveTab] = useState<TabType>("params");

  // Test value state
  const [mockEnabled, setMockEnabled] = useState(testValue?.enabled ?? false);
  const [mockSuccess, setMockSuccess] = useState(testValue?.success ?? true);
  const [mockOutput, setMockOutput] = useState(() =>
    testValue?.output !== undefined
      ? JSON.stringify(testValue.output, null, 2)
      : "",
  );
  const [mockAction, setMockAction] = useState(testValue?.action ?? "default");
  const [mockDelay, setMockDelay] = useState(testValue?.delay ?? 0);
  const [mockOutputError, setMockOutputError] = useState<string | null>(null);

  // Sync local state when node changes - using state comparison pattern
  if (trackedNodeId !== nodeId) {
    setTrackedNodeId(nodeId);
    setLocalParams(params);
    setLocalLabel(label);
    setJsonValue(JSON.stringify(params, null, 2));
    setJsonError(null);
    // Reset test value state
    setMockEnabled(testValue?.enabled ?? false);
    setMockSuccess(testValue?.success ?? true);
    setMockOutput(
      testValue?.output !== undefined
        ? JSON.stringify(testValue.output, null, 2)
        : "",
    );
    setMockAction(testValue?.action ?? "default");
    setMockDelay(testValue?.delay ?? 0);
    setMockOutputError(null);
  }

  const handleParamChange = (name: string, value: unknown) => {
    const newParams = { ...localParams, [name]: value };
    setLocalParams(newParams);
    onUpdateParams(newParams);
    setJsonValue(JSON.stringify(newParams, null, 2));
  };

  const handleLabelChange = (value: string) => {
    setLocalLabel(value);
    onUpdateLabel(value);
  };

  const handleJsonChange = (value: string) => {
    setJsonValue(value);
    try {
      const parsed = JSON.parse(value);
      setLocalParams(parsed);
      onUpdateParams(parsed);
      setJsonError(null);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  // Update mock value helper
  const updateMockValue = (updates: Partial<MockValue>) => {
    if (!onUpdateTestValue) return;

    const newEnabled = updates.enabled ?? mockEnabled;
    const newSuccess = updates.success ?? mockSuccess;
    const newAction = updates.action ?? mockAction;
    const newDelay = updates.delay ?? mockDelay;

    // Parse output
    let parsedOutput: unknown = null;
    const outputStr =
      updates.output !== undefined
        ? typeof updates.output === "string"
          ? updates.output
          : JSON.stringify(updates.output, null, 2)
        : mockOutput;

    try {
      parsedOutput = outputStr ? JSON.parse(outputStr) : null;
      setMockOutputError(null);
    } catch (e) {
      setMockOutputError(e instanceof Error ? e.message : "Invalid JSON");
      // Don't update if JSON is invalid
      return;
    }

    // Update local state
    if (updates.enabled !== undefined) setMockEnabled(updates.enabled);
    if (updates.success !== undefined) setMockSuccess(updates.success);
    if (updates.action !== undefined) setMockAction(updates.action);
    if (updates.delay !== undefined) setMockDelay(updates.delay);
    if (updates.output !== undefined) setMockOutput(outputStr);

    onUpdateTestValue({
      enabled: newEnabled,
      success: newSuccess,
      output: parsedOutput,
      action: newAction,
      delay: newDelay,
    });
  };

  const clearMockValue = () => {
    setMockEnabled(false);
    setMockSuccess(true);
    setMockOutput("");
    setMockAction("default");
    setMockDelay(0);
    setMockOutputError(null);
    onUpdateTestValue?.(null);
  };

  return (
    <div className="w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-gray-400" />
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">
            Node Config
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Error Banner */}
      {hasError && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <div className="text-sm text-red-700 dark:text-red-300">
            Function <code className="font-mono">{functionId}</code> is not
            registered
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab("params")}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "params"
              ? "text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400"
              : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          <Settings className="w-4 h-4 inline-block mr-1.5" />
          Parameters
        </button>
        <button
          onClick={() => setActiveTab("test")}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "test"
              ? "text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400"
              : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          <FlaskConical className="w-4 h-4 inline-block mr-1.5" />
          Test
          {mockEnabled && (
            <span className="ml-1.5 w-2 h-2 bg-purple-500 rounded-full inline-block" />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === "params" && (
          <>
            {/* Node ID */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Node ID
              </label>
              <div className="text-sm font-mono text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 px-2 py-1.5 rounded">
                {nodeId}
              </div>
            </div>

            {/* Label */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Label
              </label>
              <input
                type="text"
                value={localLabel}
                onChange={(e) => handleLabelChange(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Function */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Function
              </label>
              <div className="text-sm font-mono text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 px-2 py-1.5 rounded">
                {functionId}
              </div>
              {metadata?.description && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {metadata.description}
                </p>
              )}
            </div>

            {/* Cluster Controls */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="w-4 h-4 text-purple-500" />
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Cluster Node
                </label>
              </div>

              {nodeType === "clusterRoot" ? (
                <div className="space-y-3">
                  <div className="text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-2 py-1.5 rounded">
                    This is a Cluster Root with {handles?.length ?? 0} sub-node
                    handles
                  </div>

                  {/* Handle list */}
                  {handles && handles.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Sub-node Handles
                      </label>
                      {handles.map((handle, index) => (
                        <div
                          key={handle.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{
                              backgroundColor: [
                                "#a855f7",
                                "#22c55e",
                                "#3b82f6",
                                "#f59e0b",
                                "#ef4444",
                              ][index % 5],
                            }}
                          />
                          {editingHandleId === handle.id ? (
                            <input
                              type="text"
                              value={editingHandleLabel}
                              onChange={(e) =>
                                setEditingHandleLabel(e.target.value)
                              }
                              onBlur={() => {
                                if (editingHandleLabel.trim()) {
                                  onRenameHandle?.(
                                    handle.id,
                                    editingHandleLabel.trim(),
                                  );
                                }
                                setEditingHandleId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  if (editingHandleLabel.trim()) {
                                    onRenameHandle?.(
                                      handle.id,
                                      editingHandleLabel.trim(),
                                    );
                                  }
                                  setEditingHandleId(null);
                                } else if (e.key === "Escape") {
                                  setEditingHandleId(null);
                                }
                              }}
                              className="flex-1 min-w-0 px-1.5 py-0.5 text-sm font-mono bg-white dark:bg-gray-800 border border-purple-300 dark:border-purple-600 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
                              autoFocus
                            />
                          ) : (
                            <button
                              onClick={() => {
                                setEditingHandleId(handle.id);
                                setEditingHandleLabel(
                                  handle.label ?? handle.id,
                                );
                              }}
                              className="flex-1 min-w-0 text-left font-mono text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 truncate"
                              title="Click to rename"
                            >
                              {handle.label ?? handle.id}
                            </button>
                          )}
                          <button
                            onClick={() => onRemoveHandle?.(handle.id)}
                            className="shrink-0 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            title="Remove handle"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add handle button */}
                  <button
                    onClick={() => onAddHandle?.()}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Handle
                  </button>

                  {/* Convert back to regular */}
                  <button
                    onClick={onConvertToRegularNode}
                    className="w-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    Convert to Regular Node
                  </button>
                </div>
              ) : nodeType === "subNode" ? (
                <div className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1.5 rounded">
                  This is a Sub-Node (connected to a cluster root)
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Convert this node to a cluster root to add parallel
                    sub-nodes.
                  </p>
                  <button
                    onClick={onConvertToClusterRoot}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg transition-colors"
                  >
                    <Layers className="w-4 h-4" />
                    Convert to Cluster Root
                  </button>
                </div>
              )}
            </div>

            {/* Parameters */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Parameters
                </label>
                <button
                  onClick={() => setJsonMode(!jsonMode)}
                  className={`text-xs flex items-center gap-1 px-2 py-1 rounded ${
                    jsonMode
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <Code className="w-3 h-3" />
                  JSON
                </button>
              </div>

              {jsonMode ? (
                <div>
                  <textarea
                    value={jsonValue}
                    onChange={(e) => handleJsonChange(e.target.value)}
                    className={`w-full h-48 px-3 py-2 text-sm font-mono border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 ${
                      jsonError
                        ? "border-red-300 focus:ring-red-500"
                        : "border-gray-200 dark:border-gray-600 focus:ring-blue-500"
                    }`}
                  />
                  {jsonError && (
                    <p className="mt-1 text-xs text-red-500">{jsonError}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {metadata?.params.map((param) => (
                    <ParameterInput
                      key={param.name}
                      param={param}
                      value={localParams[param.name]}
                      onChange={(value) => handleParamChange(param.name, value)}
                    />
                  ))}
                  {(!metadata || metadata.params.length === 0) && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                      No parameters defined
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "test" && (
          <>
            {/* Mock Enable Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Enable Mock
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Override this node's output during execution
                </p>
              </div>
              <button
                onClick={() => updateMockValue({ enabled: !mockEnabled })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                  mockEnabled ? "bg-purple-600" : "bg-gray-200 dark:bg-gray-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    mockEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {mockEnabled && (
              <>
                {/* Success/Failure Toggle */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                    Result Status
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateMockValue({ success: true })}
                      className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                        mockSuccess
                          ? "bg-green-100 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
                      }`}
                    >
                      ✓ Success
                    </button>
                    <button
                      onClick={() => updateMockValue({ success: false })}
                      className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors ${
                        !mockSuccess
                          ? "bg-red-100 border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
                      }`}
                    >
                      ✗ Error
                    </button>
                  </div>
                </div>

                {/* Mock Output */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Mock Output (JSON)
                  </label>
                  <textarea
                    value={mockOutput}
                    onChange={(e) => {
                      setMockOutput(e.target.value);
                      // Validate but don't update until blur
                      try {
                        if (e.target.value) JSON.parse(e.target.value);
                        setMockOutputError(null);
                      } catch (err) {
                        setMockOutputError(
                          err instanceof Error ? err.message : "Invalid JSON",
                        );
                      }
                    }}
                    onBlur={() => {
                      if (!mockOutputError) {
                        updateMockValue({ output: mockOutput });
                      }
                    }}
                    placeholder='{"key": "value"}'
                    className={`w-full h-32 px-3 py-2 text-sm font-mono border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 ${
                      mockOutputError
                        ? "border-red-300 focus:ring-red-500"
                        : "border-gray-200 dark:border-gray-600 focus:ring-purple-500"
                    }`}
                  />
                  {mockOutputError && (
                    <p className="mt-1 text-xs text-red-500">
                      {mockOutputError}
                    </p>
                  )}
                </div>

                {/* Action */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Edge Action
                  </label>
                  <select
                    value={mockAction}
                    onChange={(e) =>
                      updateMockValue({ action: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="default">default</option>
                    <option value="success">success</option>
                    <option value="error">error</option>
                    <option value="condition">condition</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Determines which edge to follow after this node
                  </p>
                </div>

                {/* Delay */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Simulated Delay (ms)
                  </label>
                  <input
                    type="number"
                    value={mockDelay}
                    onChange={(e) =>
                      updateMockValue({ delay: parseInt(e.target.value) || 0 })
                    }
                    min={0}
                    max={10000}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Adds artificial delay to simulate slow operations
                  </p>
                </div>

                {/* Clear Button */}
                <button
                  onClick={clearMockValue}
                  className="w-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Clear Mock Values
                </button>
              </>
            )}

            {!mockEnabled && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <FlaskConical className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  Enable mock to override this node's output
                </p>
                <p className="text-xs mt-1">
                  Useful for testing different scenarios
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onDelete}
          className="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        >
          Delete Node
        </button>
      </div>
    </div>
  );
}

interface ParameterInputProps {
  param: FunctionParameter;
  value: unknown;
  onChange: (value: unknown) => void;
}

function ParameterInput({ param, value, onChange }: ParameterInputProps) {
  const id = `param-${param.name}`;

  const renderInput = () => {
    switch (param.type) {
      case "boolean":
        return (
          <input
            type="checkbox"
            id={id}
            checked={Boolean(value ?? param.default)}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
        );

      case "number":
        return (
          <input
            type="number"
            id={id}
            value={String(value ?? param.default ?? "")}
            onChange={(e) =>
              onChange(e.target.value ? Number(e.target.value) : undefined)
            }
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        );

      case "object":
      case "array":
        return (
          <textarea
            id={id}
            value={
              typeof value === "object" && value !== null
                ? JSON.stringify(value, null, 2)
                : String(value ?? JSON.stringify(param.default) ?? "")
            }
            onChange={(e) => {
              try {
                onChange(JSON.parse(e.target.value));
              } catch {
                // Keep as string if not valid JSON
              }
            }}
            className="w-full h-20 px-3 py-2 text-sm font-mono border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        );

      default: // string
        return (
          <input
            type="text"
            id={id}
            value={String(value ?? param.default ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        );
    }
  };

  return (
    <div>
      <label
        htmlFor={id}
        className={`block text-xs font-medium mb-1 ${
          param.required
            ? "text-gray-700 dark:text-gray-300"
            : "text-gray-500 dark:text-gray-400"
        }`}
      >
        {param.name}
        {param.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {renderInput()}
      {param.description && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {param.description}
        </p>
      )}
    </div>
  );
}
