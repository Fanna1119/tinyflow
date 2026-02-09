/**
 * Workflow Execution Hook
 * Handles running workflows with server-side step-by-step support
 *
 * When stepMode is enabled, execution actually pauses on the server before
 * each node. The user clicks "Next" which sends a POST /api/debug-step to
 * resume. This gives true interactive debugging with live feedback.
 */

import { useCallback, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  executeWorkflowOnServer,
  debugStepResume,
  debugStopSession,
} from "../utils/serverApi";
import type { WorkflowDefinition } from "../../schema/types";
import type { MockValue } from "../../compiler";

interface DebugActions {
  startSession: () => void;
  endSession: (success: boolean) => void;
  onNodeStart: (nodeId: string, params: Record<string, unknown>) => void;
  onNodeComplete: (nodeId: string, success: boolean, output: unknown) => void;
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
  const [isPaused, setIsPaused] = useState(false);
  const [lastDuration, setLastDuration] = useState<number | undefined>();

  /** The server-side debug session ID (only in step mode) */
  const sessionIdRef = useRef<string | null>(null);

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

      // Both step-mode and normal mode use the same SSE streaming endpoint.
      // In step mode, the server pauses before each node and sends a
      // "paused" event; the client calls POST /api/debug-step to resume.
      const result = await executeWorkflowOnServer(workflow, {
        mockValues:
          Object.keys(mockValuesObj).length > 0 ? mockValuesObj : undefined,
        stepMode: isStepMode,
        callbacks: {
          onSession: (sessionId) => {
            sessionIdRef.current = sessionId;
          },
          onPaused: () => {
            // Server is now paused before this node — update UI
            setIsPaused(true);
          },
          onStopped: () => {
            setIsPaused(false);
            sessionIdRef.current = null;
          },
          onNodeStart: (nodeId, params) => {
            // Node is starting execution — show live in debugger
            setIsPaused(false);
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

      return { result };
    },
    onSuccess: ({ result }) => {
      setIsPaused(false);
      sessionIdRef.current = null;
      debugActions.endSession(result.success);
      setLastDuration(result.duration);
    },
    onError: (error) => {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setIsPaused(false);
      sessionIdRef.current = null;
      debugActions.endSession(false);
      console.error("Execution error:", errorMsg);
    },
  });

  // Run workflow
  const run = useCallback(
    (workflow: WorkflowDefinition) => {
      setLastDuration(undefined);
      setIsPaused(false);
      sessionIdRef.current = null;

      // Start debug session
      debugActions.startSession();

      executeMutation.mutate({ workflow, isStepMode: stepMode });
    },
    [debugActions, executeMutation, stepMode],
  );

  // Handle step button click — tells the server to resume
  const step = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;

    try {
      await debugStepResume(sessionId);
      // isPaused will be set to false when we receive the next node_start
      // event from the SSE stream
    } catch (error) {
      console.error("Failed to resume step:", error);
    }
  }, []);

  // Stop/cancel the current debug session
  const stop = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;

    try {
      await debugStopSession(sessionId);
      setIsPaused(false);
      sessionIdRef.current = null;
    } catch (error) {
      console.error("Failed to stop session:", error);
    }
  }, []);

  // Reset execution state
  const reset = useCallback(() => {
    setIsPaused(false);
    setLastDuration(undefined);
    sessionIdRef.current = null;
  }, []);

  return {
    isRunning: executeMutation.isPending,
    isPaused,
    lastDuration,
    error: executeMutation.error,
    run,
    step,
    stop,
    reset,
  };
}
