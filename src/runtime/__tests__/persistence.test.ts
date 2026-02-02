/**
 * Persistence Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryPersistenceAdapter,
  createExecutionId,
  createExecutionSnapshot,
} from "../persistence";

describe("Persistence", () => {
  let adapter: InMemoryPersistenceAdapter;

  beforeEach(() => {
    adapter = new InMemoryPersistenceAdapter();
  });

  it("should save and load execution state", async () => {
    const state = createExecutionSnapshot(
      "exec_123",
      "workflow_1",
      "node_1",
      "running",
      { counter: 5 },
      ["Log 1", "Log 2"],
      new Date(),
    );

    await adapter.saveState(state);

    const loaded = await adapter.loadState("exec_123");
    expect(loaded).toBeDefined();
    expect(loaded?.executionId).toBe("exec_123");
    expect(loaded?.workflowId).toBe("workflow_1");
    expect(loaded?.currentNodeId).toBe("node_1");
    expect(loaded?.storeData.counter).toBe(5);
  });

  it("should list executions for a workflow", async () => {
    const state1 = createExecutionSnapshot(
      "exec_1",
      "workflow_a",
      "node_1",
      "completed",
      {},
      [],
      new Date(),
    );

    const state2 = createExecutionSnapshot(
      "exec_2",
      "workflow_a",
      "node_1",
      "completed",
      {},
      [],
      new Date(),
    );

    const state3 = createExecutionSnapshot(
      "exec_3",
      "workflow_b",
      "node_1",
      "completed",
      {},
      [],
      new Date(),
    );

    await adapter.saveState(state1);
    await adapter.saveState(state2);
    await adapter.saveState(state3);

    const executions = await adapter.listExecutions("workflow_a");
    expect(executions).toHaveLength(2);
    expect(executions.every((e) => e.workflowId === "workflow_a")).toBe(true);
  });

  it("should delete execution state", async () => {
    const state = createExecutionSnapshot(
      "exec_delete",
      "workflow_1",
      "node_1",
      "completed",
      {},
      [],
      new Date(),
    );

    await adapter.saveState(state);
    expect(await adapter.loadState("exec_delete")).toBeDefined();

    await adapter.deleteState("exec_delete");
    expect(await adapter.loadState("exec_delete")).toBeNull();
  });

  it("should cleanup old executions", async () => {
    const now = Date.now();
    const oldDate = new Date(now - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    const recentDate = new Date(now - 1 * 60 * 60 * 1000); // 1 hour ago

    const oldState = createExecutionSnapshot(
      "exec_old",
      "workflow_1",
      "node_1",
      "completed",
      {},
      [],
      oldDate,
    );
    oldState.updatedAt = oldDate;

    const recentState = createExecutionSnapshot(
      "exec_recent",
      "workflow_1",
      "node_1",
      "completed",
      {},
      [],
      recentDate,
    );
    recentState.updatedAt = recentDate;

    await adapter.saveState(oldState);
    await adapter.saveState(recentState);

    // Clean up executions older than 1 day
    const deleted = await adapter.cleanup(24 * 60 * 60 * 1000);

    expect(deleted).toBe(1);
    expect(await adapter.loadState("exec_old")).toBeNull();
    expect(await adapter.loadState("exec_recent")).toBeDefined();
  });

  it("should not cleanup running executions", async () => {
    const oldDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const runningState = createExecutionSnapshot(
      "exec_running",
      "workflow_1",
      "node_1",
      "running",
      {},
      [],
      oldDate,
    );
    runningState.updatedAt = oldDate;

    await adapter.saveState(runningState);

    const deleted = await adapter.cleanup(24 * 60 * 60 * 1000);

    expect(deleted).toBe(0);
    expect(await adapter.loadState("exec_running")).toBeDefined();
  });

  it("should generate unique execution IDs", () => {
    const id1 = createExecutionId();
    const id2 = createExecutionId();

    expect(id1).toMatch(/^exec_\d+_[a-z0-9]+$/);
    expect(id2).toMatch(/^exec_\d+_[a-z0-9]+$/);
    expect(id1).not.toBe(id2);
  });

  it("should create execution snapshot with timestamps", () => {
    const startTime = new Date();
    const snapshot = createExecutionSnapshot(
      "exec_snap",
      "workflow_1",
      "node_1",
      "running",
      { data: "value" },
      ["log1"],
      startTime,
    );

    expect(snapshot.executionId).toBe("exec_snap");
    expect(snapshot.status).toBe("running");
    expect(snapshot.startedAt).toBe(startTime);
    expect(snapshot.updatedAt).toBeInstanceOf(Date);
    expect(snapshot.completedAt).toBeUndefined();
  });

  it("should mark completed executions", () => {
    const snapshot = createExecutionSnapshot(
      "exec_complete",
      "workflow_1",
      "node_1",
      "completed",
      {},
      [],
      new Date(),
    );

    expect(snapshot.completedAt).toBeInstanceOf(Date);
  });
});
