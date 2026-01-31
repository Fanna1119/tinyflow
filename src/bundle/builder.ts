/**
 * TinyFlow Bundle Builder
 * Generates standalone JavaScript code with embedded workflow
 */

import { transform } from "esbuild";
import type { WorkflowDefinition, WorkflowNode } from "../schema/types";
import type { BundleOptions, BundleResult } from "./types";
import { registry } from "../registry";

/**
 * Strip ReactFlow-specific data (position) from nodes for smaller bundles
 */
function stripNodeMetadata(
  nodes: WorkflowNode[],
): Omit<WorkflowNode, "position">[] {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return nodes.map(({ position, ...rest }) => rest);
}

/**
 * Convert a function to its embeddable string representation
 * Normalizes the function format for bundle embedding
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
function functionToEmbeddableString(fn: Function): string {
  let fnStr = fn.toString();

  // Normalize async function syntax to arrow function style
  // "async function(params, context) { ... }" -> "async (params, context) => { ... }"
  if (fnStr.startsWith("async function")) {
    fnStr = fnStr.replace(/^async function\s*\(/, "async (");
    const paramEnd = fnStr.indexOf(")");
    if (paramEnd !== -1) {
      const beforeBody = fnStr.substring(0, paramEnd + 1);
      const body = fnStr.substring(paramEnd + 1).trimStart();
      fnStr = beforeBody + " => " + body;
    }
  }

  // Replace 'context' parameter name with shorter 'ctx' for smaller bundles
  // This matches what the embedded runtime expects
  fnStr = fnStr
    .replace(/\(params,\s*context\)/g, "(params, ctx)")
    .replace(/context\./g, "ctx.")
    .replace(/context\)/g, "ctx)")
    .replace(/context,/g, "ctx,");

  return fnStr;
}

/**
 * Get function implementation string from registry
 */
function getFunctionString(id: string): string | null {
  const fn = registry.getExecutable(id);
  if (!fn) return null;
  return functionToEmbeddableString(fn);
}

/**
 * Extract unique function IDs used in a workflow
 */
function getUsedFunctionIds(workflow: WorkflowDefinition): Set<string> {
  return new Set(workflow.nodes.map((node) => node.functionId));
}

/**
 * Generate the runtime code with only the functions used by the workflow
 */
function generateRuntimeCode(usedFunctions: Set<string>): string {
  // Build the functions object with only used functions from the actual registry
  const functionEntries = Array.from(usedFunctions)
    .map((id) => {
      const fnStr = getFunctionString(id);
      return fnStr ? `  '${id}': ${fnStr}` : null;
    })
    .filter(Boolean)
    .join(",\n");

  return `
// =============================================================================
// TinyFlow Minimal Runtime (Embedded)
// =============================================================================

class TinyFlowStore {
  constructor(initialData = {}, env = {}) {
    this.data = new Map(Object.entries(initialData));
    this.env = env;
    this.logs = [];
    this.nodeResults = new Map();
  }
  
  get(key) { return this.data.get(key); }
  set(key, value) { this.data.set(key, value); }
  has(key) { return this.data.has(key); }
  getEnv(key) { return this.env[key]; }
  toObject() {
    const result = {};
    this.data.forEach((v, k) => { result[k] = v; });
    return result;
  }
}

// Functions used by this workflow
const builtinFunctions = {
${functionEntries}
};

// Execute workflow
async function executeWorkflow(workflow, options = {}) {
  const startTime = Date.now();
  const logs = [];
  const { initialData = {}, env = {}, onLog, onNodeComplete, onError } = options;
  
  // Merge environment variables
  const mergedEnv = { ...workflow.flow.envs, ...env };
  const store = new TinyFlowStore(initialData, mergedEnv);
  
  // Build node map and edge map
  const nodeMap = new Map(workflow.nodes.map(n => [n.id, n]));
  const edgeMap = new Map();
  for (const edge of workflow.edges) {
    if (!edgeMap.has(edge.from)) edgeMap.set(edge.from, []);
    edgeMap.get(edge.from).push(edge);
  }
  
  // Execute from start node
  let currentNodeId = workflow.flow.startNodeId;
  let iteration = 0;
  const maxIterations = workflow.flow.maxIterations ?? 1000;
  
  while (currentNodeId && iteration < maxIterations) {
    iteration++;
    const node = nodeMap.get(currentNodeId);
    
    if (!node) {
      const error = { nodeId: currentNodeId, message: 'Node not found' };
      if (onError) onError(currentNodeId, error.message);
      return { success: false, data: store.toObject(), logs, error, duration: Date.now() - startTime };
    }
    
    // Get function
    const fn = builtinFunctions[node.functionId];
    if (!fn) {
      const error = { nodeId: currentNodeId, message: \`Function "\${node.functionId}" not found\` };
      if (onError) onError(currentNodeId, error.message);
      return { success: false, data: store.toObject(), logs, error, duration: Date.now() - startTime };
    }
    
    // Create execution context
    const nodeEnv = { ...mergedEnv, ...node.env };
    const ctx = {
      nodeId: currentNodeId,
      params: node.params,
      store: {
        data: store.data,
        get: (k) => store.get(k),
        set: (k, v) => store.set(k, v),
        has: (k) => store.has(k),
        getEnv: (k) => store.getEnv(k),
      },
      env: nodeEnv,
      log: (msg) => {
        const fullMsg = \`[\${currentNodeId}] \${msg}\`;
        logs.push(fullMsg);
        if (onLog) onLog(fullMsg);
      },
    };
    
    // Execute function
    let result;
    try {
      result = await fn(node.params, ctx);
    } catch (e) {
      const error = { nodeId: currentNodeId, message: e.message };
      if (onError) onError(currentNodeId, error.message);
      return { success: false, data: store.toObject(), logs, error, duration: Date.now() - startTime };
    }
    
    if (onNodeComplete) onNodeComplete(currentNodeId, result.success, result.output);
    
    if (!result.success) {
      const error = { nodeId: currentNodeId, message: result.error ?? 'Execution failed' };
      if (onError) onError(currentNodeId, error.message);
      return { success: false, data: store.toObject(), logs, error, duration: Date.now() - startTime };
    }
    
    // Find next node based on action
    const action = result.action ?? 'default';
    const edges = edgeMap.get(currentNodeId) ?? [];
    const nextEdge = edges.find(e => e.action === action) ?? edges.find(e => e.action === 'default');
    currentNodeId = nextEdge?.to;
  }
  
  return { success: true, data: store.toObject(), logs, duration: Date.now() - startTime };
}
`.trim();
}

