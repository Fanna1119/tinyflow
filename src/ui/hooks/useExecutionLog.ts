/**
 * Enhanced Execution Log Hook
 * Tracks detailed per-node execution information
 */

import { useState, useCallback, useRef } from "react";

export interface NodeExecutionLog {
  nodeId: string;
  functionId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success?: boolean;
  output?: unknown;
  error?: string;
  logs: string[];
}

export interface ExecutionHistoryEntry {
  executionId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  nodeExecutions: NodeExecutionLog[];
  totalLogs: string[];
}

export function useExecutionLog() {
  const [currentExecution, setCurrentExecution] =
    useState<ExecutionHistoryEntry | null>(null);
  const [history, setHistory] = useState<ExecutionHistoryEntry[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);

  const executionIdRef = useRef(0);
  const nodeLogsRef = useRef<Map<string, string[]>>(new Map());

  const startExecution = useCallback(() => {
    executionIdRef.current += 1;
    const executionId = `exec_${executionIdRef.current}`;

    nodeLogsRef.current.clear();

    const newExecution: ExecutionHistoryEntry = {
      executionId,
      startTime: performance.now(),
      success: false,
      nodeExecutions: [],
      totalLogs: [],
    };

    setCurrentExecution(newExecution);
    setCurrentNodeId(null);

    return executionId;
  }, []);

  const startNode = useCallback(
    (nodeId: string, functionId: string) => {
      if (!currentExecution) return;

      setCurrentNodeId(nodeId);
      nodeLogsRef.current.set(nodeId, []);

      const nodeLog: NodeExecutionLog = {
        nodeId,
        functionId,
        startTime: performance.now(),
        logs: [],
      };

      setCurrentExecution((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          nodeExecutions: [...prev.nodeExecutions, nodeLog],
        };
      });
    },
    [currentExecution],
  );

  const endNode = useCallback(
    (nodeId: string, success: boolean, output?: unknown, error?: string) => {
      if (!currentExecution) return;

      setCurrentExecution((prev) => {
        if (!prev) return prev;

        const nodeExecutions = prev.nodeExecutions.map((node) => {
          if (node.nodeId === nodeId && !node.endTime) {
            const endTime = performance.now();
            return {
              ...node,
              endTime,
              duration: endTime - node.startTime,
              success,
              output,
              error,
              logs: nodeLogsRef.current.get(nodeId) ?? [],
            };
          }
          return node;
        });

        return { ...prev, nodeExecutions };
      });

      setCurrentNodeId(null);
    },
    [currentExecution],
  );

  const addLog = useCallback(
    (message: string) => {
      if (!currentExecution) return;

      setCurrentExecution((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          totalLogs: [...prev.totalLogs, message],
        };
      });

      // Add to current node logs if there's an active node
      if (currentNodeId) {
        const nodeLogs = nodeLogsRef.current.get(currentNodeId) ?? [];
        nodeLogs.push(message);
        nodeLogsRef.current.set(currentNodeId, nodeLogs);
      }
    },
    [currentExecution, currentNodeId],
  );

  const endExecution = useCallback(
    (success: boolean) => {
      if (!currentExecution) return;

      const endTime = performance.now();
      const finalExecution: ExecutionHistoryEntry = {
        ...currentExecution,
        endTime,
        duration: endTime - currentExecution.startTime,
        success,
      };

      setCurrentExecution(finalExecution);
      setHistory((prev) => [finalExecution, ...prev].slice(0, 50)); // Keep last 50
      setCurrentNodeId(null);
    },
    [currentExecution],
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const getNodeDuration = useCallback(
    (nodeId: string): number | undefined => {
      return currentExecution?.nodeExecutions.find((n) => n.nodeId === nodeId)
        ?.duration;
    },
    [currentExecution],
  );

  const getNodeStatus = useCallback(
    (
      nodeId: string,
    ): "pending" | "running" | "success" | "error" | undefined => {
      if (!currentExecution) return undefined;

      const node = currentExecution.nodeExecutions.find(
        (n) => n.nodeId === nodeId,
      );
      if (!node) return "pending";
      if (!node.endTime) return "running";
      return node.success ? "success" : "error";
    },
    [currentExecution],
  );

  return {
    currentExecution,
    history,
    currentNodeId,
    startExecution,
    startNode,
    endNode,
    addLog,
    endExecution,
    clearHistory,
    getNodeDuration,
    getNodeStatus,
  };
}
