/**
 * TinyFlow Profiler Utilities
 * Aggregation, ranking, and export helpers for per-step performance data
 */

import type { NodeProfileData } from "./serverApi";
import type { ExecutionStep } from "../hooks/useDebugger";

// ============================================================================
// Types
// ============================================================================

export interface ProfileSummaryRow {
  nodeId: string;
  durationMs: number;
  heapDelta: number;
  heapUsedAfter: number;
  cpuPercent: number;
  cpuTotalUs: number;
}

export interface AggregateStats {
  totalDurationMs: number;
  totalHeapDelta: number;
  totalCpuUs: number;
  peakHeap: number;
  stepCount: number;
}

export type SortField =
  | "durationMs"
  | "heapDelta"
  | "cpuPercent"
  | "cpuTotalUs";
export type SortDir = "asc" | "desc";

// ============================================================================
// Extraction
// ============================================================================

/**
 * Extract profile summary rows from executed steps
 */
export function extractProfiles(steps: ExecutionStep[]): ProfileSummaryRow[] {
  return steps
    .filter((s) => s.profile != null)
    .map((s) => {
      const p = s.profile!;
      return {
        nodeId: s.nodeId,
        durationMs: Math.round(p.durationMs * 100) / 100,
        heapDelta: p.heapDelta,
        heapUsedAfter: p.heapUsedAfter,
        cpuPercent: p.cpuPercent,
        cpuTotalUs: p.cpuUserUs + p.cpuSystemUs,
      };
    });
}

// ============================================================================
// Aggregation
// ============================================================================

/**
 * Compute aggregate stats across all profiled steps
 */
export function aggregateStats(rows: ProfileSummaryRow[]): AggregateStats {
  if (rows.length === 0) {
    return {
      totalDurationMs: 0,
      totalHeapDelta: 0,
      totalCpuUs: 0,
      peakHeap: 0,
      stepCount: 0,
    };
  }

  return {
    totalDurationMs: rows.reduce((acc, r) => acc + r.durationMs, 0),
    totalHeapDelta: rows.reduce((acc, r) => acc + r.heapDelta, 0),
    totalCpuUs: rows.reduce((acc, r) => acc + r.cpuTotalUs, 0),
    peakHeap: Math.max(...rows.map((r) => r.heapUsedAfter)),
    stepCount: rows.length,
  };
}

// ============================================================================
// Sorting & Ranking
// ============================================================================

/**
 * Sort rows by a given field
 */
export function sortProfiles(
  rows: ProfileSummaryRow[],
  field: SortField,
  dir: SortDir = "desc",
): ProfileSummaryRow[] {
  const sorted = [...rows].sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];
    return dir === "desc" ? bVal - aVal : aVal - bVal;
  });
  return sorted;
}

/**
 * Get the top-N heaviest steps by a given metric
 */
export function topN(
  rows: ProfileSummaryRow[],
  field: SortField,
  n: number,
): ProfileSummaryRow[] {
  return sortProfiles(rows, field, "desc").slice(0, n);
}

// ============================================================================
// Heatmap / Severity
// ============================================================================

export type Severity = "low" | "medium" | "high";

/**
 * Classify a value relative to a set of rows (percentile-based severity)
 */
export function severity(value: number, allValues: number[]): Severity {
  if (allValues.length === 0) return "low";
  const sorted = [...allValues].sort((a, b) => a - b);
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];

  if (value >= p90) return "high";
  if (value >= p75) return "medium";
  return "low";
}

/**
 * Get severity color class for a given level
 */
export function severityColor(level: Severity): string {
  switch (level) {
    case "high":
      return "text-red-600 dark:text-red-400";
    case "medium":
      return "text-amber-600 dark:text-amber-400";
    case "low":
      return "text-gray-500 dark:text-gray-400";
  }
}

/**
 * Get severity background color class for inline badges
 */
export function severityBg(level: Severity): string {
  switch (level) {
    case "high":
      return "bg-red-100 dark:bg-red-900/40";
    case "medium":
      return "bg-amber-100 dark:bg-amber-900/40";
    case "low":
      return "bg-gray-100 dark:bg-gray-800";
  }
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes);
  const sign = bytes < 0 ? "-" : "";
  if (abs < 1024) return `${sign}${abs} B`;
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(1)} KB`;
  return `${sign}${(abs / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format duration in ms to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Format microseconds
 */
export function formatMicroseconds(us: number): string {
  if (us < 1000) return `${us} µs`;
  if (us < 1_000_000) return `${(us / 1000).toFixed(1)} ms`;
  return `${(us / 1_000_000).toFixed(2)} s`;
}

// ============================================================================
// Export
// ============================================================================

/**
 * Export profile data as JSON string
 */
export function exportAsJson(
  rows: ProfileSummaryRow[],
  stats: AggregateStats,
): string {
  return JSON.stringify({ summary: stats, steps: rows }, null, 2);
}

/**
 * Export profile data as CSV string
 */
export function exportAsCsv(rows: ProfileSummaryRow[]): string {
  const header =
    "nodeId,durationMs,heapDelta,heapUsedAfter,cpuPercent,cpuTotalUs";
  const lines = rows.map(
    (r) =>
      `${r.nodeId},${r.durationMs},${r.heapDelta},${r.heapUsedAfter},${r.cpuPercent},${r.cpuTotalUs}`,
  );
  return [header, ...lines].join("\n");
}

/**
 * Trigger browser download of a string as a file
 */
export function downloadFile(
  content: string,
  filename: string,
  mime = "application/json",
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