/**
 * Generate ESM bundle code
 */
function generateESMBundle(
  workflow: WorkflowDefinition,
  defaultEnv: Record<string, string>,
  includeRuntime: boolean,
): string {
  // Strip position data from nodes for smaller bundles
  const strippedWorkflow = {
    ...workflow,
    nodes: stripNodeMetadata(workflow.nodes),
  };
  const workflowJson = JSON.stringify(strippedWorkflow, null, 2);
  const envJson = JSON.stringify(defaultEnv, null, 2);
  const usedFunctions = getUsedFunctionIds(workflow);

  if (includeRuntime) {
    return `${generateRuntimeCode(usedFunctions)}

// =============================================================================
// Embedded Workflow
// =============================================================================

const WORKFLOW = ${workflowJson};

const DEFAULT_ENV = ${envJson};

// Current environment state
let currentEnv = { ...DEFAULT_ENV };

/**
 * Run the embedded workflow
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Execution result
 */
export async function runFlow(options = {}) {
  const mergedOptions = {
    ...options,
    env: { ...currentEnv, ...options.env },
  };
  return executeWorkflow(WORKFLOW, mergedOptions);
}

/**
 * Set environment variable(s) for subsequent runs
 * @param {string|Object} key - Variable name or object of key-value pairs
 * @param {string} [value] - Variable value (when key is string)
 */
export function setEnv(key, value) {
  if (typeof key === 'object') {
    Object.assign(currentEnv, key);
  } else {
    currentEnv[key] = value;
  }
}

/**
 * Get current environment variables
 * @returns {Object} Current environment variables
 */
export function getEnv() {
  return { ...currentEnv };
}

/**
 * Get the embedded workflow definition (readonly)
 * @returns {Object} The workflow definition
 */
export function getWorkflow() {
  return JSON.parse(JSON.stringify(WORKFLOW));
}

export default { runFlow, setEnv, getEnv, getWorkflow };
`;
  } else {
    // External runtime import version
    return `import { runWorkflow } from 'tinyflow';

// =============================================================================
// Embedded Workflow
// =============================================================================

const WORKFLOW = ${workflowJson};

const DEFAULT_ENV = ${envJson};

// Current environment state
let currentEnv = { ...DEFAULT_ENV };

/**
 * Run the embedded workflow
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Execution result
 */
export async function runFlow(options = {}) {
  const result = await runWorkflow(WORKFLOW, {
    ...options,
    env: { ...currentEnv, ...options.env },
  });
  
  // Convert to bundle result format
  return {
    success: result.success,
    data: Object.fromEntries(result.store.data),
    logs: result.logs,
    error: result.error,
    duration: result.duration,
  };
}

/**
 * Set environment variable(s) for subsequent runs
 * @param {string|Object} key - Variable name or object of key-value pairs
 * @param {string} [value] - Variable value (when key is string)
 */
export function setEnv(key, value) {
  if (typeof key === 'object') {
    Object.assign(currentEnv, key);
  } else {
    currentEnv[key] = value;
  }
}

/**
 * Get current environment variables
 * @returns {Object} Current environment variables
 */
export function getEnv() {
  return { ...currentEnv };
}

/**
 * Get the embedded workflow definition (readonly)
 * @returns {Object} The workflow definition
 */
export function getWorkflow() {
  return JSON.parse(JSON.stringify(WORKFLOW));
}

export default { runFlow, setEnv, getEnv, getWorkflow };
`;
  }
}

