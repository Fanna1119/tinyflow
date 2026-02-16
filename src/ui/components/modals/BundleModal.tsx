/**
 * Bundle Modal Component
 * UI for bundling multiple workflows into a single deployable package
 */

import { useState, useCallback, useEffect } from "react";
import {
  X,
  Package,
  Check,
  Server,
  FileCode,
  FolderOutput,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle,
} from "lucide-react";
import type { WorkflowDefinition } from "../../../schema/types";
import type { WorkflowBundleEntry, BundleOptions } from "../../bundle/types";

// ============================================================================
// Types
// ============================================================================

interface BundleModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Available workflows to bundle */
  workflows: Array<{
    id: string;
    name: string;
    workflow: WorkflowDefinition;
  }>;
}

interface WorkflowSelection {
  workflowId: string;
  exportName: string;
  endpointPath: string;
  methods: ("GET" | "POST" | "PUT" | "DELETE")[];
  included: boolean;
  stream: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function toExportName(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .replace(/^(\d)/, "_$1") || "workflow"
  );
}

function toEndpointPath(name: string): string {
  return (
    "/api/" +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  );
}

// ============================================================================
// Component
// ============================================================================

export function BundleModal({ isOpen, onClose, workflows }: BundleModalProps) {
  const [selections, setSelections] = useState<WorkflowSelection[]>([]);
  const [format, setFormat] = useState<"esm" | "cjs">("esm");
  const [includeServer, setIncludeServer] = useState(true);
  const [serverPort, setServerPort] = useState(3000);
  const [emitDocker, setEmitDocker] = useState(false);
  const [emitCompose, setEmitCompose] = useState(false);
  const [minify, setMinify] = useState(false);
  const [outputDirName, setOutputDirName] = useState("bundle");
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [buildSuccess, setBuildSuccess] = useState<{
    outputDir: string;
    files: string[];
  } | null>(null);
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null);

  // Initialize selections when workflows change
  useEffect(() => {
    if (isOpen) {
      setSelections(
        workflows.map((w) => ({
          workflowId: w.id,
          exportName: toExportName(w.name),
          endpointPath: toEndpointPath(w.name),
          methods: ["POST"] as "POST"[],
          included: true,
          stream: false,
        })),
      );
      setBuildError(null);
      setBuildSuccess(null);
      // Set default output dir name based on first workflow
      if (workflows.length > 0) {
        setOutputDirName(toExportName(workflows[0].name));
      }
    }
  }, [workflows, isOpen]);

  const updateSelection = useCallback(
    (workflowId: string, updates: Partial<WorkflowSelection>) => {
      setSelections((prev) =>
        prev.map((s) =>
          s.workflowId === workflowId ? { ...s, ...updates } : s,
        ),
      );
    },
    [],
  );

  const toggleMethod = useCallback(
    (workflowId: string, method: "GET" | "POST" | "PUT" | "DELETE") => {
      setSelections((prev) =>
        prev.map((s) => {
          if (s.workflowId !== workflowId) return s;
          const methods = s.methods.includes(method)
            ? s.methods.filter((m) => m !== method)
            : [...s.methods, method];
          return { ...s, methods: methods.length > 0 ? methods : ["POST"] };
        }),
      );
    },
    [],
  );

  const selectedCount = selections.filter((s) => s.included).length;

  const handleBuild = useCallback(async () => {
    const included = selections.filter((s) => s.included);
    if (included.length === 0) {
      setBuildError("Select at least one workflow to bundle");
      return;
    }

    // Check for duplicate export names
    const exportNames = included.map((s) => s.exportName);
    const duplicates = exportNames.filter(
      (name, i) => exportNames.indexOf(name) !== i,
    );
    if (duplicates.length > 0) {
      setBuildError(
        `Duplicate export names: ${[...new Set(duplicates)].join(", ")}`,
      );
      return;
    }

    // Validate output dir name
    if (!outputDirName.trim()) {
      setBuildError("Output directory name is required");
      return;
    }

    setIsBuilding(true);
    setBuildError(null);
    setBuildSuccess(null);

    try {
      // Build workflow entries
      const workflowEntries: WorkflowBundleEntry[] = included.map((s) => {
        const wf = workflows.find((w) => w.id === s.workflowId)!;
        return {
          workflow: wf.workflow,
          exportName: s.exportName,
          endpointPath: s.endpointPath,
          methods: s.methods,
          stream: s.stream,
        };
      });

      const options: BundleOptions = {
        workflows: workflowEntries,
        format,
        includeServer,
        serverPort,
        emitDocker,
        emitCompose,
        minify,
      };

      // Call server API to build bundle
      const response = await fetch("/api/build-bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          options,
          outputDir: outputDirName.trim(),
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setBuildError(result.error || "Build failed");
        return;
      }

      setBuildSuccess({
        outputDir: result.outputDir,
        files: result.files,
      });
    } catch (err) {
      setBuildError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsBuilding(false);
    }
  }, [
    selections,
    workflows,
    format,
    includeServer,
    serverPort,
    emitDocker,
    emitCompose,
    minify,
    outputDirName,
  ]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[85vh] bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-purple-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Bundle Workflows
            </h2>
            <span className="text-sm text-gray-500">
              {selectedCount} of {workflows.length} selected
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Workflow Selection */}
          <section>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Select Workflows
            </h3>
            <div className="space-y-2">
              {workflows.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                  No workflows available. Create or import workflows first.
                </p>
              ) : (
                workflows.map((wf) => {
                  const selection = selections.find(
                    (s) => s.workflowId === wf.id,
                  );
                  if (!selection) return null;

                  const isExpanded = expandedWorkflow === wf.id;

                  return (
                    <div
                      key={wf.id}
                      className={`border rounded-lg transition-colors ${
                        selection.included
                          ? "border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20"
                          : "border-gray-200 dark:border-gray-700"
                      }`}
                    >
                      {/* Workflow header row */}
                      <div className="flex items-center gap-3 p-3">
                        <input
                          type="checkbox"
                          checked={selection.included}
                          onChange={(e) =>
                            updateSelection(wf.id, {
                              included: e.target.checked,
                            })
                          }
                          className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                            {wf.name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Export:{" "}
                            <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">
                              {selection.exportName}
                            </code>
                            {includeServer && (
                              <>
                                {" "}
                                • Endpoint:{" "}
                                <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">
                                  {selection.endpointPath}
                                </code>
                              </>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            setExpandedWorkflow(isExpanded ? null : wf.id)
                          }
                          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      {/* Expanded options */}
                      {isExpanded && selection.included && (
                        <div className="px-3 pb-3 pt-0 space-y-3 border-t border-gray-200 dark:border-gray-700 mt-2">
                          <div className="grid grid-cols-2 gap-3 pt-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Export Name
                              </label>
                              <input
                                type="text"
                                value={selection.exportName}
                                onChange={(e) =>
                                  updateSelection(wf.id, {
                                    exportName: e.target.value,
                                  })
                                }
                                className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                              />
                            </div>
                            {includeServer && (
                              <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                  Endpoint Path
                                </label>
                                <input
                                  type="text"
                                  value={selection.endpointPath}
                                  onChange={(e) =>
                                    updateSelection(wf.id, {
                                      endpointPath: e.target.value,
                                    })
                                  }
                                  className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                              </div>
                            )}
                          </div>
                          {includeServer && (
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                HTTP Methods
                              </label>
                              <div className="flex gap-2">
                                {(
                                  ["GET", "POST", "PUT", "DELETE"] as const
                                ).map((method) => (
                                  <button
                                    key={method}
                                    onClick={() => toggleMethod(wf.id, method)}
                                    className={`px-2 py-1 text-xs rounded transition-colors ${
                                      selection.methods.includes(method)
                                        ? "bg-purple-600 text-white"
                                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                                    }`}
                                  >
                                    {method}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {includeServer && (
                            <div>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selection.stream}
                                  onChange={(e) =>
                                    updateSelection(wf.id, {
                                      stream: e.target.checked,
                                    })
                                  }
                                  className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                />
                                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                  Stream response (NDJSON)
                                </span>
                              </label>
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 ml-6">
                                Delivers results as newline-delimited JSON
                                events instead of a single payload
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Build Options */}
          <section>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Build Options
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Output Directory
                </label>
                <div className="flex items-center">
                  <span className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 border border-r-0 border-gray-200 dark:border-gray-700 rounded-l-lg text-gray-500">
                    dist/
                  </span>
                  <input
                    type="text"
                    value={outputDirName}
                    onChange={(e) => setOutputDirName(e.target.value)}
                    placeholder="bundle-name"
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-r-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Output Format
                </label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as "esm" | "cjs")}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="esm">ES Modules (.mjs)</option>
                  <option value="cjs">CommonJS (.js)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Server Port
                </label>
                <input
                  type="number"
                  value={serverPort}
                  onChange={(e) =>
                    setServerPort(parseInt(e.target.value) || 3000)
                  }
                  disabled={!includeServer}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeServer}
                  onChange={(e) => setIncludeServer(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <Server className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Include HTTP server (server.js)
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emitDocker}
                  onChange={(e) => setEmitDocker(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <Package className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Generate Dockerfile
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emitCompose}
                  onChange={(e) => setEmitCompose(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <FileCode className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Generate docker-compose.yml
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={minify}
                  onChange={(e) => setMinify(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <FileCode className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Minify output
                </span>
              </label>
            </div>
          </section>

          {/* Preview */}
          {selectedCount > 0 && (
            <section>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Bundle Preview
              </h3>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-sm font-mono">
                <div className="text-gray-600 dark:text-gray-400">
                  // Import usage:
                </div>
                <div className="text-purple-600 dark:text-purple-400">
                  import {"{"}{" "}
                  {selections
                    .filter((s) => s.included)
                    .map((s) => s.exportName)
                    .join(", ")}{" "}
                  {"}"} from './bundle.{format === "esm" ? "mjs" : "js"}';
                </div>
                {includeServer && (
                  <>
                    <div className="mt-3 text-gray-600 dark:text-gray-400">
                      // Server endpoints:
                    </div>
                    {selections
                      .filter((s) => s.included)
                      .map((s) => (
                        <div
                          key={s.workflowId}
                          className="text-green-600 dark:text-green-400"
                        >
                          {s.methods.join("|")} {s.endpointPath}
                          {s.stream && (
                            <span className="ml-2 text-xs text-blue-500 dark:text-blue-400">
                              [STREAM]
                            </span>
                          )}
                        </div>
                      ))}
                  </>
                )}
              </div>
            </section>
          )}

          {/* Success */}
          {buildSuccess && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-2">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Bundle built successfully!</span>
              </div>
              <div className="text-sm text-green-600 dark:text-green-500">
                <p className="mb-2">
                  Output directory:{" "}
                  <code className="bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 rounded">
                    {buildSuccess.outputDir}
                  </code>
                </p>
                <p className="text-xs text-green-500 dark:text-green-600">
                  Files: {buildSuccess.files.join(", ")}
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {buildError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">{buildError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            {buildSuccess ? "Close" : "Cancel"}
          </button>
          {!buildSuccess && (
            <button
              onClick={handleBuild}
              disabled={isBuilding || selectedCount === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg"
            >
              {isBuilding ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Building...
                </>
              ) : (
                <>
                  <FolderOutput className="w-4 h-4" />
                  Build to dist/
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
