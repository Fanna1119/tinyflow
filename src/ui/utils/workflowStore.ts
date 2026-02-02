/**
 * Workflow File Storage
 * Manages saving/loading workflows to .tinyflow/flows/ directory
 */

import type { WorkflowDefinition } from "../../schema/types";

// ============================================================================
// Types
// ============================================================================

export interface StoredWorkflowMeta {
  id: string;
  name: string;
  filename: string;
  lastModified: number;
}

// ============================================================================
// Directory Handle Management
// ============================================================================

let projectDirHandle: FileSystemDirectoryHandle | null = null;

/**
 * Set the project directory handle (called from settings access)
 */
export function setProjectDirectory(
  handle: FileSystemDirectoryHandle | null,
): void {
  projectDirHandle = handle;
}

/**
 * Get current project directory handle
 */
export function getProjectDirectory(): FileSystemDirectoryHandle | null {
  return projectDirHandle;
}

/**
 * Check if we have project directory access
 */
export function hasProjectAccess(): boolean {
  return projectDirHandle !== null;
}

// ============================================================================
// Flows Directory Operations
// ============================================================================

const FLOWS_DIRNAME = ".tinyflow/flows";

/**
 * Get or create the flows directory
 */
async function getFlowsDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!projectDirHandle) return null;

  try {
    // Get or create .tinyflow directory
    const tinyflowDir = await projectDirHandle.getDirectoryHandle(".tinyflow", {
      create: true,
    });

    // Get or create flows subdirectory
    return await tinyflowDir.getDirectoryHandle("flows", {
      create: true,
    });
  } catch (err) {
    console.error("Failed to access flows directory:", err);
    return null;
  }
}

/**
 * Generate a safe filename from workflow name
 */
function toSafeFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "workflow"
  );
}

/**
 * List all workflows in the flows directory
 */
export async function listWorkflows(): Promise<StoredWorkflowMeta[]> {
  const flowsDir = await getFlowsDirectory();
  if (!flowsDir) return [];

  const workflows: StoredWorkflowMeta[] = [];

  try {
    // Use entries() for better TypeScript compatibility
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const [name, entry] of (flowsDir as any).entries()) {
      if (entry.kind === "file" && name.endsWith(".json")) {
        try {
          const file = await entry.getFile();
          const content = await file.text();
          const workflow = JSON.parse(content) as WorkflowDefinition;

          workflows.push({
            id: workflow.id,
            name: workflow.name,
            filename: name,
            lastModified: file.lastModified,
          });
        } catch {
          // Skip invalid files
          console.warn(`Skipping invalid workflow file: ${name}`);
        }
      }
    }
  } catch (err) {
    console.error("Failed to list workflows:", err);
  }

  return workflows.sort((a, b) => b.lastModified - a.lastModified);
}

/**
 * Load a workflow by filename
 */
export async function loadWorkflow(
  filename: string,
): Promise<WorkflowDefinition | null> {
  const flowsDir = await getFlowsDirectory();
  if (!flowsDir) return null;

  try {
    const fileHandle = await flowsDir.getFileHandle(filename);
    const file = await fileHandle.getFile();
    const content = await file.text();
    return JSON.parse(content) as WorkflowDefinition;
  } catch (err) {
    console.error(`Failed to load workflow ${filename}:`, err);
    return null;
  }
}

/**
 * Save a workflow to the flows directory
 * Returns the filename used
 */
export async function saveWorkflow(
  workflow: WorkflowDefinition,
  existingFilename?: string,
): Promise<string | null> {
  const flowsDir = await getFlowsDirectory();
  if (!flowsDir) return null;

  // Use existing filename or generate from name
  const filename = existingFilename || `${toSafeFilename(workflow.name)}.json`;

  try {
    const fileHandle = await flowsDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(workflow, null, 2));
    await writable.close();
    return filename;
  } catch (err) {
    console.error(`Failed to save workflow ${filename}:`, err);
    return null;
  }
}

/**
 * Delete a workflow by filename
 */
export async function deleteWorkflow(filename: string): Promise<boolean> {
  const flowsDir = await getFlowsDirectory();
  if (!flowsDir) return false;

  try {
    await flowsDir.removeEntry(filename);
    return true;
  } catch (err) {
    console.error(`Failed to delete workflow ${filename}:`, err);
    return false;
  }
}

/**
 * Rename a workflow file
 */
export async function renameWorkflow(
  oldFilename: string,
  newName: string,
  workflow: WorkflowDefinition,
): Promise<string | null> {
  const flowsDir = await getFlowsDirectory();
  if (!flowsDir) return null;

  const newFilename = `${toSafeFilename(newName)}.json`;

  // If filename hasn't changed, just update content
  if (oldFilename === newFilename) {
    return saveWorkflow(workflow, oldFilename);
  }

  try {
    // Save to new filename
    const saved = await saveWorkflow(
      { ...workflow, name: newName },
      newFilename,
    );
    if (!saved) return null;

    // Delete old file
    try {
      await flowsDir.removeEntry(oldFilename);
    } catch {
      // Old file might not exist
    }

    return newFilename;
  } catch (err) {
    console.error(`Failed to rename workflow:`, err);
    return null;
  }
}

/**
 * Check if a workflow filename exists
 */
export async function workflowExists(filename: string): Promise<boolean> {
  const flowsDir = await getFlowsDirectory();
  if (!flowsDir) return false;

  try {
    await flowsDir.getFileHandle(filename);
    return true;
  } catch {
    return false;
  }
}