/**
 * Generate CommonJS bundle code
 */
function generateCJSBundle(
  workflow: WorkflowDefinition,
  defaultEnv: Record<string, string>,
  includeRuntime: boolean,
): string {
  const esmCode = generateESMBundle(workflow, defaultEnv, includeRuntime);

  // Convert ESM exports to CJS
  let cjsCode = esmCode;

  // Replace ESM imports
  if (!includeRuntime) {
    cjsCode = cjsCode.replace(
      "import { runWorkflow } from 'tinyflow';",
      "const { runWorkflow } = require('tinyflow');",
    );
  }

  // Replace ESM exports
  cjsCode = cjsCode.replace(/^export async function/gm, "async function");
  cjsCode = cjsCode.replace(/^export function/gm, "function");
  cjsCode = cjsCode.replace(
    /export default \{ runFlow, setEnv, getEnv, getWorkflow \};/,
    `module.exports = { runFlow, setEnv, getEnv, getWorkflow };`,
  );

  return cjsCode;
}

/**
 * Generate IIFE bundle code
 */
function generateIIFEBundle(
  workflow: WorkflowDefinition,
  defaultEnv: Record<string, string>,
  globalName: string,
): string {
  // Strip position data from nodes for smaller bundles
  const strippedWorkflow = {
    ...workflow,
    nodes: stripNodeMetadata(workflow.nodes),
  };
  const workflowJson = JSON.stringify(strippedWorkflow, null, 2);
  const envJson = JSON.stringify(defaultEnv, null, 2);
  const usedFunctions = getUsedFunctionIds(workflow);

  return `(function(global) {
${generateRuntimeCode(usedFunctions)}

// =============================================================================
// Embedded Workflow
// =============================================================================

const WORKFLOW = ${workflowJson};

const DEFAULT_ENV = ${envJson};

// Current environment state
let currentEnv = { ...DEFAULT_ENV };

async function runFlow(options = {}) {
  const mergedOptions = {
    ...options,
    env: { ...currentEnv, ...options.env },
  };
  return executeWorkflow(WORKFLOW, mergedOptions);
}

function setEnv(key, value) {
  if (typeof key === 'object') {
    Object.assign(currentEnv, key);
  } else {
    currentEnv[key] = value;
  }
}

function getEnv() {
  return { ...currentEnv };
}

function getWorkflow() {
  return JSON.parse(JSON.stringify(WORKFLOW));
}

global.${globalName} = { runFlow, setEnv, getEnv, getWorkflow };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
`;
}

/**
 * Build a standalone JavaScript bundle from a workflow
 */
export async function buildBundle(
  options: BundleOptions,
): Promise<BundleResult> {
  const {
    workflow,
    defaultEnv = {},
    includeRuntime = true,
    minify = false,
    format = "esm",
    globalName = "TinyFlow",
  } = options;

  try {
    let code: string;

    switch (format) {
      case "esm":
        code = generateESMBundle(workflow, defaultEnv, includeRuntime);
        break;
      case "cjs":
        code = generateCJSBundle(workflow, defaultEnv, includeRuntime);
        break;
      case "iife":
        code = generateIIFEBundle(workflow, defaultEnv, globalName);
        break;
      default:
        return { success: false, error: `Unknown format: ${format}` };
    }

    // Use esbuild for minification
    if (minify) {
      const result = await transform(code, {
        minify: true,
        format: format === "cjs" ? "cjs" : "esm",
        target: "es2020",
      });
      code = result.code;
    }

    return { success: true, code };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

/**
 * Build bundle from JSON string
 */
export async function buildBundleFromJson(
  json: string,
  options: Omit<BundleOptions, "workflow"> = {},
): Promise<BundleResult> {
  try {
    const workflow = JSON.parse(json) as WorkflowDefinition;
    return buildBundle({ ...options, workflow });
  } catch (e) {
    return {
      success: false,
      error: `Invalid JSON: ${e instanceof Error ? e.message : "Unknown error"}`,
    };
  }
}
