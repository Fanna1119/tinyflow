/**
 * Debug Panel Component
 * Shows execution timeline, performance metrics, and test value configuration
 */

import { memo, useState, useMemo } from "react";
import {
  Bug,
  ChevronDown,
  ChevronUp,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Trash2,
  FlaskConical,
  List,
  SkipForward,
  Footprints,
  Activity,
  Download,
  Camera,
} from "lucide-react";
import type { ExecutionStep, ExecutionStatus } from "../../hooks/useDebugger";
import {
  extractProfiles,
  aggregateStats,
  sortProfiles,
  severity,
  severityColor,
  severityBg,
  formatBytes,
  formatDuration,
  formatMicroseconds,
  exportAsJson,
  exportAsCsv,
  downloadFile,
  type SortField,
  type SortDir,
} from "../../utils/profiler";
import { requestHeapSnapshot } from "../../utils/serverApi";

// ============================================================================
// Types
// ============================================================================

interface DebugPanelProps {
  /** Execution steps */
  steps: ExecutionStep[];
  /** Currently executing node */
  activeNodeId: string | null;
  /** Whether panel is open */
  isOpen: boolean;
  /** Toggle panel open/close */
  onToggle: () => void;
  /** Clear execution history */
  onClear: () => void;
  /** Whether workflow is running */
  isRunning: boolean;
  /** Last execution duration */
  duration?: number;
  /** Whether there are any test values configured */
  hasTestValues: boolean;
  /** Number of enabled test values */
  enabledTestCount: number;
  /** Callback when clicking on a step (to select node) */
  onStepClick?: (nodeId: string) => void;
  /** Whether step-by-step mode is enabled */
  stepMode: boolean;
  /** Toggle step mode */
  onToggleStepMode: () => void;
  /** Whether execution is paused waiting for next step */
  isPaused: boolean;
  /** Advance to next step */
  onNextStep: () => void;
  /** Whether profiling is enabled */
  profilingEnabled: boolean;
  /** Toggle profiling */
  onToggleProfiling: () => void;
}

// ============================================================================
// Status Icon Component
// ============================================================================

function StatusIcon({ status }: { status: ExecutionStatus }) {
  switch (status) {
    case "running":
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    case "success":
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case "error":
      return <XCircle className="w-4 h-4 text-red-500" />;
    case "pending":
      return <Clock className="w-4 h-4 text-gray-400" />;
    default:
      return <div className="w-4 h-4 rounded-full border-2 border-gray-300" />;
  }
}

// ============================================================================
// Execution Step Component
// ============================================================================

