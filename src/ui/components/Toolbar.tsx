/**
 * Toolbar Component
 * Actions for the flow editor
 */

import {
  Download,
  Upload,
  Play,
  Trash2,
  CheckCircle,
  AlertCircle,
  FileJson,
  Save,
} from "lucide-react";

interface ToolbarProps {
  workflowName: string;
  isDirty: boolean;
  validationErrors: string[];
  onImport: () => void;
  onExport: () => void;
  onSave: () => void;
  canSave: boolean;
  onRun: () => void;
  onClear: () => void;
  onValidate: () => void;
  onNameChange: (name: string) => void;
}

export function Toolbar({
  workflowName,
  isDirty,
  validationErrors,
  onImport,
  onExport,
  onSave,
  canSave,
  onRun,
  onClear,
  onValidate,
  onNameChange,
}: ToolbarProps) {
  const isValid = validationErrors.length === 0;

  return (
    <div className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4">
      {/* Left: Workflow name */}
      <div className="flex items-center gap-3">
        <FileJson className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <input
          type="text"
          value={workflowName}
          onChange={(e) => onNameChange(e.target.value)}
          className="text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 text-gray-900 dark:text-gray-100"
        />
        {isDirty && (
          <span className="text-xs text-gray-400">• Unsaved changes</span>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Validation status */}
        <button
          onClick={onValidate}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
            isValid
              ? "text-green-700 bg-green-50 hover:bg-green-100 dark:text-green-400 dark:bg-green-900/20 dark:hover:bg-green-900/30"
              : "text-amber-700 bg-amber-50 hover:bg-amber-100 dark:text-amber-400 dark:bg-amber-900/20 dark:hover:bg-amber-900/30"
          }`}
          title={
            isValid
              ? "Workflow is valid"
              : `${validationErrors.length} issue(s)`
          }
        >
          {isValid ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          {isValid ? "Valid" : `${validationErrors.length} issue(s)`}
        </button>

        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-2" />

        {/* Import */}
        <button
          onClick={onImport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <Upload className="w-4 h-4" />
          Import
        </button>

        {/* Export */}
        <button
          onClick={onExport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <Download className="w-4 h-4" />
          Export
        </button>

        {/* Save */}
        {canSave && (
          <button
            onClick={onSave}
            disabled={!isDirty}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              isDirty
                ? "text-white bg-green-600 hover:bg-green-700"
                : "text-gray-400 bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
            }`}
          >
            <Save className="w-4 h-4" />
            Save
          </button>
        )}

        {/* Clear */}
        <button
          onClick={onClear}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Clear
        </button>

        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-2" />

        {/* Run */}
        <button
          onClick={onRun}
          disabled={!isValid}
          className={`flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg transition-colors ${
            isValid
              ? "text-white bg-blue-600 hover:bg-blue-700"
              : "text-gray-400 bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
          }`}
        >
          <Play className="w-4 h-4" />
          Run
        </button>
      </div>
    </div>
  );
}
