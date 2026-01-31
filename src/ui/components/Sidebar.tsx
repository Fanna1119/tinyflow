/**
 * Function Sidebar
 * Shows available functions from registry for drag-and-drop
 */

import { useState, useMemo, memo } from "react";
import {
  Search,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Box,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { registry } from "../../registry";
import type { FunctionMetadata } from "../../schema/types";

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

  return (
    <div className="w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Functions
        </h2>
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
  );
}

interface FunctionItemProps {
  metadata: FunctionMetadata;
  onAdd: () => void;
  onDragStart: (e: React.DragEvent) => void;
}

function FunctionItem({ metadata, onAdd, onDragStart }: FunctionItemProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onAdd}
      className="flex items-center gap-2 px-2 py-2 ml-6 rounded cursor-pointer bg-gray-50 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-transparent hover:border-blue-200 dark:hover:border-blue-800 transition-colors group"
    >
      <GripVertical className="w-3 h-3 text-gray-300 dark:text-gray-600 group-hover:text-gray-400" />
      <div className="p-1 rounded bg-white dark:bg-gray-700 shadow-sm">
        <DynamicIcon
          name={metadata.icon}
          className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
          {metadata.name}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {metadata.description}
        </div>
      </div>
    </div>
  );
}
