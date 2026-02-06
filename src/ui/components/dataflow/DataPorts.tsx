/**
 * Data Port Indicators
 * Small visual indicators on nodes showing what store keys they produce/consume.
 * Makes the data flow visible at a glance on the canvas.
 */

import { memo } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

interface DataPortsProps {
  /** Keys this node produces (writes to store) */
  produces: string[];
  /** Keys this node consumes (reads from store) */
  consumes: string[];
  /** Whether the consumed keys are connected (matched by upstream) */
  connectedInputs?: Set<string>;
}

export const DataPorts = memo(function DataPorts({
  produces,
  consumes,
  connectedInputs,
}: DataPortsProps) {
  if (produces.length === 0 && consumes.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1.5 pt-1.5 border-t border-gray-100 dark:border-gray-700">
      {/* Consumed keys (inputs) */}
      {consumes.map((key) => {
        const isConnected = connectedInputs?.has(key);
        return (
          <div
            key={`in-${key}`}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono leading-tight ${
              isConnected
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            }`}
            title={
              isConnected
                ? `Reads "${key}" from upstream`
                : `Reads "${key}" — not found upstream`
            }
          >
            <ArrowDown className="w-2.5 h-2.5" />
            {key}
          </div>
        );
      })}

      {/* Produced keys (outputs) */}
      {produces.map((key) => (
        <div
          key={`out-${key}`}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono leading-tight bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
          title={`Writes "${key}" to store`}
        >
          <ArrowUp className="w-2.5 h-2.5" />
          {key}
        </div>
      ))}
    </div>
  );
});
