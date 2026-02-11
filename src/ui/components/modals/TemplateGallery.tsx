/**
 * Template Gallery Modal
 *
 * Displays available workflow templates in a visual grid.
 * Users pick a template to replace the current (empty or confirmed) canvas.
 */

import { useState, useMemo, useEffect } from "react";
import {
  X,
  Search,
  Rocket,
  Globe,
  GitBranch,
  ArrowRightLeft,
  Layers,
  Box,
  Loader2,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import {
  fetchTemplates,
  type WorkflowTemplate,
  type TemplateCategory,
} from "../../templates";

// ============================================================================
// Dynamic icon helper (reuse pattern from Sidebar)
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
// Difficulty badge
// ============================================================================

const difficultyColors = {
  beginner:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  intermediate:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  advanced: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

// ============================================================================
// Category icon mapping
// ============================================================================

const categoryIcons: Record<string, typeof Rocket> = {
  "Getting Started": Rocket,
  "Data Processing": ArrowRightLeft,
  "API & HTTP": Globe,
  "Control Flow": GitBranch,
  Patterns: Layers,
};

// ============================================================================
// Component
// ============================================================================

interface TemplateGalleryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (template: WorkflowTemplate) => void;
}

export function TemplateGallery({
  isOpen,
  onClose,
  onSelect,
}: TemplateGalleryProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<
    TemplateCategory | "All"
  >("All");
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch templates when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    fetchTemplates()
      .then((data) => {
        setTemplates(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load templates:", err);
        setError(err.message || "Failed to load templates");
        setLoading(false);
      });
  }, [isOpen]);

  // Build categories from loaded templates
  const categories: (TemplateCategory | "All")[] = useMemo(() => {
    const cats = new Set<TemplateCategory>();
    for (const t of templates) cats.add(t.category);
    return ["All", ...Array.from(cats)] as (TemplateCategory | "All")[];
  }, [templates]);

  // Filtered templates
  const filtered = useMemo(() => {
    let list = templates;

    if (selectedCategory !== "All") {
      list = list.filter((t) => t.category === selectedCategory);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.includes(q)),
      );
    }

    return list;
  }, [search, selectedCategory, templates]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[720px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Start from a Template
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Pick a pre-built workflow to get started quickly
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search + category filters */}
        <div className="px-6 pt-4 pb-2 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search templates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Category pills */}
          <div className="flex gap-2 flex-wrap">
            {categories.map((cat) => {
              const CatIcon = cat === "All" ? Box : (categoryIcons[cat] ?? Box);
              const isActive = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    isActive
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                  }`}
                >
                  <CatIcon className="w-3.5 h-3.5" />
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Template grid */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin opacity-40" />
              <p className="text-sm">Loading templates…</p>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-500 dark:text-red-400">
              <p className="text-sm">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No templates match your search</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {filtered.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onSelect={() => {
                    onSelect(template);
                    onClose();
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          {filtered.length} template{filtered.length !== 1 ? "s" : ""} available
          · Click a template to load it
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Template Card
// ============================================================================

function TemplateCard({
  template,
  onSelect,
}: {
  template: WorkflowTemplate;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="text-left p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all group bg-white dark:bg-gray-800/50"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 transition-colors">
          <DynamicIcon name={template.icon} className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
              {template.name}
            </h3>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${difficultyColors[template.difficulty]}`}
            >
              {template.difficulty}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
            {template.description}
          </p>
          <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-400 dark:text-gray-500">
            <span>{template.nodes.length} nodes</span>
            <span>·</span>
            <span>{template.edges.length} edges</span>
          </div>
        </div>
      </div>
    </button>
  );
}
