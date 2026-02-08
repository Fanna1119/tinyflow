/**
 * TinyFlow Bundle Builder
 * Generates standalone JavaScript code with embedded workflow
 * Note: Bundles are designed to run server-side only (Node.js/Bun)
 */

import type { WorkflowDefinition, WorkflowNode } from "../schema/types";
import type { BundleOptions, BundleResult, WorkflowBundleEntry } from "./types";
import { registry } from "../registry";

/**
 * Minify code using esbuild
 * This runs server-side only - bundles never execute in browsers
 */
async function minifyCode(
  code: string,
  format: "esm" | "cjs",
): Promise<string> {
  try {
    const esbuild = await import("esbuild");
    const result = await esbuild.transform(code, {
      minify: true,
      format: format,
      target: "es2020",
    });
    return result.code;
  } catch {
    // esbuild not available
    console.warn("esbuild not available, skipping minification");
    return code;
  }
}

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
 * Parse a dependency specifier like "openai@^4.0.0" into name + version range.
 */
export function parseDependencySpec(spec: string): {
  name: string;
  version: string;
} {
  // Handle scoped packages: @scope/pkg@^1.0.0
  const idx = spec.lastIndexOf("@");
  if (idx > 0) {
    return { name: spec.slice(0, idx), version: spec.slice(idx + 1) };
  }
  return { name: spec, version: "latest" };
}

/**
 * Collect runtime dependencies from all functions used in a workflow.
 * Returns a de-duplicated map of { packageName: versionRange }.
 */
export function collectRuntimeDependencies(
  usedFunctionIds: Set<string>,
): Record<string, string> {
  const deps: Record<string, string> = {};

  for (const id of usedFunctionIds) {
    const fn = registry.get(id);
    if (!fn?.metadata.runtimeDependencies) continue;

    for (const spec of fn.metadata.runtimeDependencies) {
      const { name, version } = parseDependencySpec(spec);
      // If already listed, keep the more specific (non-"latest") version
      if (!deps[name] || deps[name] === "latest") {
        deps[name] = version;
      }
    }
  }

  return deps;
}

/**
 * Generate a package.json string for the bundle output.
 * Only emitted when the workflow uses functions with runtimeDependencies.
 */
