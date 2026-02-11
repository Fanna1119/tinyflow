/**
 * TinyFlow Server API Client
 * Calls the dev server to execute workflows server-side
 * All workflow execution happens on the server, never in the browser
 */

import type { WorkflowDefinition } from "../../schema/types";
import type { WorkflowTemplate, WorkflowPattern } from "../templates/types";

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
  /** Called with per-node performance profile (when profiling is enabled) */
  onNodeProfile?: (nodeId: string, profile: NodeProfileData) => void;
}

/** Performance profile data received from the server */
export interface NodeProfileData {
  nodeId: string;
  durationMs: number;
  heapUsedBefore: number;
  heapUsedAfter: number;
  heapDelta: number;
  rssBefore: number;
  rssAfter: number;
  cpuUserUs: number;
  cpuSystemUs: number;
  cpuPercent: number;
  timestamp: number;
}

interface NodeEvent {
  type:
    | "node_start"
    | "node_complete"
    | "node_profile"
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
  profile?: NodeProfileData;
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
    /** Enable per-node performance profiling */
    profiling?: boolean;
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
      profiling: options.profiling,
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
            case "node_profile":
              if (event.profile) {
                options.callbacks?.onNodeProfile?.(
                  event.nodeId!,
                  event.profile,
                );
              }
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
 * Request an on-demand heap snapshot from the server
 * @returns Snapshot info including filename and path
 */
export async function requestHeapSnapshot(): Promise<{
  success: boolean;
  file: string;
  path: string;
}> {
  const response = await fetch("/api/debug-snapshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to take snapshot");
  }

  return response.json();
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

// ============================================================================
// Template API
// ============================================================================

/**
 * Fetch all templates from the server templates directory
 * @returns Array of workflow templates
 */
export async function fetchTemplates(): Promise<WorkflowTemplate[]> {
  const response = await fetch("/api/templates", { method: "GET" });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch templates");
  }

  const data = await response.json();
  return data.templates as WorkflowTemplate[];
}

/**
 * Save a workflow template to the server templates directory
 * @param template The template to save
 */
export async function saveTemplate(
  template: WorkflowTemplate,
): Promise<{ success: boolean; id: string }> {
  const response = await fetch("/api/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(template),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to save template");
  }

  return response.json();
}

/**
 * Delete a template from the server templates directory
 * @param id The template ID to delete
 */
export async function deleteTemplate(id: string): Promise<void> {
  const response = await fetch(`/api/templates?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete template");
  }
}

// ============================================================================
// Pattern API
// ============================================================================

/**
 * Fetch all patterns from the server patterns directory
 * @returns Array of workflow patterns
 */
export async function fetchPatterns(): Promise<WorkflowPattern[]> {
  const response = await fetch("/api/patterns", { method: "GET" });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch patterns");
  }

  const data = await response.json();
  return data.patterns as WorkflowPattern[];
}

/**
 * Save a workflow pattern to the server patterns directory
 * @param pattern The pattern to save
 */
export async function savePattern(
  pattern: WorkflowPattern,
): Promise<{ success: boolean; id: string }> {
  const response = await fetch("/api/patterns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pattern),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to save pattern");
  }

  return response.json();
}

/**
 * Delete a pattern from the server patterns directory
 * @param id The pattern ID to delete
 */
export async function deletePattern(id: string): Promise<void> {
  const response = await fetch(`/api/patterns?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete pattern");
  }
}
