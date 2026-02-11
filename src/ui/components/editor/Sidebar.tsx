/**
 * Function Sidebar
 * Shows available functions from registry for drag-and-drop
 * Resizable via drag handle, collapsible via toggle button
 */

import { useState, useMemo, useCallback, useRef, useEffect, memo } from "react";
import {
  Search,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Box,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Puzzle,
  LayoutTemplate,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { registry } from "../../../registry";
import type { FunctionMetadata } from "../../../schema/types";
import { patterns } from "../../templates";
import type { WorkflowPattern } from "../../templates";

const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 256;

// Dynamic icon component - renders the appropriate Lucide icon by name
const DynamicIcon = memo(function DynamicIcon({
  name,
  className,
}: {
  name?: string;
  className?: string;
}) {
  if (!name) return <Box className={className} />;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const icons = LucideIcons as any;
  const IconComponent = icons[name] ?? Box;
  return <IconComponent className={className} />;
});

type SidebarTab = "functions" | "patterns";

interface SidebarProps {
  onAddNode: (functionId: string) => void;
  onInsertPattern?: (pattern: WorkflowPattern) => void;
  onOpenTemplates?: () => void;
}

export function Sidebar({
  onAddNode,
  onInsertPattern,
  onOpenTemplates,
}: SidebarProps) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab>("functions");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(["Core", "Transform", "Control", "HTTP"]),
  );

  const functionsByCategory = useMemo(() => {
    const byCategory = registry.getMetadataByCategory();

    if (!search) return byCategory;

    // Filter by search
    const filtered = new Map<string, FunctionMetadata[]>();
    const searchLower = search.toLowerCase();

    for (const [category, functions] of byCategory) {
      const matches = functions.filter(
        (fn) =>
          fn.name.toLowerCase().includes(searchLower) ||
          fn.id.toLowerCase().includes(searchLower) ||
          fn.description.toLowerCase().includes(searchLower),
      );
      if (matches.length > 0) {
        filtered.set(category, matches);
      }
    }

    return filtered;
  }, [search]);

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleDragStart = (e: React.DragEvent, functionId: string) => {
    e.dataTransfer.setData("application/tinyflow-function", functionId);
    e.dataTransfer.effectAllowed = "copy";
  };

  // ---- Resize logic ----
  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      const startX = e.clientX;
      const startWidth = width;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const newWidth = Math.min(
          MAX_WIDTH,
          Math.max(MIN_WIDTH, startWidth + delta),
        );
        setWidth(newWidth);
      };

      const onMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [width],
  );

  // Prevent text selection during resize
  useEffect(() => {
    if (isResizing) {
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    } else {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }
    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizing]);

  // ---- Collapsed state: thin rail with toggle button ----
  if (collapsed) {
    return (
      <div className="flex h-full">
        <div className="w-10 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center pt-3">
          <button
            onClick={() => setCollapsed(false)}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
            title="Show sidebar"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ---- Expanded state ----
  return (
    <div className="flex h-full" ref={sidebarRef}>
      <div
        className="bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full"
        style={{ width }}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              {activeTab === "functions" ? "Functions" : "Patterns"}
            </h2>
            <button
              onClick={() => setCollapsed(true)}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
              title="Hide sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 mb-3 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <button
              onClick={() => setActiveTab("functions")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === "functions"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              Functions
            </button>
            <button
              onClick={() => setActiveTab("patterns")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === "patterns"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <Puzzle className="w-3.5 h-3.5" />
              Patterns
            </button>
          </div>

          {activeTab === "functions" && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search functions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}
        </div>

        {/* Functions tab content */}
        {activeTab === "functions" && (
          <>
            <div className="flex-1 overflow-y-auto p-2">
              {Array.from(functionsByCategory.entries()).map(
                ([category, functions]) => (
                  <div key={category} className="mb-2">
                    <button
                      onClick={() => toggleCategory(category)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                    >
                      {expandedCategories.has(category) ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      {category}
                      <span className="ml-auto text-xs text-gray-400">
                        {functions.length}
                      </span>
                    </button>

                    {expandedCategories.has(category) && (
                      <div className="mt-1 space-y-1">
                        {functions.map((fn) => (
                          <FunctionItem
                            key={fn.id}
                            metadata={fn}
                            onAdd={() => onAddNode(fn.id)}
                            onDragStart={(e) => handleDragStart(e, fn.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ),
              )}

              {functionsByCategory.size === 0 && (
                <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
                  No functions found
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
              Drag functions to the canvas or click to add
            </div>
          </>
        )}

        {/* Patterns tab content */}
        {activeTab === "patterns" && (
          <>
            <div className="flex-1 overflow-y-auto p-2">
              {/* Templates button */}
              {onOpenTemplates && (
                <button
                  onClick={onOpenTemplates}
                  className="w-full flex items-center gap-3 px-3 py-3 mb-3 rounded-lg border-2 border-dashed border-blue-300 dark:border-blue-700 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left"
                >
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40">
                    <LayoutTemplate className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      Start from Template
                    </div>
                    <div className="text-xs text-blue-500 dark:text-blue-400">
                      Pre-built complete workflows
                    </div>
                  </div>
                </button>
              )}

              {/* Pattern list */}
              <div className="space-y-2">
                <div className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Insert Pattern
                </div>
                {patterns.map((pattern) => (
                  <PatternItem
                    key={pattern.id}
                    pattern={pattern}
                    onInsert={() => onInsertPattern?.(pattern)}
                  />
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
              Click a pattern to insert it on the canvas
            </div>
          </>
        )}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={startResize}
        className={`w-1 cursor-col-resize hover:bg-blue-500 transition-colors ${
          isResizing ? "bg-blue-500" : "bg-transparent"
        }`}
        title="Drag to resize"
      />
    </div>
  );
}

// ============================================================================
// Pattern Item
// ============================================================================

interface PatternItemProps {
  pattern: WorkflowPattern;
  onInsert: () => void;
}

function PatternItem({ pattern, onInsert }: PatternItemProps) {
  return (
    <div
      onClick={onInsert}
      title={pattern.description}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 border border-purple-200 dark:border-purple-800 hover:border-purple-300 dark:hover:border-purple-700"
    >
      <div className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/40">
        <DynamicIcon
          name={pattern.icon}
          className="w-4 h-4 text-purple-600 dark:text-purple-400"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-purple-800 dark:text-purple-200">
          {pattern.name}
        </div>
        <div className="text-xs text-purple-600 dark:text-purple-400 truncate">
          {pattern.description}
        </div>
        <div className="text-[11px] text-purple-500 dark:text-purple-500 mt-0.5">
          {pattern.nodes.length} node{pattern.nodes.length !== 1 ? "s" : ""}
        </div>
      </div>
      <Puzzle className="w-4 h-4 text-purple-400 dark:text-purple-600 shrink-0" />
    </div>
  );
}

// ============================================================================
// Function Item
// ============================================================================

interface FunctionItemProps {
  metadata: FunctionMetadata;
  onAdd: () => void;
  onDragStart: (e: React.DragEvent) => void;
}

function FunctionItem({ metadata, onAdd, onDragStart }: FunctionItemProps) {
  const hasDeps =
    metadata.runtimeDependencies && metadata.runtimeDependencies.length > 0;
  const depNames = metadata.runtimeDependencies?.map((d) => {
    const idx = d.lastIndexOf("@");
    return idx > 0 ? d.slice(0, idx) : d;
  });

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onAdd}
      title={metadata.description}
      className={`flex items-center gap-2 px-2 py-2 ml-6 rounded cursor-pointer transition-colors group ${
        hasDeps
          ? "bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-700"
          : "bg-gray-50 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-transparent hover:border-blue-200 dark:hover:border-blue-800"
      }`}
    >
      <GripVertical className="w-3 h-3 text-gray-300 dark:text-gray-600 group-hover:text-gray-400" />
      <div className="p-1 rounded bg-white dark:bg-gray-700 shadow-sm">
        <DynamicIcon
          name={metadata.icon}
          className={`w-3.5 h-3.5 ${hasDeps ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400"}`}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
          {metadata.name}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {metadata.description}
        </div>
        {hasDeps && (
          <div className="mt-1 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300">
            <Package className="w-3 h-3 mt-0.5 shrink-0" />
            <span
              className="truncate"
              title={`bun run add:dep ${depNames!.join(" ")}`}
            >
              Run: bun run add:dep {depNames!.join(" ")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
