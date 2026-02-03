/**
 * File Operations Hook
 * Handles import, export, and save operations for workflows
 */

import { useCallback, useRef, useState } from "react";
import type { WorkflowDefinition } from "../../schema/types";

interface ImportResult {
  success: boolean;
  error?: string;
  warnings?: string[];
}

interface UseFileOperationsOptions {
  onImport: (json: string) => ImportResult;
  onExport: () => WorkflowDefinition;
  onSave?: (workflow: WorkflowDefinition) => void;
  onAfterImport?: () => void;
}

export function useFileOperations({
  onImport,
  onExport,
  onSave,
  onAfterImport,
}: UseFileOperationsOptions) {
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSave = fileHandle !== null || "showSaveFilePicker" in window;

  // Import using File System Access API (for save support) or fallback
  const handleImport = useCallback(async () => {
    // Try File System Access API first (Chrome/Edge)
    if ("showOpenFilePicker" in window) {
      try {
        const [handle] = await (
          window as Window & {
            showOpenFilePicker: (options: {
              types: Array<{
                description: string;
                accept: Record<string, string[]>;
              }>;
            }) => Promise<FileSystemFileHandle[]>;
          }
        ).showOpenFilePicker({
          types: [
            {
              description: "JSON files",
              accept: { "application/json": [".json"] },
            },
          ],
        });
        const file = await handle.getFile();
        const json = await file.text();
        const result = onImport(json);
        if (!result.success) {
          alert(`Import failed: ${result.error}`);
          console.error("Import error:", result.error);
        } else {
          if (result.warnings?.length) {
            console.warn("Import warnings:", result.warnings);
            alert(`Imported with warnings:\n• ${result.warnings.join("\n• ")}`);
          }
          setFileHandle(handle);
          onAfterImport?.();
        }
      } catch (err) {
        // User cancelled or API not supported
        if ((err as Error).name !== "AbortError") {
          console.error("File picker error:", err);
        }
      }
    } else {
      // Fallback to file input
      fileInputRef.current?.click();
    }
  }, [onImport, onAfterImport]);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const json = e.target?.result as string;
        const result = onImport(json);
        if (!result.success) {
          alert(`Import failed: ${result.error}`);
        } else {
          if (result.warnings?.length) {
            console.warn("Import warnings:", result.warnings);
            alert(`Imported with warnings:\n• ${result.warnings.join("\n• ")}`);
          }
          setFileHandle(null); // No handle available with fallback
          onAfterImport?.();
        }
      };
      reader.readAsText(file);

      // Reset input
      event.target.value = "";
    },
    [onImport, onAfterImport],
  );

  // Save to file (overwrites original)
  const handleSave = useCallback(async () => {
    const workflow = onExport();
    const json = JSON.stringify(workflow, null, 2);

    if (fileHandle) {
      // Save to the same file
      try {
        const writable = await fileHandle.createWritable();
        await writable.write(json);
        await writable.close();
        onSave?.(workflow);
      } catch (err) {
        console.error("Save failed:", err);
        alert("Save failed. Try using Export instead.");
      }
    } else if ("showSaveFilePicker" in window) {
      // No existing file, prompt for save location
      try {
        const handle = await (
          window as Window & {
            showSaveFilePicker: (options: {
              suggestedName: string;
              types: Array<{
                description: string;
                accept: Record<string, string[]>;
              }>;
            }) => Promise<FileSystemFileHandle>;
          }
        ).showSaveFilePicker({
          suggestedName: `${workflow.id}.json`,
          types: [
            {
              description: "JSON files",
              accept: { "application/json": [".json"] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        setFileHandle(handle);
        onSave?.(workflow);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Save failed:", err);
        }
      }
    } else {
      alert(
        "Your browser does not support direct file saving. Use Export instead.",
      );
    }
  }, [onExport, fileHandle, onSave]);

  // Export (download)
  const handleExport = useCallback(() => {
    const workflow = onExport();
    const json = JSON.stringify(workflow, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workflow.id}.json`;
    a.click();
    URL.revokeObjectURL(url);

    onSave?.(workflow);
  }, [onExport, onSave]);

  return {
    fileInputRef,
    fileHandle,
    canSave,
    handleImport,
    handleFileChange,
    handleSave,
    handleExport,
  };
}
