/**
 * Workflow Execution Hook
 * Handles running workflows with step-by-step support
 */

import { useCallback, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { executeWorkflowOnServer } from "../utils/serverApi";
import type { WorkflowDefinition } from "../../schema/types";
import type { MockValue } from "../../compiler";

interface DebugActions {
  startSession: () => void;
  endSession: (success: boolean) => void;
  onNodeStart: (nodeId: string, params: Record<string, unknown>) => void;
  onNodeComplete: (nodeId: string, success: boolean, output: unknown) => void;
}

interface ExecutionEvent {
  type: "start" | "complete";
  nodeId: string;
  params?: Record<string, unknown>;
  success?: boolean;
  output?: unknown;
}

interface ExecutionResult {
  success: boolean;
  duration: number;
}

interface UseWorkflowExecutionOptions {
  debugActions: DebugActions;
  stepMode: boolean;
  getMockValues: () => Map<string, MockValue> | undefined;
}

export function useWorkflowExecution({
  debugActions,
  stepMode,
  getMockValues,
}: UseWorkflowExecutionOptions) {
  const [hasPendingSteps, setHasPendingSteps] = useState(false);
  const [lastDuration, setLastDuration] = useState<number | undefined>();

  // Store for step-by-step playback
  const pendingEventsRef = useRef<ExecutionEvent[]>([]);
  const executionResultRef = useRef<ExecutionResult | null>(null);

  // Process next step in step mode
  const processNextEvent = useCallback(() => {
    if (pendingEventsRef.current.length === 0) {
      setHasPendingSteps(false);
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

    return pendingEventsRef.current.length > 0;
  }, [debugActions]);

  // Execute workflow mutation
  const executeMutation = useMutation({
    mutationFn: async ({
      workflow,
      isStepMode,
    }: {
      workflow: WorkflowDefinition;
      isStepMode: boolean;
    }) => {
      // Convert mock values to plain object for server
      const mockValuesObj: Record<string, unknown> = {};
      const mockMap = getMockValues();
      if (mockMap) {
        for (const [key, value] of mockMap.entries()) {
          mockValuesObj[key] = value;
        }
      }

      if (isStepMode) {
        // Step mode: collect all events first, then play back one by one
        const collectedEvents: ExecutionEvent[] = [];

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

        return { result, collectedEvents, isStepMode: true };
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

        return { result, collectedEvents: [], isStepMode: false };
      }
    },
    onSuccess: ({ result, collectedEvents, isStepMode }) => {
      if (isStepMode) {
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
        }
      } else {
        debugActions.endSession(result.success);
        setLastDuration(result.duration);
      }
    },
    onError: (error) => {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      debugActions.endSession(false);
      setHasPendingSteps(false);
      console.error("Execution error:", errorMsg);
    },
  });

  // Run workflow
  const run = useCallback(
    (workflow: WorkflowDefinition) => {
      setLastDuration(undefined);
      setHasPendingSteps(false);

      // Start debug session
      debugActions.startSession();
      pendingEventsRef.current = [];
      executionResultRef.current = null;

      executeMutation.mutate({ workflow, isStepMode: stepMode });
    },
    [debugActions, executeMutation, stepMode],
  );

  // Handle step button click
  const step = useCallback(() => {
    processNextEvent();
  }, [processNextEvent]);

  // Reset execution state
  const reset = useCallback(() => {
    pendingEventsRef.current = [];
    executionResultRef.current = null;
    setHasPendingSteps(false);
    setLastDuration(undefined);
  }, []);

  return {
    isRunning: executeMutation.isPending,
    hasPendingSteps,
    lastDuration,
    error: executeMutation.error,
    run,
    step,
    reset,
  };
}
