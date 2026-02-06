/**
 * Key Suggestion Input Component
 * A text input with a dropdown showing available upstream store keys.
 * Used for params like outputKey, promptKey, inputKey, etc.
 */

import { useState, useRef, useEffect, useCallback, memo } from "react";
import { ArrowDown, ArrowUp, Database, Link2 } from "lucide-react";
import type { ProducedKey } from "../../hooks/useDataFlowAnalysis";

interface KeySuggestionInputProps {
  /** Current field value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Available upstream keys to suggest */
  availableKeys: ProducedKey[];
  /** Whether this is an input key (reads from store) or output key (writes to store) */
  direction: "input" | "output";
  /** HTML id for the input */
  id?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Additional CSS classes */
  className?: string;
}

export const KeySuggestionInput = memo(function KeySuggestionInput({
  value,
  onChange,
  availableKeys,
  direction,
  id,
  placeholder,
  className,
}: KeySuggestionInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter keys based on current input
  const filteredKeys = availableKeys.filter((k) =>
    k.key.toLowerCase().includes(value.toLowerCase()),
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as globalThis.Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as globalThis.Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (key: string) => {
      onChange(key);
      setIsOpen(false);
      setHighlightedIndex(-1);
      inputRef.current?.focus();
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        setIsOpen(true);
        e.preventDefault();
        return;
      }

      if (!isOpen) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < filteredKeys.length - 1 ? prev + 1 : 0,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredKeys.length - 1,
          );
          break;
        case "Enter":
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < filteredKeys.length) {
            handleSelect(filteredKeys[highlightedIndex].key);
          }
          break;
        case "Escape":
          setIsOpen(false);
          setHighlightedIndex(-1);
          break;
      }
    },
    [isOpen, filteredKeys, highlightedIndex, handleSelect],
  );

  // Check if current value matches a known upstream key
  const isConnected =
    direction === "input" && availableKeys.some((k) => k.key === value);
  const matchedKey = isConnected
    ? availableKeys.find((k) => k.key === value)
    : null;

  const borderColor = isConnected
    ? "border-green-400 dark:border-green-600 focus-within:ring-green-500"
    : direction === "output"
      ? "border-blue-200 dark:border-blue-700 focus-within:ring-blue-500"
      : "border-gray-200 dark:border-gray-600 focus-within:ring-blue-500";

  return (
    <div className="relative">
      {/* Input with icon */}
      <div
        className={`flex items-center gap-1 rounded-lg border bg-white dark:bg-gray-800 focus-within:ring-2 transition-colors ${borderColor} ${className ?? ""}`}
      >
        {/* Direction indicator */}
        <div className="pl-2 shrink-0">
          {direction === "input" ? (
            <ArrowDown
              className={`w-3.5 h-3.5 ${isConnected ? "text-green-500" : "text-amber-500"}`}
            />
          ) : (
            <ArrowUp className="w-3.5 h-3.5 text-blue-500" />
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          id={id}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => {
            if (direction === "input" && availableKeys.length > 0) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            placeholder ??
            (direction === "input" ? "Select a key…" : "Name this output…")
          }
          className="flex-1 min-w-0 px-2 py-2 text-sm bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none"
        />

        {/* Dropdown toggle for input keys */}
        {direction === "input" && availableKeys.length > 0 && (
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="pr-2 shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            tabIndex={-1}
          >
            <Database className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Connected key indicator */}
      {matchedKey && (
        <div className="mt-1 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
          <Link2 className="w-3 h-3" />
          <span>
            from <span className="font-medium">{matchedKey.sourceLabel}</span>
          </span>
        </div>
      )}

      {/* Dropdown */}
      {isOpen && filteredKeys.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto"
        >
          <div className="px-2 py-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
            Available upstream keys
          </div>
          {filteredKeys.map((pk, idx) => (
            <button
              key={`${pk.key}-${pk.sourceNodeId}`}
              type="button"
              onClick={() => handleSelect(pk.key)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                idx === highlightedIndex
                  ? "bg-blue-50 dark:bg-blue-900/30"
                  : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-medium text-gray-900 dark:text-gray-100">
                  {pk.key}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                  {pk.sourceFunctionId}
                </span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                from <span className="font-medium">{pk.sourceLabel}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Empty state when open with no matches */}
      {isOpen &&
        direction === "input" &&
        filteredKeys.length === 0 &&
        availableKeys.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg"
          >
            <div className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400 text-center">
              No matching keys
            </div>
          </div>
        )}
    </div>
  );
});
