/**
 * Validation Panel Component
 * Displays validation errors in an overlay
 */

interface ValidationPanelProps {
  errors: string[];
  onDismiss: () => void;
  maxVisible?: number;
}

export function ValidationPanel({
  errors,
  onDismiss,
  maxVisible = 5,
}: ValidationPanelProps) {
  if (errors.length === 0) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 max-w-sm shadow-lg">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
          {errors.length} issue{errors.length > 1 ? "s" : ""}
        </span>
        <button
          onClick={onDismiss}
          className="text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200 text-xs"
        >
          Dismiss
        </button>
      </div>
      <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
        {errors.slice(0, maxVisible).map((err, i) => (
          <li key={i}>• {err}</li>
        ))}
        {errors.length > maxVisible && (
          <li className="text-amber-500">
            ...and {errors.length - maxVisible} more
          </li>
        )}
      </ul>
    </div>
  );
}
