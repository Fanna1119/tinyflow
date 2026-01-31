/**
 * Debug Hook
 * Manages execution tracking and test values for workflow debugging
 */

import { useState, useCallback, useMemo, useRef } from "react";
import type { MockValue } from "../../compiler";

// ============================================================================
// Types
// ============================================================================

export type ExecutionStatus =
  | "idle"
  | "pending"
  | "running"
  | "success"
  | "error";

export interface ExecutionStep {
  /** Node ID */
  nodeId: string;
  /** Function ID */
  functionId: string;
  /** Execution status */
  status: ExecutionStatus;
  /** Start timestamp */
  startTime?: number;
  /** End timestamp */
  endTime?: number;
  /** Input parameters */
  input?: Record<string, unknown>;
  /** Output value */
  output?: unknown;
  /** Error message if failed */
  error?: string;
  /** Whether this node was mocked */
  mocked?: boolean;
}

export interface TestValue extends MockValue {
  /** Node ID this test value applies to */
  nodeId: string;
}

export interface DebugState {
  /** Whether debugger is active */
  isActive: boolean;
  /** Current execution steps */
  steps: ExecutionStep[];
  /** Currently executing node ID */
  activeNodeId: string | null;
  /** Test values by node ID */
  testValues: Map<string, MockValue>;
  /** Node execution status map (for visual indicators) */
  nodeStatus: Map<string, ExecutionStatus>;
  /** Whether step-by-step mode is enabled */
  stepMode: boolean;
  /** Whether paused waiting for next step */
  isPaused: boolean;
}

