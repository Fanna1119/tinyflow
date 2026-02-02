/**
 * Settings Utilities
 * Manages reading/writing settings from .tinyflow/settings.json
 * Environment variables are read-only from import.meta.env
 */

// ============================================================================
// Types
// ============================================================================

export interface EditorSettings {
  /** Theme preference */
  theme: "light" | "dark" | "system";
  /** Auto-validate on change */
  autoValidate: boolean;
  /** Show minimap */
  showMinimap: boolean;
  /** Snap to grid */
  snapToGrid: boolean;
  /** Grid size */
  gridSize: number;
}

export interface RuntimeSettings {
  /** Default retry policy */
  defaultRetryPolicy: "none" | "fast" | "standard" | "aggressive" | "patient";
  /** Debug mode */
  debugMode: boolean;
  /** Step-through execution by default */
  stepThroughDefault: boolean;
  /** Default timeout in ms */
  defaultTimeout: number;
}

export interface CredentialReference {
  /** Credential ID */
  id: string;
  /** Credential name */
  name: string;
  /** Credential type */
  type: string;
}

export interface TinyFlowSettings {
  /** Editor preferences */
  editor: EditorSettings;
  /** Runtime preferences */
  runtime: RuntimeSettings;
  /** Credential references (IDs only, not secrets) */
  credentials: CredentialReference[];
  /** Settings file version */
  version: number;
}

// ============================================================================
// Defaults
// ============================================================================

export const DEFAULT_SETTINGS: TinyFlowSettings = {
  editor: {
    theme: "system",
    autoValidate: true,
    showMinimap: true,
    snapToGrid: true,
    gridSize: 20,
  },
  runtime: {
    defaultRetryPolicy: "standard",
    debugMode: false,
    stepThroughDefault: false,
    defaultTimeout: 30000,
  },
  credentials: [],
  version: 1,
};

// ============================================================================
// Environment Variables (Read-Only)
// ============================================================================

export interface EnvVariable {
  key: string;
  value: string;
  prefix: "OPENAI_" | "VITE_" | "OTHER";
  masked: string;
}

/**
 * Mask sensitive values for display
 */
function maskValue(value: string): string {
  if (value.length <= 8) {
    return "•".repeat(value.length);
  }
  return (
    value.slice(0, 4) +
    "•".repeat(Math.min(value.length - 4, 20)) +
    value.slice(-4)
  );
}

/**
 * Get environment variables from the server
 * Server has access to all .env vars, not just VITE_ prefixed ones
 */
export async function getEnvironmentVariables(): Promise<EnvVariable[]> {
  try {
    const response = await fetch("/api/env-vars");
    if (!response.ok) {
      console.error("Failed to fetch env vars:", response.statusText);
      return [];
    }
    const data = (await response.json()) as {
      vars: Array<{ key: string; masked: string }>;
    };
    return data.vars.map((v) => ({
      key: v.key,
      value: "", // Server doesn't expose actual values
      prefix: v.key.startsWith("OPENAI_")
        ? "OPENAI_"
        : v.key.startsWith("VITE_")
          ? "VITE_"
          : ("OTHER" as const),
      masked: v.masked,
    }));
  } catch (error) {
    console.error("Error fetching env vars:", error);
    return [];
  }
}

// ============================================================================
// Settings File Operations (using File System Access API)
// ============================================================================

const SETTINGS_FILENAME = "settings.json";
const SETTINGS_DIRNAME = ".tinyflow";
const IDB_NAME = "tinyflow-settings";
const IDB_STORE = "handles";
const IDB_KEY = "projectDirectory";

// Store directory handle for persistence within session
let directoryHandle: FileSystemDirectoryHandle | null = null;

/**
 * Open IndexedDB for storing directory handle
 */
function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(IDB_STORE);
    };
  });
}

/**
 * Store directory handle in IndexedDB for persistence across page loads
 */
async function persistDirectoryHandle(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn("Failed to persist directory handle:", err);
  }
}

/**
 * Restore directory handle from IndexedDB
 */
