/**
 * Workflow Tabs Component
 * Manages multiple open workflows as tabs
 */

import { useState, useCallback } from "react";
import { Plus, X, FileJson, Upload, MoreHorizontal } from "lucide-react";
import type { WorkflowDefinition } from "../../../schema/types";

// ============================================================================
// Types
// ============================================================================

export interface WorkflowTab {
  /** Unique tab ID */
  id: string;
  /** Workflow name (display) */
  name: string;
  /** Whether the tab has unsaved changes */
  isDirty: boolean;
  /** The workflow data */
  workflow: WorkflowDefinition;
  /** File handle if imported from disk */
  fileHandle?: FileSystemFileHandle;
}

interface WorkflowTabsProps {
  /** List of open tabs */
  tabs: WorkflowTab[];
  /** Currently active tab ID */
  activeTabId: string | null;
  /** Callback when tab is selected */
  onSelectTab: (tabId: string) => void;
  /** Callback when tab is closed */
  onCloseTab: (tabId: string) => void;
  /** Callback when new tab is requested */
  onNewTab: () => void;
  /** Callback when import is requested */
  onImportTab: () => void;
  /** Callback when tab name changes */
  onRenameTab: (tabId: string, name: string) => void;
  /** Callback when tab is marked dirty */
  onMarkDirty: (tabId: string, isDirty: boolean) => void;
}

// ============================================================================
// Component
// ============================================================================

export function WorkflowTabs({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onImportTab,
  onRenameTab,
}: WorkflowTabsProps) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showMenu, setShowMenu] = useState<string | null>(null);

  const handleStartRename = useCallback((tab: WorkflowTab) => {
    setEditingTabId(tab.id);
    setEditingName(tab.name);
    setShowMenu(null);
  }, []);

  const handleFinishRename = useCallback(() => {
    if (editingTabId && editingName.trim()) {
      onRenameTab(editingTabId, editingName.trim());
    }
    setEditingTabId(null);
    setEditingName("");
  }, [editingTabId, editingName, onRenameTab]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleFinishRename();
      } else if (e.key === "Escape") {
        setEditingTabId(null);
        setEditingName("");
      }
    },
    [handleFinishRename],
  );

  return (
    <div className="flex items-center h-10 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
      {/* Tab list */}
      <div className="flex items-center flex-1 min-w-0">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`group flex items-center gap-2 px-3 py-2 border-r border-gray-200 dark:border-gray-700 cursor-pointer select-none min-w-0 max-w-[200px] ${
              activeTabId === tab.id
                ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
            onClick={() => onSelectTab(tab.id)}
            onDoubleClick={() => handleStartRename(tab)}
          >
            <FileJson className="w-4 h-4 flex-shrink-0 text-blue-500" />

            {editingTabId === tab.id ? (
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={handleFinishRename}
                onKeyDown={handleKeyDown}
                className="flex-1 min-w-0 px-1 py-0.5 text-sm bg-white dark:bg-gray-800 border border-blue-500 rounded focus:outline-none"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="flex-1 min-w-0 text-sm truncate">
                {tab.name}
                {tab.isDirty && <span className="text-gray-400 ml-1">•</span>}
              </span>
            )}

            {/* Context menu button */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(showMenu === tab.id ? null : tab.id);
                }}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                <MoreHorizontal className="w-3 h-3" />
              </button>

              {showMenu === tab.id && (
                <div className="absolute top-full right-0 mt-1 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 min-w-[120px]">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartRename(tab);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Rename
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                      setShowMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {/* New tab / Import buttons */}
      <div className="flex items-center gap-1 px-2 shrink-0">
        <button
          onClick={onNewTab}
          className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          title="New workflow"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={onImportTab}
          className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          title="Import workflow"
        >
          <Upload className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Create a new empty workflow
 */
export function createEmptyWorkflow(name?: string): WorkflowDefinition {
  const id = `workflow-${Date.now()}`;
  return {
    id,
    name: name ?? "Untitled Workflow",
    description: "",
    version: "1.0.0",
    nodes: [],
    edges: [],
    flow: {
      startNodeId: "",
    },
  };
}

/**
 * Create a new tab from a workflow
 */
export function createTab(
  workflow: WorkflowDefinition,
  fileHandle?: FileSystemFileHandle,
): WorkflowTab {
  return {
    id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: workflow.name,
    isDirty: false,
    workflow,
    fileHandle,
  };
}
