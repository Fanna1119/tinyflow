/**
 * Log Panel Component
 * Displays execution logs in a collapsible panel at the bottom of the editor
 */

import { useEffect, useRef } from "react";
import { Terminal, X, Trash2, ChevronUp, ChevronDown } from "lucide-react";

export interface LogEntry {
  timestamp: Date;
  message: string;
  type: "info" | "success" | "error" | "node";
}

interface LogPanelProps {
  logs: LogEntry[];
  isOpen: boolean;
  onToggle: () => void;
  onClear: () => void;
  isRunning?: boolean;
  duration?: number;
}

export function LogPanel({
  logs,
  isOpen,
  onToggle,
  onClear,
  isRunning,
  duration,
}: LogPanelProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (isOpen && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, isOpen]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  };

  const getLogColor = (type: LogEntry["type"]) => {
    switch (type) {
      case "success":
        return "text-green-400";
      case "error":
        return "text-red-400";
      case "node":
        return "text-blue-400";
      default:
        return "text-gray-300";
    }
  };

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 transition-all duration-200 ${
        isOpen ? "h-64" : "h-10"
      }`}
    >
      {/* Header */}
      <div
        className="h-10 px-3 flex items-center justify-between cursor-pointer hover:bg-gray-800"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-200">
            Console
            {logs.length > 0 && (
              <span className="ml-2 text-xs text-gray-500">
                ({logs.length} {logs.length === 1 ? "entry" : "entries"})
              </span>
            )}
          </span>
          {isRunning && (
            <div className="flex items-center gap-1.5 ml-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-xs text-blue-400">Running...</span>
            </div>
          )}
          {!isRunning && duration !== undefined && (
            <span className="text-xs text-gray-500 ml-2">
              Completed in {duration.toFixed(0)}ms
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {logs.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded"
              title="Clear logs"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded"
            title={isOpen ? "Collapse" : "Expand"}
          >
            {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          {isOpen && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded"
              title="Close"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Log content */}
      {isOpen && (
        <div className="h-[calc(100%-2.5rem)] overflow-auto font-mono text-xs">
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              No logs yet. Run a workflow to see output here.
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className="flex gap-2 hover:bg-gray-800/50 px-1 rounded"
                >
                  <span className="text-gray-500 select-none shrink-0">
                    {formatTime(log.timestamp)}
                  </span>
                  <span className={getLogColor(log.type)}>{log.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
