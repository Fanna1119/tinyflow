/**
 * Settings Modal Component
 * Displays environment variables (read-only) and manages user settings
 */

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Settings,
  Key,
  Monitor,
  Play,
  Eye,
  EyeOff,
  FolderOpen,
  Save,
  RefreshCw,
  Check,
  AlertCircle,
} from "lucide-react";
import {
  type TinyFlowSettings,
  type EnvVariable,
  DEFAULT_SETTINGS,
  getEnvironmentVariables,
  loadSettings,
  saveSettings,
  hasSettingsAccess,
  requestSettingsAccess,
  initSettingsAccess,
} from "../../utils/settings";

// ============================================================================
// Types
// ============================================================================

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange?: (settings: TinyFlowSettings) => void;
}

type TabType = "environment" | "editor" | "runtime";

// ============================================================================
// Tab Components
// ============================================================================

function EnvironmentTab() {
  const [envVars, setEnvVars] = useState<EnvVariable[]>([]);
  const [showValues, setShowValues] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getEnvironmentVariables().then((vars) => {
      setEnvVars(vars);
      setLoading(false);
    });
  }, []);

  const toggleVisibility = (key: string) => {
    setShowValues((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const filteredVars = envVars.filter(
    (v) =>
      v.key.toLowerCase().includes(filter.toLowerCase()) ||
      v.prefix.toLowerCase().includes(filter.toLowerCase()),
  );

  const groupedVars = filteredVars.reduce(
    (acc, v) => {
      if (!acc[v.prefix]) acc[v.prefix] = [];
      acc[v.prefix].push(v);
      return acc;
    },
    {} as Record<string, EnvVariable[]>,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Environment variables loaded from{" "}
          <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-xs">
            .env
          </code>{" "}
          file (read-only)
        </p>
      </div>

      <input
        type="text"
        placeholder="Filter variables..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {loading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
          <p>Loading environment variables...</p>
        </div>
      ) : filteredVars.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <Key className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No environment variables found</p>
          <p className="text-xs mt-1">
            Add variables with OPENAI_ or VITE_ prefix to your .env file
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedVars).map(([prefix, vars]) => (
            <div key={prefix}>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                {prefix.replace("_", "")} Variables
              </h4>
              <div className="space-y-1">
                {vars.map((v) => (
                  <div
                    key={v.key}
                    className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <code className="text-sm font-mono text-gray-900 dark:text-gray-100">
                        {v.key}
                      </code>
                      <div className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">
                        {showValues.has(v.key) ? v.value : v.masked}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleVisibility(v.key)}
                      className="ml-2 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
                      title={
                        showValues.has(v.key) ? "Hide value" : "Show value"
                      }
                    >
                      {showValues.has(v.key) ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface EditorTabProps {
  settings: TinyFlowSettings["editor"];
  onUpdate: (settings: TinyFlowSettings["editor"]) => void;
}

function EditorTab({ settings, onUpdate }: EditorTabProps) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Theme
        </label>
        <select
          value={settings.theme}
          onChange={(e) =>
            onUpdate({
              ...settings,
              theme: e.target.value as "light" | "dark" | "system",
            })
          }
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>

      <div className="space-y-3">
        <ToggleSetting
          label="Auto-validate on change"
          description="Automatically validate workflow when nodes or connections change"
          checked={settings.autoValidate}
          onChange={(checked) =>
            onUpdate({ ...settings, autoValidate: checked })
          }
        />

        <ToggleSetting
          label="Show minimap"
          description="Display minimap overview in the corner"
          checked={settings.showMinimap}
          onChange={(checked) =>
            onUpdate({ ...settings, showMinimap: checked })
          }
        />

        <ToggleSetting
          label="Snap to grid"
          description="Snap nodes to grid when dragging"
          checked={settings.snapToGrid}
          onChange={(checked) => onUpdate({ ...settings, snapToGrid: checked })}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Grid size: {settings.gridSize}px
        </label>
        <input
          type="range"
          min="10"
          max="50"
          step="5"
          value={settings.gridSize}
          onChange={(e) =>
            onUpdate({ ...settings, gridSize: parseInt(e.target.value) })
          }
          className="w-full"
        />
      </div>
    </div>
  );
}

interface RuntimeTabProps {
  settings: TinyFlowSettings["runtime"];
  onUpdate: (settings: TinyFlowSettings["runtime"]) => void;
}

function RuntimeTab({ settings, onUpdate }: RuntimeTabProps) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Default Retry Policy
        </label>
        <select
          value={settings.defaultRetryPolicy}
          onChange={(e) =>
            onUpdate({
              ...settings,
              defaultRetryPolicy: e.target
                .value as TinyFlowSettings["runtime"]["defaultRetryPolicy"],
            })
          }
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="none">None (no retries)</option>
          <option value="fast">Fast (3 retries, short delays)</option>
          <option value="standard">
            Standard (3 retries, moderate delays)
          </option>
          <option value="aggressive">
            Aggressive (5 retries, longer delays)
          </option>
          <option value="patient">Patient (10 retries, long delays)</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Default Timeout: {(settings.defaultTimeout / 1000).toFixed(0)}s
        </label>
        <input
          type="range"
          min="5000"
          max="120000"
          step="5000"
          value={settings.defaultTimeout}
          onChange={(e) =>
            onUpdate({ ...settings, defaultTimeout: parseInt(e.target.value) })
          }
          className="w-full"
        />
      </div>

      <div className="space-y-3">
        <ToggleSetting
          label="Debug mode"
          description="Enable verbose logging during execution"
          checked={settings.debugMode}
          onChange={(checked) => onUpdate({ ...settings, debugMode: checked })}
        />

        <ToggleSetting
          label="Step-through by default"
          description="Start execution in step-through mode"
          checked={settings.stepThroughDefault}
          onChange={(checked) =>
            onUpdate({ ...settings, stepThroughDefault: checked })
          }
        />
      </div>
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

interface ToggleSettingProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleSetting({
  label,
  description,
  checked,
  onChange,
}: ToggleSettingProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {label}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {description}
        </div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-700"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function SettingsModal({
  isOpen,
  onClose,
  onSettingsChange,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("environment");
  const [settings, setSettings] = useState<TinyFlowSettings>(DEFAULT_SETTINGS);
  const [hasAccess, setHasAccess] = useState(hasSettingsAccess());
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [isDirty, setIsDirty] = useState(false);

  // Try to restore access from IndexedDB on mount
  useEffect(() => {
    if (!hasAccess && isOpen) {
      initSettingsAccess().then((restored) => {
        if (restored) {
          setHasAccess(true);
          loadSettings().then((loaded) => {
            setSettings(loaded);
            onSettingsChange?.(loaded);
          });
        }
      });
    }
  }, [isOpen]);

  // Load settings when access changes
  useEffect(() => {
    if (hasAccess && isOpen) {
      loadSettings().then(setSettings);
    }
  }, [hasAccess, isOpen]);

  // Request access to settings directory
  const handleRequestAccess = useCallback(async () => {
    const granted = await requestSettingsAccess();
    setHasAccess(granted);
    if (granted) {
      // Load settings, creating file with defaults if it doesn't exist
      const loaded = await loadSettings(true);
      setSettings(loaded);
    }
  }, []);

  // Save settings
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveStatus("idle");

    const success = await saveSettings(settings);

    setIsSaving(false);
    setSaveStatus(success ? "success" : "error");
    setIsDirty(false);

    if (success) {
      onSettingsChange?.(settings);
      setTimeout(() => setSaveStatus("idle"), 2000);
    }
  }, [settings, onSettingsChange]);

  // Update settings helper
  const updateSettings = useCallback((updates: Partial<TinyFlowSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
    setIsDirty(true);
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    {
      id: "environment",
      label: "Environment",
      icon: <Key className="w-4 h-4" />,
    },
    { id: "editor", label: "Editor", icon: <Monitor className="w-4 h-4" /> },
    { id: "runtime", label: "Runtime", icon: <Play className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[80vh] bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Settings
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {hasAccess && activeTab !== "environment" && (
              <button
                onClick={handleSave}
                disabled={isSaving || !isDirty}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  isDirty
                    ? "text-white bg-blue-600 hover:bg-blue-700"
                    : "text-gray-400 bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                }`}
              >
                {isSaving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : saveStatus === "success" ? (
                  <Check className="w-4 h-4" />
                ) : saveStatus === "error" ? (
                  <AlertCircle className="w-4 h-4" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {isSaving
                  ? "Saving..."
                  : saveStatus === "success"
                    ? "Saved"
                    : "Save"}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!hasAccess && activeTab !== "environment" ? (
            <div className="text-center py-12">
              <FolderOpen className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Grant Folder Access
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
                To save settings, please select your project folder. Settings
                will be stored in{" "}
                <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-xs">
                  .tinyflow/settings.json
                </code>
              </p>
              <button
                onClick={handleRequestAccess}
                className="flex items-center gap-2 px-4 py-2 mx-auto text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                Select Project Folder
              </button>
            </div>
          ) : (
            <>
              {activeTab === "environment" && <EnvironmentTab />}
              {activeTab === "editor" && (
                <EditorTab
                  settings={settings.editor}
                  onUpdate={(editor) => updateSettings({ editor })}
                />
              )}
              {activeTab === "runtime" && (
                <RuntimeTab
                  settings={settings.runtime}
                  onUpdate={(runtime) => updateSettings({ runtime })}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
