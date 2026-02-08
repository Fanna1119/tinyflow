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
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { registry } from "../../../registry";
import type { FunctionMetadata } from "../../../schema/types";

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

interface SidebarProps {
  onAddNode: (functionId: string) => void;
}

export function Sidebar({ onAddNode }: SidebarProps) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
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
              Functions
            </h2>
            <button
              onClick={() => setCollapsed(true)}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
              title="Hide sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
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
        </div>

        {/* Function List */}
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
            <span className="truncate" title={`bun add ${depNames!.join(" ")}`}>
              Run: bun add {depNames!.join(" ")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
