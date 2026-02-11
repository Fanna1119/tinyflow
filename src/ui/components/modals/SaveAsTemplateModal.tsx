/**
 * Save As Template Modal
 *
 * Lets the user save the current workflow as a reusable template.
 * Collects name, description, category, icon, difficulty, and tags.
 */

import { useState, useCallback } from "react";
import { X, Save, Box } from "lucide-react";
import * as LucideIcons from "lucide-react";
import type { WorkflowTemplate, TemplateCategory } from "../../templates/types";

// ============================================================================
// Constants
// ============================================================================

const CATEGORIES: TemplateCategory[] = [
  "Getting Started",
  "Data Processing",
  "API & HTTP",
  "Control Flow",
  "Patterns",
];

const DIFFICULTY_OPTIONS: WorkflowTemplate["difficulty"][] = [
  "beginner",
  "intermediate",
  "advanced",
];

const ICON_OPTIONS = [
  "Rocket",
  "Globe",
  "GitBranch",
  "ArrowRightLeft",
  "Layers",
  "Zap",
  "Database",
  "MessageSquare",
  "ShieldAlert",
  "Wand2",
  "FileJson",
  "Bot",
  "Workflow",
  "Sparkles",
  "Server",
  "Cloud",
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
// Difficulty badge colors
// ============================================================================

const difficultyColors = {
  beginner:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-300 dark:border-green-700",
  intermediate:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-300 dark:border-amber-700",
  advanced:
    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-300 dark:border-red-700",
};

// ============================================================================
// Component
// ============================================================================

interface SaveAsTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (template: WorkflowTemplate) => void;
  /** Pre-filled name from the current workflow */
  defaultName?: string;
  /** Pre-filled description */
  defaultDescription?: string;
  /** Number of nodes in current workflow (for preview) */
  nodeCount?: number;
  /** Number of edges in current workflow (for preview) */
  edgeCount?: number;
}

export function SaveAsTemplateModal({
  isOpen,
  onClose,
  onSave,
  defaultName = "",
  defaultDescription = "",
  nodeCount = 0,
  edgeCount = 0,
}: SaveAsTemplateModalProps) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState(defaultDescription);
  const [category, setCategory] = useState<TemplateCategory>("Getting Started");
  const [icon, setIcon] = useState("Rocket");
  const [difficulty, setDifficulty] =
    useState<WorkflowTemplate["difficulty"]>("beginner");
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens with new defaults
  const resetForm = useCallback(() => {
    setName(defaultName);
    setDescription(defaultDescription);
    setCategory("Getting Started");
    setIcon("Rocket");
    setDifficulty("beginner");
    setTagsInput("");
    setSaving(false);
    setError(null);
  }, [defaultName, defaultDescription]);

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      setError("Template name is required");
      return;
    }

    setSaving(true);
    setError(null);

    // Generate a slug-style ID from the name
    const id = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const template: WorkflowTemplate = {
      id,
      name: name.trim(),
      description: description.trim(),
      category,
      icon,
      difficulty,
      tags,
      // nodes, edges, startNodeId will be filled in by the caller
      nodes: [],
      edges: [],
      startNodeId: "",
    };

    try {
      onSave(template);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
      setSaving(false);
    }
  }, [
    name,
    description,
    category,
    icon,
    difficulty,
    tagsInput,
    onSave,
    resetForm,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[560px] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Save as Template
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Save this workflow so you can reuse it later
            </p>
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
              Template Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Custom Pipeline"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              placeholder="Briefly describe what this template does…"
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as TemplateCategory)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
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
                        ? "bg-blue-100 border-blue-400 text-blue-600 dark:bg-blue-900/40 dark:border-blue-500 dark:text-blue-400"
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

          {/* Difficulty */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Difficulty
            </label>
            <div className="flex gap-2">
              {DIFFICULTY_OPTIONS.map((diff) => {
                const isActive = difficulty === diff;
                return (
                  <button
                    key={diff}
                    onClick={() => setDifficulty(diff)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors capitalize ${
                      isActive
                        ? difficultyColors[diff]
                        : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                    }`}
                  >
                    {diff}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tags{" "}
              <span className="font-normal text-gray-400">
                (comma-separated)
              </span>
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. api, data, pipeline"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {nodeCount} node{nodeCount !== 1 ? "s" : ""} · {edgeCount} edge
            {edgeCount !== 1 ? "s" : ""}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg transition-colors ${
                saving || !name.trim()
                  ? "text-gray-400 bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                  : "text-white bg-blue-600 hover:bg-blue-700"
              }`}
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving…" : "Save Template"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