const ExecutionStepRow = memo(function ExecutionStepRow({
  step,
  isActive,
  onClick,
}: {
  step: ExecutionStep;
  isActive: boolean;
  onClick?: () => void;
}) {
  const duration =
    step.endTime && step.startTime ? step.endTime - step.startTime : null;
  const profile = step.profile;

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left px-3 py-2 flex items-center gap-3 transition-colors
        hover:bg-gray-100 dark:hover:bg-gray-700
        ${isActive ? "bg-blue-50 dark:bg-blue-900/30 border-l-2 border-blue-500" : ""}
      `}
    >
      <StatusIcon status={step.status} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
            {step.nodeId}
          </span>
          {step.mocked && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
              mocked
            </span>
          )}
        </div>
        {step.functionId && (
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {step.functionId}
          </div>
        )}
      </div>

      {/* Inline profile badges */}
      {profile && (
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="text-xs px-1.5 py-0.5 rounded tabular-nums bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
            title={`Heap: ${formatBytes(profile.heapDelta)}`}
          >
            {formatBytes(profile.heapDelta)}
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded tabular-nums bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
            title={`CPU: ${profile.cpuPercent}%`}
          >
            {profile.cpuPercent.toFixed(0)}%
          </span>
        </div>
      )}

      {duration !== null && (
        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums shrink-0">
          {duration < 1000
            ? `${duration}ms`
            : `${(duration / 1000).toFixed(1)}s`}
        </span>
      )}
    </button>
  );
});

// ============================================================================
// Debug Panel Component
// ============================================================================

export const DebugPanel = memo(function DebugPanel({
  steps,
  activeNodeId,
  isOpen,
  onToggle,
  onClear,
  isRunning,
  duration,
  hasTestValues,
  enabledTestCount,
  onStepClick,
  stepMode,
  onToggleStepMode,
  isPaused,
  onNextStep,
  profilingEnabled,
  onToggleProfiling,
}: DebugPanelProps) {
  const [activeTab, setActiveTab] = useState<"timeline" | "output" | "metrics">(
    "timeline",
  );
  const [sortField, setSortField] = useState<SortField>("durationMs");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  // Get the last completed step for output view
  const lastCompletedStep = [...steps]
    .reverse()
    .find((s) => s.status === "success" || s.status === "error");

  // Profile data for metrics tab
  const profileRows = useMemo(() => extractProfiles(steps), [steps]);
  const sortedRows = useMemo(
    () => sortProfiles(profileRows, sortField, sortDir),
    [profileRows, sortField, sortDir],
  );
  const stats = useMemo(() => aggregateStats(profileRows), [profileRows]);
  const allDurations = useMemo(
    () => profileRows.map((r) => r.durationMs),
    [profileRows],
  );
  const allHeapDeltas = useMemo(
    () => profileRows.map((r) => Math.abs(r.heapDelta)),
    [profileRows],
  );
  const allCpuPcts = useMemo(
    () => profileRows.map((r) => r.cpuPercent),
    [profileRows],
  );

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const handleSnapshot = async () => {
    setSnapshotLoading(true);
    try {
      const result = await requestHeapSnapshot();
      alert(
        `Heap snapshot saved: ${result.file}\nCheck .tinyflow-snapshots/ directory`,
      );
    } catch (e) {
      alert(
        `Snapshot failed: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    } finally {
      setSnapshotLoading(false);
    }
  };

  const handleExport = (format: "json" | "csv") => {
    if (format === "json") {
      downloadFile(
        exportAsJson(profileRows, stats),
        `tinyflow-profile-${Date.now()}.json`,
      );
    } else {
      downloadFile(
        exportAsCsv(profileRows),
        `tinyflow-profile-${Date.now()}.csv`,
        "text/csv",
      );
    }
  };

  return (
    <div
      className={`
        absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-800 
        border-t border-gray-200 dark:border-gray-700 shadow-lg
        transition-all duration-200 ease-in-out z-10
        ${isOpen ? "h-72" : "h-10"}
      `}
    >
      {/* Header */}
      <div
        className="h-10 px-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <Bug className="w-4 h-4 text-gray-500" />
          <span className="font-medium text-sm text-gray-700 dark:text-gray-200">
            Debugger
          </span>

          {isRunning && !isPaused && (
            <span className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Running...
            </span>
          )}

          {isPaused && (
            <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <Clock className="w-3 h-3" />
              Paused
            </span>
          )}

          {!isRunning && duration !== undefined && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {duration < 1000
                ? `${duration.toFixed(0)}ms`
                : `${(duration / 1000).toFixed(2)}s`}
            </span>
          )}

          {/* Test values indicator */}
          {hasTestValues && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
              <FlaskConical className="w-3 h-3" />
              {enabledTestCount} mock{enabledTestCount !== 1 ? "s" : ""}
            </span>
          )}

          {steps.length > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {steps.length} step{steps.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Profiling toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleProfiling();
            }}
            className={`
              p-1 rounded transition-colors
              ${
                profilingEnabled
                  ? "bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400"
                  : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }
            `}
            title={profilingEnabled ? "Profiling enabled" : "Enable profiling"}
          >
            <Activity className="w-4 h-4" />
          </button>

          {/* Step mode toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleStepMode();
            }}
            className={`
              p-1 rounded transition-colors
              ${
                stepMode
                  ? "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400"
                  : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }
            `}
            title={stepMode ? "Step mode enabled" : "Enable step mode"}
          >
            <Footprints className="w-4 h-4" />
          </button>

          {/* Next step button */}
          {isPaused && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNextStep();
              }}
              className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium transition-colors"
              title="Continue to next step"
            >
              <SkipForward className="w-3 h-3" />
              Next
            </button>
          )}

          {steps.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              title="Clear history"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          )}
        </div>
      </div>

      {/* Content */}
      {isOpen && (
        <div className="flex h-[calc(100%-40px)]">
          {/* Tabs */}
          <div className="w-10 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-2 gap-1">
            <button
              onClick={() => setActiveTab("timeline")}
              className={`
                p-2 rounded transition-colors
                ${
                  activeTab === "timeline"
                    ? "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400"
                    : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                }
              `}
              title="Execution Timeline"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setActiveTab("output")}
              className={`
                p-2 rounded transition-colors
                ${
                  activeTab === "output"
                    ? "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400"
                    : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                }
              `}
              title="Output Inspector"
            >
              <Play className="w-4 h-4" />
            </button>
            <button
              onClick={() => setActiveTab("metrics")}
              className={`
                p-2 rounded transition-colors
                ${
                  activeTab === "metrics"
                    ? "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400"
                    : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                }
              `}
              title="Performance Metrics"
            >
              <Activity className="w-4 h-4" />
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === "timeline" && (
              <div className="h-full overflow-y-auto">
                {steps.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
                    Run the workflow to see execution steps
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {steps.map((step, index) => (
                      <ExecutionStepRow
                        key={`${step.nodeId}-${index}`}
                        step={step}
                        isActive={step.nodeId === activeNodeId}
                        onClick={() => onStepClick?.(step.nodeId)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "output" && (
              <div className="h-full p-4 overflow-y-auto">
                {lastCompletedStep ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <StatusIcon status={lastCompletedStep.status} />
                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {lastCompletedStep.nodeId}
                      </span>
                    </div>

                    {lastCompletedStep.input && (
                      <div className="mb-3">
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Input
                        </div>
                        <pre className="text-xs bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-2 rounded overflow-x-auto">
                          {JSON.stringify(lastCompletedStep.input, null, 2)}
                        </pre>
                      </div>
                    )}

                    <div>
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Output
                      </div>
                      <pre
                        className={`
                        text-xs p-2 rounded overflow-x-auto
                        ${
                          lastCompletedStep.status === "error"
                            ? "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                            : "bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                        }
                      `}
                      >
                        {lastCompletedStep.status === "error"
                          ? lastCompletedStep.error
                          : JSON.stringify(lastCompletedStep.output, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
                    No output yet
                  </div>
                )}
              </div>
            )}

            {activeTab === "metrics" && (
              <div className="h-full flex flex-col overflow-hidden">
                {profileRows.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 text-sm gap-2">
                    <Activity className="w-8 h-8 opacity-40" />
                    {profilingEnabled
                      ? "Run the workflow to collect profiling data"
                      : "Enable profiling to collect performance data"}
                  </div>
                ) : (
                  <>
                    {/* Aggregate stats bar */}
                    <div className="flex items-center gap-4 px-3 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-xs shrink-0">
                      <span className="text-gray-500 dark:text-gray-400">
                        Steps:{" "}
                        <span className="font-medium text-gray-700 dark:text-gray-200">
                          {stats.stepCount}
                        </span>
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        Total:{" "}
                        <span className="font-medium text-gray-700 dark:text-gray-200">
                          {formatDuration(stats.totalDurationMs)}
                        </span>
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        Heap Δ:{" "}
                        <span className="font-medium text-gray-700 dark:text-gray-200">
                          {formatBytes(stats.totalHeapDelta)}
                        </span>
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        Peak:{" "}
                        <span className="font-medium text-gray-700 dark:text-gray-200">
                          {formatBytes(stats.peakHeap)}
                        </span>
                      </span>

                      <div className="ml-auto flex items-center gap-1">
                        <button
                          onClick={() => handleExport("json")}
                          className="px-2 py-0.5 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                          title="Export as JSON"
                        >
                          <Download className="w-3 h-3 inline mr-1" />
                          JSON
                        </button>
                        <button
                          onClick={() => handleExport("csv")}
                          className="px-2 py-0.5 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                          title="Export as CSV"
                        >
                          <Download className="w-3 h-3 inline mr-1" />
                          CSV
                        </button>
                        <button
                          onClick={handleSnapshot}
                          disabled={snapshotLoading}
                          className="px-2 py-0.5 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                          title="Take heap snapshot"
                        >
                          <Camera className="w-3 h-3 inline mr-1" />
                          {snapshotLoading ? "…" : "Snapshot"}
                        </button>
                      </div>
                    </div>

                    {/* Sortable table */}
                    <div className="flex-1 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th className="text-left px-3 py-1.5 font-medium text-gray-500 dark:text-gray-400 w-6">
                              #
                            </th>
                            <th className="text-left px-3 py-1.5 font-medium text-gray-500 dark:text-gray-400">
                              Node
                            </th>
                            <th
                              className="text-right px-3 py-1.5 font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                              onClick={() => toggleSort("durationMs")}
                            >
                              Duration{" "}
                              {sortField === "durationMs" &&
                                (sortDir === "desc" ? "↓" : "↑")}
                            </th>
                            <th
                              className="text-right px-3 py-1.5 font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                              onClick={() => toggleSort("heapDelta")}
                            >
                              Heap Δ{" "}
                              {sortField === "heapDelta" &&
                                (sortDir === "desc" ? "↓" : "↑")}
                            </th>
                            <th
                              className="text-right px-3 py-1.5 font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                              onClick={() => toggleSort("cpuPercent")}
                            >
                              CPU %{" "}
                              {sortField === "cpuPercent" &&
                                (sortDir === "desc" ? "↓" : "↑")}
                            </th>
                            <th
                              className="text-right px-3 py-1.5 font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                              onClick={() => toggleSort("cpuTotalUs")}
                            >
                              CPU Time{" "}
                              {sortField === "cpuTotalUs" &&
                                (sortDir === "desc" ? "↓" : "↑")}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {sortedRows.map((row, i) => {
                            const durSev = severity(
                              row.durationMs,
                              allDurations,
                            );
                            const heapSev = severity(
                              Math.abs(row.heapDelta),
                              allHeapDeltas,
                            );
                            const cpuSev = severity(row.cpuPercent, allCpuPcts);
                            return (
                              <tr
                                key={`${row.nodeId}-${i}`}
                                className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                                onClick={() => onStepClick?.(row.nodeId)}
                              >
                                <td className="px-3 py-1.5 text-gray-400 tabular-nums">
                                  {i + 1}
                                </td>
                                <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-200 truncate max-w-[160px]">
                                  {row.nodeId}
                                </td>
                                <td
                                  className={`px-3 py-1.5 text-right tabular-nums font-medium ${severityColor(durSev)}`}
                                >
                                  {formatDuration(row.durationMs)}
                                </td>
                                <td
                                  className={`px-3 py-1.5 text-right tabular-nums font-medium ${severityColor(heapSev)}`}
                                >
                                  {formatBytes(row.heapDelta)}
                                </td>
                                <td
                                  className={`px-3 py-1.5 text-right tabular-nums font-medium ${severityColor(cpuSev)}`}
                                >
                                  {row.cpuPercent.toFixed(1)}%
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-gray-500 dark:text-gray-400">
                                  {formatMicroseconds(row.cpuTotalUs)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
