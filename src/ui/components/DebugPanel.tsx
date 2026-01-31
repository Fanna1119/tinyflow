/**
 * Debug Panel Component
 * Shows execution timeline and test value configuration
 */

import { memo, useState } from "react";
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
} from "lucide-react";
import type { ExecutionStep, ExecutionStatus } from "../hooks/useDebugger";

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

      {duration !== null && (
        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
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
}: DebugPanelProps) {
  const [activeTab, setActiveTab] = useState<"timeline" | "output">("timeline");

  // Get the last completed step for output view
  const lastCompletedStep = [...steps]
    .reverse()
    .find((s) => s.status === "success" || s.status === "error");

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
          </div>
        </div>
      )}
    </div>
  );
});
