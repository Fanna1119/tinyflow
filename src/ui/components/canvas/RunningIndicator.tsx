/**
 * Running Indicator Component
 * Shows a loading spinner when workflow is executing
 */

interface RunningIndicatorProps {
  message?: string;
}

export function RunningIndicator({
  message = "Running workflow...",
}: RunningIndicatorProps) {
  return (
    <div className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
      {message}
    </div>
  );
}