export interface DebugActions {
  /** Start a new debug session */
  startSession: () => void;
  /** End the current debug session */
  endSession: (success: boolean) => void;
  /** Record node start */
  onNodeStart: (nodeId: string, params: Record<string, unknown>) => void;
  /** Record node completion */
  onNodeComplete: (nodeId: string, success: boolean, output: unknown) => void;
  /** Set test value for a node */
  setTestValue: (nodeId: string, value: MockValue | null) => void;
  /** Toggle test value enabled state */
  toggleTestValue: (nodeId: string) => void;
  /** Clear all test values */
  clearTestValues: () => void;
  /** Clear execution history */
  clearSteps: () => void;
  /** Reset everything */
  reset: () => void;
  /** Get mock values map for runtime */
  getMockValues: () => Map<string, MockValue>;
  /** Toggle step-by-step mode */
  toggleStepMode: () => void;
  /** Set step mode */
  setStepMode: (enabled: boolean) => void;
  /** Advance to next step (when paused) */
  nextStep: () => void;
  /** Wait for next step (returns promise that resolves on nextStep) */
  waitForStep: () => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

export function useDebugger(): [DebugState, DebugActions] {
  const [isActive, setIsActive] = useState(false);
  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [testValues, setTestValues] = useState<Map<string, MockValue>>(
    new Map(),
  );
  const [nodeStatus, setNodeStatus] = useState<Map<string, ExecutionStatus>>(
    new Map(),
  );
  const [stepMode, setStepModeState] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Ref to store the resolve function for step continuation
  const stepResolverRef = useRef<(() => void) | null>(null);

  // Start a new debug session
  const startSession = useCallback(() => {
    setIsActive(true);
    setSteps([]);
    setActiveNodeId(null);
    setNodeStatus(new Map());
  }, []);

  // End the current debug session
  const endSession = useCallback((success: boolean) => {
    setIsActive(false);
    setActiveNodeId(null);
    // Update all pending nodes to their final status
    setNodeStatus((prev) => {
      const next = new Map(prev);
      for (const [nodeId, status] of next) {
        if (status === "pending" || status === "running") {
          next.set(nodeId, success ? "idle" : "error");
        }
      }
      return next;
    });
  }, []);

  // Record node start
  const onNodeStart = useCallback(
    (nodeId: string, params: Record<string, unknown>) => {
      setActiveNodeId(nodeId);
      setNodeStatus((prev) => new Map(prev).set(nodeId, "running"));

      setSteps((prev) => {
        // Check if we already have this step (shouldn't happen, but safety check)
        const existing = prev.find(
          (s) => s.nodeId === nodeId && s.status === "running",
        );
        if (existing) return prev;

        // Find the function ID from previous steps or use unknown
        const functionId = ""; // Will be updated when we integrate with workflow

        return [
          ...prev,
          {
            nodeId,
            functionId,
            status: "running",
            startTime: Date.now(),
            input: params,
            mocked: testValues.has(nodeId) && testValues.get(nodeId)?.enabled,
          },
        ];
      });
    },
    [testValues],
  );

  // Record node completion
  const onNodeComplete = useCallback(
    (nodeId: string, success: boolean, output: unknown) => {
      const status: ExecutionStatus = success ? "success" : "error";

      setActiveNodeId((prev) => (prev === nodeId ? null : prev));
      setNodeStatus((prev) => new Map(prev).set(nodeId, status));

      setSteps((prev) => {
        const updated = [...prev];
        const stepIndex = updated.findIndex(
          (s) => s.nodeId === nodeId && s.status === "running",
        );

        if (stepIndex !== -1) {
          updated[stepIndex] = {
            ...updated[stepIndex],
            status,
            endTime: Date.now(),
            output,
            error: success ? undefined : String(output),
          };
        }

        return updated;
      });
    },
    [],
  );

  // Set test value for a node
  const setTestValue = useCallback(
    (nodeId: string, value: MockValue | null) => {
      setTestValues((prev) => {
        const next = new Map(prev);
        if (value === null) {
          next.delete(nodeId);
        } else {
          next.set(nodeId, value);
        }
        return next;
      });
    },
    [],
  );

  // Toggle test value enabled state
  const toggleTestValue = useCallback((nodeId: string) => {
    setTestValues((prev) => {
      const next = new Map(prev);
      const current = next.get(nodeId);
      if (current) {
        next.set(nodeId, { ...current, enabled: !current.enabled });
      }
      return next;
    });
  }, []);

  // Clear all test values
  const clearTestValues = useCallback(() => {
    setTestValues(new Map());
  }, []);

  // Clear execution history
  const clearSteps = useCallback(() => {
    setSteps([]);
    setNodeStatus(new Map());
  }, []);

  // Reset everything
  const reset = useCallback(() => {
    setIsActive(false);
    setSteps([]);
    setActiveNodeId(null);
    setTestValues(new Map());
    setNodeStatus(new Map());
    setIsPaused(false);
    stepResolverRef.current = null;
  }, []);

  // Get mock values map for runtime (only enabled ones)
  const getMockValues = useCallback(() => {
    const enabled = new Map<string, MockValue>();
    for (const [nodeId, value] of testValues) {
      if (value.enabled) {
        enabled.set(nodeId, value);
      }
    }
    return enabled;
  }, [testValues]);

  // Toggle step mode
  const toggleStepMode = useCallback(() => {
    setStepModeState((prev) => !prev);
  }, []);

  // Set step mode
  const setStepMode = useCallback((enabled: boolean) => {
    setStepModeState(enabled);
  }, []);

  // Advance to next step
  const nextStep = useCallback(() => {
    if (stepResolverRef.current) {
      const resolver = stepResolverRef.current;
      stepResolverRef.current = null;
      setIsPaused(false);
      resolver();
    }
  }, []);

  // Wait for next step (returns promise that resolves on nextStep)
  const waitForStep = useCallback(() => {
    return new Promise<void>((resolve) => {
      setIsPaused(true);
      stepResolverRef.current = resolve;
    });
  }, []);

  const state: DebugState = useMemo(
    () => ({
      isActive,
      steps,
      activeNodeId,
      testValues,
      nodeStatus,
      stepMode,
      isPaused,
    }),
    [isActive, steps, activeNodeId, testValues, nodeStatus, stepMode, isPaused],
  );

  const actions: DebugActions = useMemo(
    () => ({
      startSession,
      endSession,
      onNodeStart,
      onNodeComplete,
      setTestValue,
      toggleTestValue,
      clearTestValues,
      clearSteps,
      reset,
      getMockValues,
      toggleStepMode,
      setStepMode,
      nextStep,
      waitForStep,
    }),
    [
      startSession,
      endSession,
      onNodeStart,
      onNodeComplete,
      setTestValue,
      toggleTestValue,
      clearTestValues,
      clearSteps,
      reset,
      getMockValues,
      toggleStepMode,
      setStepMode,
      nextStep,
      waitForStep,
    ],
  );

  return [state, actions];
}
