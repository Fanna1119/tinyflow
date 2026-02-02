/**
 * Persistence & Durable Execution
 * Pluggable persistence adapters for workflow state
 */

export interface ExecutionState {
  /** Unique execution ID */
  executionId: string;
  /** Workflow ID or name */
  workflowId: string;
  /** Current node ID being executed */
  currentNodeId: string;
  /** Execution status */
  status: "running" | "completed" | "failed" | "paused";
  /** Store data snapshot */
  storeData: Record<string, unknown>;
  /** Execution logs */
  logs: string[];
  /** Start timestamp */
  startedAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Completion timestamp (if finished) */
  completedAt?: Date;
  /** Error information (if failed) */
  error?: {
    nodeId: string;
    message: string;
  };
}

export interface PersistenceAdapter {
  /**
   * Save execution state
   */
  saveState(state: ExecutionState): Promise<void>;

  /**
   * Load execution state by ID
   */
  loadState(executionId: string): Promise<ExecutionState | null>;

  /**
   * List executions for a workflow
   */
  listExecutions(workflowId: string, limit?: number): Promise<ExecutionState[]>;

  /**
   * Delete execution state
   */
  deleteState(executionId: string): Promise<void>;

  /**
   * Clean up old completed executions
   */
  cleanup(olderThanMs: number): Promise<number>;
}

/**
 * In-memory persistence adapter (no durability, for testing)
 */
export class InMemoryPersistenceAdapter implements PersistenceAdapter {
  private states = new Map<string, ExecutionState>();

  async saveState(state: ExecutionState): Promise<void> {
    this.states.set(state.executionId, { ...state });
  }

  async loadState(executionId: string): Promise<ExecutionState | null> {
    const state = this.states.get(executionId);
    return state ? { ...state } : null;
  }

  async listExecutions(
    workflowId: string,
    limit = 100,
  ): Promise<ExecutionState[]> {
    return Array.from(this.states.values())
      .filter((s) => s.workflowId === workflowId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }

  async deleteState(executionId: string): Promise<void> {
    this.states.delete(executionId);
  }

  async cleanup(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    let deleted = 0;

    for (const [id, state] of this.states.entries()) {
      if (state.status !== "running" && state.updatedAt.getTime() < cutoff) {
        this.states.delete(id);
        deleted++;
      }
    }

    return deleted;
  }

  clear(): void {
    this.states.clear();
  }
}

/**
 * File-based persistence adapter using JSON files
 */
export class FilePersistenceAdapter implements PersistenceAdapter {
  constructor(private directory: string) {}

  private getFilePath(executionId: string): string {
    return `${this.directory}/${executionId}.json`;
  }

  async saveState(state: ExecutionState): Promise<void> {
    // Note: This would require fs module in Node.js/Bun
    // Implementation depends on runtime environment
    throw new Error("FilePersistenceAdapter not yet implemented");
  }

  async loadState(executionId: string): Promise<ExecutionState | null> {
    throw new Error("FilePersistenceAdapter not yet implemented");
  }

  async listExecutions(
    workflowId: string,
    limit?: number,
  ): Promise<ExecutionState[]> {
    throw new Error("FilePersistenceAdapter not yet implemented");
  }

  async deleteState(executionId: string): Promise<void> {
    throw new Error("FilePersistenceAdapter not yet implemented");
  }

  async cleanup(olderThanMs: number): Promise<number> {
    throw new Error("FilePersistenceAdapter not yet implemented");
  }
}

/**
 * Create a simple execution ID
 */
export function createExecutionId(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Snapshot current execution state
 */
export function createExecutionSnapshot(
  executionId: string,
  workflowId: string,
  currentNodeId: string,
  status: ExecutionState["status"],
  storeData: Record<string, unknown>,
  logs: string[],
  startedAt: Date,
  error?: { nodeId: string; message: string },
): ExecutionState {
  const now = new Date();
  return {
    executionId,
    workflowId,
    currentNodeId,
    status,
    storeData,
    logs: [...logs],
    startedAt,
    updatedAt: now,
    completedAt:
      status === "completed" || status === "failed" ? now : undefined,
    error,
  };
}

// Global persistence adapter
let globalAdapter: PersistenceAdapter | null = null;

/**
 * Set global persistence adapter
 */
export function setPersistenceAdapter(adapter: PersistenceAdapter): void {
  globalAdapter = adapter;
}

/**
 * Get global persistence adapter (defaults to in-memory)
 */
export function getPersistenceAdapter(): PersistenceAdapter {
  if (!globalAdapter) {
    globalAdapter = new InMemoryPersistenceAdapter();
  }
  return globalAdapter;
}

/**
 * Reset persistence adapter (mainly for testing)
 */
export function resetPersistenceAdapter(): void {
  globalAdapter = null;
}