function generateBundlePackageJson(
  workflowName: string,
  dependencies: Record<string, string>,
): string {
  const pkg = {
    name: `tinyflow-bundle-${workflowName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    version: "1.0.0",
    private: true,
    description: `TinyFlow bundle – ${workflowName}`,
    dependencies,
  };
  return JSON.stringify(pkg, null, 2) + "\n";
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

// =============================================================================
// Multi-Workflow Bundle Generation
// =============================================================================

/**
 * Generate ESM bundle for multiple workflows
 * Each workflow gets its own named export
 */
function generateMultiWorkflowESMBundle(
  entries: WorkflowBundleEntry[],
  defaultEnv: Record<string, string>,
): string {
  // Collect all used functions across all workflows
  const allUsedFunctions = new Set<string>();
  for (const entry of entries) {
    for (const fnId of getUsedFunctionIds(entry.workflow)) {
      allUsedFunctions.add(fnId);
    }
  }

  // Generate workflow modules
  const workflowModules = entries
    .map((entry) => {
      const strippedWorkflow = {
        ...entry.workflow,
        nodes: stripNodeMetadata(entry.workflow.nodes),
      };
      const workflowJson = JSON.stringify(strippedWorkflow, null, 2);
      const exportName = entry.exportName;

      return `
// =============================================================================
// Workflow: ${entry.workflow.name} (${exportName})
// =============================================================================

const ${exportName}_WORKFLOW = ${workflowJson};
let ${exportName}_env = { ...DEFAULT_ENV };

export const ${exportName} = {
  async runFlow(options = {}) {
    const mergedOptions = {
      ...options,
      env: { ...${exportName}_env, ...options.env },
    };
    return executeWorkflow(${exportName}_WORKFLOW, mergedOptions);
  },
  setEnv(key, value) {
    if (typeof key === 'object') {
      Object.assign(${exportName}_env, key);
    } else {
      ${exportName}_env[key] = value;
    }
  },
  getEnv() {
    return { ...${exportName}_env };
  },
  getWorkflow() {
    return JSON.parse(JSON.stringify(${exportName}_WORKFLOW));
  },
  name: '${entry.workflow.name}',
  id: '${entry.workflow.id}',
};
`;
    })
    .join("\n");

  // Generate exports list
  const exportNames = entries.map((e) => e.exportName);
  const exportsObject = `{ ${exportNames.join(", ")} }`;

  return `${generateRuntimeCode(allUsedFunctions)}

const DEFAULT_ENV = ${JSON.stringify(defaultEnv, null, 2)};

${workflowModules}

// All workflows
export const workflows = ${exportsObject};
export default workflows;
`;
}

/**
 * Generate multi-workflow server with one endpoint per workflow
 */
function generateMultiWorkflowServer(
  entries: WorkflowBundleEntry[],
  bundleFilename: string,
  serverPort: number,
  format: "esm" | "cjs",
): string {
  const importStatement =
    format === "esm"
      ? `import { ${entries.map((e) => e.exportName).join(", ")} } from './${bundleFilename}';`
      : `const { ${entries.map((e) => e.exportName).join(", ")} } = require('./${bundleFilename}');`;

  // Build routing map
  const routeHandlers = entries
    .map((entry) => {
      const path =
        entry.endpointPath ||
        `/api/${entry.exportName.toLowerCase().replace(/_/g, "-")}`;
      const methods = entry.methods || ["POST"];
      const methodCheck = methods
        .map((m) => `req.method === '${m}'`)
        .join(" || ");

      return `    // ${entry.workflow.name}
    if (url.pathname === '${path}' && (${methodCheck})) {
      try {
        const payload = req.method === 'GET' ? {} : await req.json().catch(() => ({}));
        const result = await ${entry.exportName}.runFlow({
          initialData: payload.initialData ?? payload,
          env: payload.env,
        });
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      } catch (e) {
        return new Response(
          JSON.stringify({ error: e?.message ?? String(e) }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }`;
    })
    .join("\n\n");

  // Build endpoint documentation
  const endpointDocs = entries
    .map((entry) => {
      const path =
        entry.endpointPath ||
        `/api/${entry.exportName.toLowerCase().replace(/_/g, "-")}`;
      const methods = entry.methods || ["POST"];
      return `//   ${methods.join("|")} ${path} -> ${entry.workflow.name}`;
    })
    .join("\n");

  return `${importStatement}

// =============================================================================
// TinyFlow Multi-Workflow Server
// Endpoints:
${endpointDocs}
// =============================================================================

Bun.serve({
  port: Number(process.env.PORT || ${serverPort}),
  async fetch(req) {
    const url = new URL(req.url);
    
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', workflows: ${entries.length} }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // List available endpoints
    if (url.pathname === '/' || url.pathname === '/api') {
      const endpoints = ${JSON.stringify(
        entries.map((e) => ({
          name: e.workflow.name,
          exportName: e.exportName,
          path:
            e.endpointPath ||
            `/api/${e.exportName.toLowerCase().replace(/_/g, "-")}`,
          methods: e.methods || ["POST"],
        })),
        null,
        2,
      )};
      return new Response(JSON.stringify({ endpoints }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

${routeHandlers}

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },
});

console.log(\`TinyFlow server listening on port \${process.env.PORT || ${serverPort}}\`);
console.log('Available endpoints:');
${entries
  .map((e) => {
    const path =
      e.endpointPath || `/api/${e.exportName.toLowerCase().replace(/_/g, "-")}`;
    return `console.log('  ${path} -> ${e.workflow.name}');`;
  })
  .join("\n")}
`;
}

/**
 * Build a standalone JavaScript bundle from a workflow
 * Note: Bundles are server-side only (Node.js/Bun)
 */
export async function buildBundle(
  options: BundleOptions,
): Promise<BundleResult> {
  const {
    workflow,
    workflows,
    defaultEnv = {},
    includeRuntime = true,
    minify = false,
    format = "esm",
    includeServer = false,
    serverPort = 3000,
    emitDocker = false,
    emitCompose = false,
    bundleFilename,
  } = options;

  // Validate we have either single workflow or multiple
  if (!workflow && (!workflows || workflows.length === 0)) {
    return { success: false, error: "No workflow(s) provided" };
  }

  // Multi-workflow mode
  if (workflows && workflows.length > 0) {
    return buildMultiWorkflowBundle({
      workflows,
      defaultEnv,
      minify,
      format,
      includeServer,
      serverPort,
      emitDocker,
      emitCompose,
      bundleFilename,
    });
  }

  // Single workflow mode (original behavior)
  if (!workflow) {
    return { success: false, error: "No workflow provided" };
  }

  try {
    let code: string;

    switch (format) {
      case "esm":
        code = generateESMBundle(workflow, defaultEnv, includeRuntime);
        break;
      case "cjs":
        code = generateCJSBundle(workflow, defaultEnv, includeRuntime);
        break;
      default:
        return { success: false, error: `Unknown format: ${format}` };
    }

    // Use esbuild for minification (if available)
    if (minify) {
      code = await minifyCode(code, format === "cjs" ? "cjs" : "esm");
    }

    // Build files map
    const files: Record<string, string> = {};

    // Determine bundle filename based on format
    const defaultBundleFilename = format === "esm" ? "bundle.mjs" : "bundle.js";
    const finalBundleFilename = bundleFilename ?? defaultBundleFilename;

    files[finalBundleFilename] = code;

    // Generate server.js using Bun.serve
    if (includeServer) {
      const serverCode =
        format === "esm"
          ? `import bundle from './${finalBundleFilename}';

Bun.serve({
  port: Number(process.env.PORT || ${serverPort}),
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname === '/run') {
      try {
        const payload = await req.json();
        const result = await bundle.runFlow({
          initialData: payload.initialData,
          env: payload.env,
        });
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(
          JSON.stringify({ error: e?.message ?? String(e) }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
    return new Response('Not found', { status: 404 });
  },
});

console.log(\`TinyFlow server listening on port \${process.env.PORT || ${serverPort}}\`);
`
          : `const bundle = require('./${finalBundleFilename}');

Bun.serve({
  port: Number(process.env.PORT || ${serverPort}),
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname === '/run') {
      try {
        const payload = await req.json();
        const result = await bundle.runFlow({
          initialData: payload.initialData,
          env: payload.env,
        });
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(
          JSON.stringify({ error: e?.message ?? String(e) }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
    return new Response('Not found', { status: 404 });
  },
});

console.log(\`TinyFlow server listening on port \${process.env.PORT || ${serverPort}}\`);
`;

      files["server.js"] = serverCode;
    }

    // Generate Dockerfile for Bun
    if (emitDocker) {
      const dockerfile = `FROM oven/bun:latest
WORKDIR /app
COPY . /app
RUN if [ -f package.json ]; then bun install --production; fi
ENV NODE_ENV=production
EXPOSE ${serverPort}
CMD ["bun", "server.js"]
`;
      files["Dockerfile"] = dockerfile;
    }

    // Generate docker-compose.yml
    if (emitCompose) {
      const compose = `version: "3.8"
services:
  tinyflow:
    build: .
    ports:
      - "${serverPort}:${serverPort}"
    restart: unless-stopped
`;
      files["docker-compose.yml"] = compose;
    }

    // Collect runtime dependencies from used functions and emit package.json
    const usedFunctions = getUsedFunctionIds(workflow);
    const runtimeDeps = collectRuntimeDependencies(usedFunctions);
    if (Object.keys(runtimeDeps).length > 0) {
      files["package.json"] = generateBundlePackageJson(
        workflow.name,
        runtimeDeps,
      );
    }

    return { success: true, code, files };
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

/**
 * Build a multi-workflow bundle
 */
export async function buildMultiWorkflowBundle(
  options: Omit<BundleOptions, "workflow" | "includeRuntime" | "globalName"> & {
    workflows: WorkflowBundleEntry[];
  },
): Promise<BundleResult> {
  const {
    workflows,
    defaultEnv = {},
    minify = false,
    format = "esm",
    includeServer = false,
    serverPort = 3000,
    emitDocker = false,
    emitCompose = false,
    bundleFilename,
  } = options;

  if (workflows.length === 0) {
    return { success: false, error: "No workflows provided" };
  }

  // Only ESM format supported for multi-workflow bundles currently
  if (format !== "esm" && format !== "cjs") {
    return {
      success: false,
      error: "Multi-workflow bundles only support ESM and CJS formats",
    };
  }

  try {
    let code = generateMultiWorkflowESMBundle(workflows, defaultEnv);

    // Convert to CJS if needed
    if (format === "cjs") {
      code = code
        .replace(/^export const (\w+) = \{/gm, "const $1 = {")
        .replace(/^export const workflows/m, "const workflows")
        .replace(
          /^export default workflows;/m,
          "module.exports = { workflows, " +
            workflows.map((w) => w.exportName).join(", ") +
            " };",
        );
    }

    // Minify if requested (if esbuild available)
    if (minify) {
      code = await minifyCode(code, format === "cjs" ? "cjs" : "esm");
    }

    // Build files map
    const files: Record<string, string> = {};

    const defaultBundleFilename = format === "esm" ? "bundle.mjs" : "bundle.js";
    const finalBundleFilename = bundleFilename ?? defaultBundleFilename;

    files[finalBundleFilename] = code;

    // Generate multi-workflow server
    if (includeServer) {
      const serverCode = generateMultiWorkflowServer(
        workflows,
        finalBundleFilename,
        serverPort,
        format,
      );
      files["server.js"] = serverCode;
    }

    // Generate Dockerfile
    if (emitDocker) {
      const dockerfile = `FROM oven/bun:latest
WORKDIR /app
COPY . /app
RUN if [ -f package.json ]; then bun install --production; fi
ENV NODE_ENV=production
EXPOSE ${serverPort}
CMD ["bun", "server.js"]
`;
      files["Dockerfile"] = dockerfile;
    }

    // Generate docker-compose.yml
    if (emitCompose) {
      const compose = `version: "3.8"
services:
  tinyflow:
    build: .
    ports:
      - "${serverPort}:${serverPort}"
    environment:
      - PORT=${serverPort}
    restart: unless-stopped
`;
      files["docker-compose.yml"] = compose;
    }

    // Collect runtime dependencies from all workflows and emit package.json
    const allUsedFunctions = new Set<string>();
    for (const entry of workflows) {
      for (const fnId of getUsedFunctionIds(entry.workflow)) {
        allUsedFunctions.add(fnId);
      }
    }
    const runtimeDeps = collectRuntimeDependencies(allUsedFunctions);
    if (Object.keys(runtimeDeps).length > 0) {
      const combinedName = workflows.map((w) => w.workflow.name).join("-");
      files["package.json"] = generateBundlePackageJson(
        combinedName,
        runtimeDeps,
      );
    }

    // Generate README for the bundle
    const readme = generateBundleReadme(
      workflows,
      finalBundleFilename,
      includeServer,
      serverPort,
    );
    files["README.md"] = readme;

    return { success: true, code, files };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

/**
 * Generate README documentation for the bundle
 */
function generateBundleReadme(
  workflows: WorkflowBundleEntry[],
  bundleFilename: string,
  includeServer: boolean,
  serverPort: number,
): string {
  const exportNames = workflows.map((w) => w.exportName);

  let readme = `# TinyFlow Bundle

This bundle contains ${workflows.length} workflow(s):

${workflows.map((w) => `- **${w.workflow.name}** (\`${w.exportName}\`)`).join("\n")}

## Usage

### As ES Module

\`\`\`javascript
import { ${exportNames.join(", ")} } from './${bundleFilename}';

// Run a specific workflow
const result = await ${exportNames[0]}.runFlow({
  initialData: { /* your input data */ },
  env: { /* optional env overrides */ },
});

console.log(result.success, result.data);
\`\`\`

### Individual Workflow API

Each workflow export has these methods:

- \`runFlow(options)\` - Execute the workflow
- \`setEnv(key, value)\` - Set environment variable
- \`getEnv()\` - Get current environment
- \`getWorkflow()\` - Get workflow definition
`;

  if (includeServer) {
    readme += `
## HTTP Server

Start the server:

\`\`\`bash
bun server.js
# or
PORT=${serverPort} bun server.js
\`\`\`

### Endpoints

| Endpoint | Method | Workflow |
|----------|--------|----------|
${workflows
  .map((w) => {
    const path =
      w.endpointPath || `/api/${w.exportName.toLowerCase().replace(/_/g, "-")}`;
    const methods = (w.methods || ["POST"]).join(", ");
    return `| \`${path}\` | ${methods} | ${w.workflow.name} |`;
  })
  .join("\n")}

### Example Request

\`\`\`bash
curl -X POST http://localhost:${serverPort}${workflows[0].endpointPath || `/api/${workflows[0].exportName.toLowerCase().replace(/_/g, "-")}`} \\
  -H "Content-Type: application/json" \\
  -d '{"initialData": {}}'
\`\`\`
`;
  }

  return readme;
}
