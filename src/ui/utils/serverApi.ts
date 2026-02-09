/**
 * TinyFlow Server API Client
 * Calls the dev server to execute workflows server-side
 * All workflow execution happens on the server, never in the browser
 */

import type { WorkflowDefinition } from "../../schema/types";

export interface ServerExecutionResult {
  success: boolean;
  logs: string[];
  duration: number;
  store: Record<string, unknown>;
  error?: { nodeId: string; message: string };
}

export interface ExecutionCallbacks {
  onNodeStart?: (nodeId: string, params: Record<string, unknown>) => void;
  onNodeComplete?: (nodeId: string, success: boolean, output: unknown) => void;
  onLog?: (message: string) => void;
  onError?: (nodeId: string, message: string) => void;
  /** Called when execution pauses before a node (step mode only) */
  onPaused?: (nodeId: string) => void;
  /** Called when session is established (step mode only) */
  onSession?: (sessionId: string) => void;
  /** Called when the session is stopped/cancelled */
  onStopped?: () => void;
}

interface NodeEvent {
  type:
    | "node_start"
    | "node_complete"
    | "log"
    | "error"
    | "done"
    | "session"
    | "paused"
    | "stopped";
  nodeId?: string;
  params?: Record<string, unknown>;
  success?: boolean;
  output?: unknown;
  message?: string;
  sessionId?: string;
  result?: ServerExecutionResult;
}

/**
 * Execute a workflow on the dev server with streaming events
 * @param workflow The workflow definition to execute
 * @param options Execution options and callbacks
 * @returns Execution result from the server
 */
export async function executeWorkflowOnServer(
  workflow: WorkflowDefinition,
  options: {
    mockValues?: Record<string, unknown>;
    callbacks?: ExecutionCallbacks;
    /** Enable step-by-step mode — server pauses before each node */
    stepMode?: boolean;
  } = {},
): Promise<ServerExecutionResult> {
  const response = await fetch("/api/run-workflow", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workflow,
      mockValues: options.mockValues,
      stepMode: options.stepMode,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Server execution failed");
  }

  // Read SSE stream
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: ServerExecutionResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE events
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const event = JSON.parse(line.slice(6)) as NodeEvent;

          switch (event.type) {
            case "session":
              options.callbacks?.onSession?.(event.sessionId!);
              break;
            case "paused":
              options.callbacks?.onPaused?.(event.nodeId!);
              break;
            case "stopped":
              options.callbacks?.onStopped?.();
              break;
            case "node_start":
              options.callbacks?.onNodeStart?.(
                event.nodeId!,
                event.params || {},
              );
              break;
            case "node_complete":
              options.callbacks?.onNodeComplete?.(
                event.nodeId!,
                event.success!,
                event.output,
              );
              break;
            case "log":
              options.callbacks?.onLog?.(event.message!);
              break;
            case "error":
              options.callbacks?.onError?.(event.nodeId!, event.message!);
              break;
            case "done":
              finalResult = event.result!;
              break;
          }
        } catch {
          // Ignore parse errors for incomplete data
        }
      }
    }
  }

  if (!finalResult) {
    throw new Error("No result received from server");
  }

  return finalResult;
}

/**
 * Resume a paused debug session (advance one step)
 * @param sessionId The debug session ID
 */
export async function debugStepResume(sessionId: string): Promise<void> {
  const response = await fetch("/api/debug-step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to resume step");
  }
}

/**
 * Stop/cancel a debug session mid-run
 * @param sessionId The debug session ID
 */
export async function debugStopSession(sessionId: string): Promise<void> {
  const response = await fetch("/api/debug-stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to stop session");
  }
}

/**
 * Execute a workflow on the dev server without streaming (simpler API)
 * @param workflow The workflow definition to execute
 * @param mockValues Optional mock values for testing
 * @returns Execution result from the server
 */
export async function executeWorkflowSimple(
  workflow: WorkflowDefinition,
  mockValues?: Record<string, unknown>,
): Promise<ServerExecutionResult> {
  const response = await fetch("/api/run-workflow-simple", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workflow,
      mockValues,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Server execution failed");
  }

  return response.json();
}