async function restoreDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readonly");
    const request = tx.objectStore(IDB_STORE).get(IDB_KEY);

    return new Promise((resolve) => {
      request.onsuccess = async () => {
        db.close();
        const handle = request.result as FileSystemDirectoryHandle | undefined;
        if (!handle) {
          resolve(null);
          return;
        }

        // Verify we still have permission (using any cast for experimental API)
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const handleAny = handle as any;
          const permission = await handleAny.queryPermission({
            mode: "readwrite",
          });
          if (permission === "granted") {
            resolve(handle);
          } else {
            // Try to request permission
            const newPermission = await handleAny.requestPermission({
              mode: "readwrite",
            });
            resolve(newPermission === "granted" ? handle : null);
          }
        } catch {
          resolve(null);
        }
      };
      request.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch (err) {
    console.warn("Failed to restore directory handle:", err);
    return null;
  }
}

/**
 * Clear stored directory handle from IndexedDB
 */
async function clearPersistedHandle(): Promise<void> {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(IDB_KEY);
    await new Promise((resolve) => {
      tx.oncomplete = resolve;
    });
    db.close();
  } catch (err) {
    console.warn("Failed to clear persisted handle:", err);
  }
}

/**
 * Initialize settings access - tries to restore from IndexedDB first
 * Returns true if access was restored
 */
export async function initSettingsAccess(): Promise<boolean> {
  if (directoryHandle) return true;

  const restored = await restoreDirectoryHandle();
  if (restored) {
    directoryHandle = restored;
    return true;
  }
  return false;
}

/**
 * Request access to the .tinyflow directory
 * Returns true if access was granted
 */
export async function requestSettingsAccess(): Promise<boolean> {
  if (!("showDirectoryPicker" in window)) {
    console.warn("File System Access API not supported");
    return false;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    directoryHandle = await (window as any).showDirectoryPicker({
      id: "tinyflow-settings",
      mode: "readwrite",
      startIn: "documents",
    });

    // Persist for future sessions
    if (directoryHandle) {
      await persistDirectoryHandle(directoryHandle);
    }
    return true;
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      console.error("Failed to get directory access:", err);
    }
    return false;
  }
}

/**
 * Check if we have settings directory access
 */
export function hasSettingsAccess(): boolean {
  return directoryHandle !== null;
}

/**
 * Get or create the .tinyflow directory handle
 */
async function getSettingsDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!directoryHandle) return null;

  try {
    // Try to get or create .tinyflow subdirectory
    return await directoryHandle.getDirectoryHandle(SETTINGS_DIRNAME, {
      create: true,
    });
  } catch (err) {
    console.error("Failed to access .tinyflow directory:", err);
    return null;
  }
}

/**
 * Load settings from .tinyflow/settings.json
 * Returns default settings if file doesn't exist or on error
 * Optionally creates the file with defaults if it doesn't exist
 */
export async function loadSettings(
  createIfMissing = false,
): Promise<TinyFlowSettings> {
  const settingsDir = await getSettingsDirectory();
  if (!settingsDir) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const fileHandle = await settingsDir.getFileHandle(SETTINGS_FILENAME);
    const file = await fileHandle.getFile();
    const content = await file.text();
    const parsed = JSON.parse(content);

    // Merge with defaults to ensure all fields exist
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      editor: { ...DEFAULT_SETTINGS.editor, ...parsed.editor },
      runtime: { ...DEFAULT_SETTINGS.runtime, ...parsed.runtime },
    };
  } catch (err) {
    // File doesn't exist or is invalid
    if ((err as Error).name === "NotFoundError" && createIfMissing) {
      // Create with defaults
      const created = await saveSettings(DEFAULT_SETTINGS);
      if (created) {
        console.log("Created .tinyflow/settings.json with defaults");
      }
    } else if ((err as Error).name !== "NotFoundError") {
      console.warn("Failed to load settings:", err);
    }
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save settings to .tinyflow/settings.json
 */
export async function saveSettings(
  settings: TinyFlowSettings,
): Promise<boolean> {
  const settingsDir = await getSettingsDirectory();
  if (!settingsDir) {
    console.error("No settings directory access");
    return false;
  }

  try {
    const fileHandle = await settingsDir.getFileHandle(SETTINGS_FILENAME, {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(settings, null, 2));
    await writable.close();
    return true;
  } catch (err) {
    console.error("Failed to save settings:", err);
    return false;
  }
}

/**
 * Reset directory handle (for testing or clearing access)
 */
export function clearSettingsAccess(): void {
  directoryHandle = null;
  clearPersistedHandle();
}
