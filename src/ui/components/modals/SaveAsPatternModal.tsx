/**
 * Save As Pattern Modal
 *
 * Lets the user save selected nodes/edges as a reusable pattern.
 * Collects name, description, and icon. Positions are normalized
 * to relative offsets so patterns always insert cleanly.
 */

import { useState, useCallback, useEffect } from "react";
import { X, Save, Box, Puzzle } from "lucide-react";
import * as LucideIcons from "lucide-react";
import type { Node, Edge } from "@xyflow/react";
import type { WorkflowPattern } from "../../templates/types";
import {
  reactFlowNodeToWorkflowNode,
  reactFlowEdgeToWorkflowEdge,
} from "../../hooks/flowEditorUtils";

// ============================================================================
// Constants
// ============================================================================

const ICON_OPTIONS = [
  "Puzzle",
  "ShieldAlert",
  "Wand2",
  "MessageSquare",
  "GitBranch",
  "ArrowRightLeft",
  "Layers",
  "Zap",
  "Database",
  "Bot",
  "Workflow",
  "Sparkles",
  "Server",
  "Cloud",
  "FileJson",
  "Repeat",
];

// ============================================================================
// Dynamic icon helper
// ============================================================================

function DynamicIcon({
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
}

// ============================================================================
// Component
// ============================================================================

interface SaveAsPatternModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (pattern: WorkflowPattern) => void;
  /** Currently selected nodes on the canvas */
  selectedNodes: Node[];
  /** Currently selected edges on the canvas */
  selectedEdges: Edge[];
}

export function SaveAsPatternModal({
  isOpen,
  onClose,
  onSave,
  selectedNodes,
  selectedEdges,
}: SaveAsPatternModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("Puzzle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName("");
      setDescription("");
      setIcon("Puzzle");
      setSaving(false);
      setError(null);
    }
  }, [isOpen]);

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      setError("Pattern name is required");
      return;
    }

    if (selectedNodes.length === 0) {
      setError("No nodes selected");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Build the set of selected node IDs
      const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));

      // Filter edges: only keep those connecting two selected nodes
      const internalEdges = selectedEdges.filter(
        (e) => selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target),
      );

      // Compute bounding-box origin so we normalize positions to (0, 0)
      const minX = Math.min(...selectedNodes.map((n) => n.position.x));
      const minY = Math.min(...selectedNodes.map((n) => n.position.y));

      // Convert React Flow nodes → WorkflowNodes with normalized positions
      const workflowNodes = selectedNodes.map((node) => {
        const wn = reactFlowNodeToWorkflowNode(node);
        return {
          ...wn,
          position: {
            x: Math.round(wn.position.x - minX),
            y: Math.round(wn.position.y - minY),
          },
        };
      });

      // Convert React Flow edges → WorkflowEdges
      const workflowEdges = internalEdges.map((edge) =>
        reactFlowEdgeToWorkflowEdge(edge),
      );

      // Generate a slug-style ID from the name
      const id = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const pattern: WorkflowPattern = {
        id,
        name: name.trim(),
        description: description.trim(),
        icon,
        nodes: workflowNodes,
        edges: workflowEdges,
      };

      onSave(pattern);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save pattern");
      setSaving(false);
    }
  }, [name, description, icon, selectedNodes, selectedEdges, onSave]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[480px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/40">
              <Puzzle className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Save as Pattern
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Save the selected nodes as a reusable pattern
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Pattern Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Error Handler, Transform Chain"
              autoFocus
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe what this pattern does…"
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>

          {/* Icon */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Icon
            </label>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map((iconName) => {
                const isActive = icon === iconName;
                return (
                  <button
                    key={iconName}
                    onClick={() => setIcon(iconName)}
                    className={`p-2 rounded-lg border transition-colors ${
                      isActive
                        ? "bg-purple-100 border-purple-400 text-purple-600 dark:bg-purple-900/40 dark:border-purple-500 dark:text-purple-400"
                        : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                    }`}
                    title={iconName}
                  >
                    <DynamicIcon name={iconName} className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
              Selection Preview
            </div>
            <div className="space-y-1">
              {selectedNodes.map((node) => (
                <div
                  key={node.id}
                  className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                  <span className="font-medium">
                    {(node.data.label as string) || node.id}
                  </span>
                  <span className="text-xs text-gray-400">
                    {node.data.functionId as string}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {selectedNodes.length} node
              {selectedNodes.length !== 1 ? "s" : ""} ·{" "}
              {
                selectedEdges.filter(
                  (e) =>
                    new Set(selectedNodes.map((n) => n.id)).has(e.source) &&
                    new Set(selectedNodes.map((n) => n.id)).has(e.target),
                ).length
              }{" "}
              internal edge
              {selectedEdges.filter(
                (e) =>
                  new Set(selectedNodes.map((n) => n.id)).has(e.source) &&
                  new Set(selectedNodes.map((n) => n.id)).has(e.target),
              ).length !== 1
                ? "s"
                : ""}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-gray-200 dark:border-gray-700 gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || selectedNodes.length === 0}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg transition-colors ${
              saving || !name.trim() || selectedNodes.length === 0
                ? "text-gray-400 bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                : "text-white bg-purple-600 hover:bg-purple-700"
            }`}
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : "Save Pattern"}
          </button>
        </div>
      </div>
    </div>
  );
}
