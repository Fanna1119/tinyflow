# TinyFlow

(WIP, npm package coming soon)

A visual workflow editor and runtime built with React Flow and [PocketFlow](https://github.com/The-Pocket/PocketFlow)

## Features

- 🎨 **Visual Editor** - Drag-and-drop workflow authoring with React Flow
- ⚡ **Runtime Engine** - Execute workflows with PocketFlow-based execution
- 📦 **Bundle Builder** - Generate standalone JS bundles with embedded workflows
- 🔧 **CLI Tools** - Run, build, bundle, and validate workflows from command line
- 🧩 **Extensible** - Register custom functions for your workflows
- 🤖 **AI-Ready** - Built-in LLM functions for agentic workflows (OpenAI-compatible)
- 💾 **Storage** - In-memory database and key-value store for stateful workflows
- 🛠️ **Debugging** - Step-through execution and mock value testing
- 🚀 **High Performance** - Powered by Bun runtime for fast execution
- 🧳 **Tiny bundle size** - Minimal dependencies for lightweight deployments

**Recent updates (Feb 2026)**

- Server-side execution & bundling: bundles are built and run only on the server (Vite dev server plugin). Generated bundles are written to `dist/{outputDir}` by the dev-server API instead of being downloaded from the browser.
- Dev-server environment handling: the Vite dev plugin loads `.env` files server-side (using Vite's `loadEnv`) and exposes masked variables to the UI via a `/api/env-vars` endpoint. Use `OPENAI_` and `VITE_` prefixed variables for LLM and client config.
- UI: Settings now fetch environment variables from the server and display masked values; the Bundle UI posts build requests to the server (`/api/build-bundle`) and shows the output path/files.
- Debugger: step-through (step-mode) support and improved event playback for manual stepping.
- Editor: multi-tab workflow editing removed to simplify sync; import/export and duplicate-edge fixes applied.
- Examples: updated example flows (for example `examples/agentic-support-ticket.json`) to call LLM functions by default (simulate: false) and to use action-based routing where appropriate.

<!-- image example from public dir  example1.png-->

<div align="center">
  <img src="/public/example1.png" alt="Pocket Flow – 100-line minimalist LLM framework" width="600"/>
</div>

## Installation

```bash
bun install
```

## Quick Start

### Visual Editor

Start the development server to use the visual workflow editor:

```bash
bun run dev
```

#### Environment Variables

Create a `.env` file in the project root to configure API keys and settings:

```bash
# Copy the example file
cp .env.example .env

# Edit with your values
OPENAI_API_KEY=sk-your-api-key-here
TINYFLOW_DEBUG=true
```

Notes about environment variables and the dev server

- The development server loads `.env` files server-side using Vite's `loadEnv` so server-only keys (like `OPENAI_API_KEY`) are available to runtime execution on the server.
- The UI fetches a masked view of selected env keys from `/api/env-vars` for display in Settings. Only masked values are shown in the client.
- Recommended prefixes: `OPENAI_` for LLM keys, `VITE_` for client-visible config. Server-side runtime will also read `OPENAI_` and `TINYFLOW_` keys.

### CLI Usage

#### Run a Workflow

```bash
bun run cli run workflow.json -v
```

Options:

- `-i, --input <json>` - Initial input data as JSON string
- `-e, --env <K=V>` - Environment variable (can be repeated)
- `-v, --verbose` - Show detailed execution logs

#### Build a Workflow

```bash
bun run cli build workflow.json -o ./dist
```

#### Bundle a Workflow

Generate a standalone JavaScript bundle with the workflow embedded:

```bash
bun run cli bundle workflow.json -o ./dist/flow.js
```

Options:

- `-o, --output <file>` - Output file path
- `-f, --format <format>` - Output format: `esm`, `cjs`, `iife` (default: esm)
- `-e, --env <K=V>` - Default environment variable (can be repeated)
- `-m, --minify` - Minify the output
- `-s, --standalone` - Include embedded runtime (default: true)
- `--global <name>` - Global variable name for IIFE format

#### Validate a Workflow

```bash
bun run cli validate workflow.json
```

#### List Available Functions

```bash
bun run cli list
bun run cli list --json
```

## Using Generated Bundles

### ESM (Default)

```javascript
import { runFlow, setEnv, getEnv, getWorkflow } from "./workflow.bundle.js";

// Set environment variables
setEnv("API_KEY", "your-api-key");
// Or set multiple at once
setEnv({ API_KEY: "xxx", MODE: "production" });

// Run the workflow
const result = await runFlow({
  initialData: { input: "value" },
  onLog: (msg) => console.log(msg),
  onNodeComplete: (nodeId, success, output) => {
    console.log(`Node ${nodeId}: ${success ? "✓" : "✗"}`);
  },
});

if (result.success) {
  console.log("Workflow completed:", result.data);
} else {
  console.error("Workflow failed:", result.error);
}
```

### CommonJS

```javascript
const { runFlow, setEnv } = require("./workflow.bundle.cjs");

setEnv({ API_KEY: "xxx" });
runFlow().then(console.log);
```

### Browser (IIFE)

```html
<script src="workflow.bundle.js"></script>
<script>
  TinyFlow.setEnv({ API_KEY: "xxx" });
  TinyFlow.runFlow().then((result) => {
    console.log(result.data);
  });
</script>
```

## Programmatic API

### Running Workflows

```typescript
import { runWorkflow, runWorkflowFromJson } from "tinyflow";

// From a workflow definition object
const result = await runWorkflow(workflowDefinition, {
  initialData: { key: "value" },
  env: { API_KEY: "xxx" },
  onLog: console.log,
});

// From a JSON string
const result = await runWorkflowFromJson(jsonString, options);
```

### Building Bundles

```typescript
import { buildBundle, buildBundleFromJson } from "tinyflow";

const result = buildBundle({
  workflow: workflowDefinition,
  format: "esm", // 'esm' | 'cjs' | 'iife'
  defaultEnv: { KEY: "value" },
  minify: true,
  includeRuntime: true, // Embed runtime for standalone bundle
  globalName: "MyFlow", // For IIFE format
});

if (result.success) {
  console.log(result.code);
}
```

### Validating Workflows

```typescript
import { validateWorkflow, parseWorkflow, isValidWorkflow } from "tinyflow";

// Full validation with details
const result = validateWorkflow(workflow);
console.log(result.valid, result.errors, result.warnings);

// Parse and validate JSON
const { workflow, validation } = parseWorkflow(jsonString);

// Quick boolean check
if (isValidWorkflow(workflow)) {
  // workflow is valid
}
```

### Registering Custom Functions

```typescript
import { registerFunction, param } from 'tinyflow';

registerFunction(
  {
    id: 'custom.myFunction',
    name: 'My Function',
    description: 'Does something custom',
    category: 'Custom',
    params: [
      param('input', 'string', { required: true }),
      param('option', 'boolean', { default: false }),
    ],
    outputs: ['result'],
  },
  async (params, context) => {
    const { input, option } = params;
    const result = /* do something */;

    context.store.set('result', result);
    context.log(`Processed: ${input}`);

    return { output: result, success: true };
  }
);
```

## Built-in Functions

### Core

| Function           | Description                                               |
| ------------------ | --------------------------------------------------------- |
| `core.start`       | Entry point for the workflow. Passes through input data.  |
| `core.end`         | Terminal node for the workflow. Collects final output.    |
| `core.setValue`    | Sets a static value in the store.                         |
| `core.log`         | Logs a value from the store for debugging.                |
| `core.passthrough` | Passes data from one key to another without modification. |
| `core.delay`       | Pauses execution for a specified duration (ms).           |

### Control Flow

| Function               | Description                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `control.condition`    | Evaluates a condition and returns `success` or `error` action. Supports: `eq`, `ne`, `gt`, `lt`, `gte`, `lte`, `truthy`, `falsy`. |
| `control.switch`       | Routes to different paths based on a value. Returns action matching the value.                                                    |
| `control.counter`      | Maintains a counter, useful for loops.                                                                                            |
| `control.loopCheck`    | Checks if loop should continue based on counter and limit.                                                                        |
| `control.errorHandler` | Catches and handles errors, optionally continuing flow.                                                                           |

### Transform

| Function                  | Description                                                        |
| ------------------------- | ------------------------------------------------------------------ |
| `transform.jsonParse`     | Parses a JSON string into an object.                               |
| `transform.jsonStringify` | Converts an object to a JSON string.                               |
| `transform.template`      | Interpolates values into a template string using `{{key}}` syntax. |
| `transform.map`           | Extracts a nested value using a dot-notation path.                 |
| `transform.merge`         | Merges multiple objects into one.                                  |
| `transform.filter`        | Filters an array based on a simple condition.                      |

### HTTP

| Function       | Description                                                         |
| -------------- | ------------------------------------------------------------------- |
| `http.request` | Makes an HTTP request with full control over method, headers, body. |
| `http.get`     | Simplified GET request.                                             |
| `http.post`    | Simplified POST request with JSON body.                             |

### LLM (AI/Language Models)

| Function       | Description                                                                        |
| -------------- | ---------------------------------------------------------------------------------- |
| `llm.chat`     | Sends a prompt to an LLM (OpenAI-compatible) and returns the response.             |
| `llm.jsonChat` | Sends a prompt to an LLM and parses the response as structured JSON.               |
| `llm.decide`   | Uses an LLM to classify/route from given options. Returns an action for branching. |

**LLM Configuration:**

```javascript
// llm.chat example
{
  "functionId": "llm.chat",
  "params": {
    "promptKey": "userPrompt",      // Key containing the prompt text
    "outputKey": "response",         // Key to store LLM response
    "model": "gpt-4o-mini",          // Optional: model name
    "systemPrompt": "You are helpful", // Optional: system instructions
    "temperature": 0.7,              // Optional: 0-2, default 0.7
    "maxTokens": 1000,               // Optional: max response tokens
    "simulate": true                 // Optional: mock response without API call
  }
}

// llm.decide example - returns action for routing
{
  "functionId": "llm.decide",
  "params": {
    "promptKey": "context",
    "options": ["billing", "technical", "general"],
    "outputKey": "category",
    "simulate": true
  }
}
```

**Environment Variables:**

- `OPENAI_API_KEY` - Required for actual LLM calls (not needed when `simulate: true`)

### Memory (Redis-like Key-Value Store)

| Function        | Description                                                      |
| --------------- | ---------------------------------------------------------------- |
| `memory.set`    | Stores a value in persistent memory with optional TTL (seconds). |
| `memory.get`    | Retrieves a value from persistent memory.                        |
| `memory.delete` | Deletes a value from persistent memory.                          |
| `memory.exists` | Checks if a key exists. Returns `success` or `error` action.     |
| `memory.clear`  | Clears all values from persistent memory.                        |

**Memory Example:**

```javascript
// Store with TTL (expires after 1 hour)
{
  "functionId": "memory.set",
  "params": {
    "memoryKey": "session:user123",
    "valueKey": "userData",
    "ttl": 3600
  }
}

// Retrieve with default
{
  "functionId": "memory.get",
  "params": {
    "memoryKey": "session:user123",
    "outputKey": "cachedUser",
    "defaultValue": null
  }
}
```

### Database (SQLite-like In-Memory Store)

| Function        | Description                                                                 |
| --------------- | --------------------------------------------------------------------------- |
| `db.query`      | Executes a query with filter criteria.                                      |
| `db.insert`     | Inserts a new record with auto-generated ID.                                |
| `db.findOne`    | Finds a single record by ID or filter. Returns `success` or `error` action. |
| `db.findMany`   | Finds multiple records with filtering, sorting, and limiting.               |
| `db.update`     | Updates a record by ID.                                                     |
| `db.delete`     | Deletes a record by ID. Returns `success` or `error` action.                |
| `db.clearTable` | Clears all records from a table.                                            |

**Database Example:**

```javascript
// Insert a record
{
  "functionId": "db.insert",
  "params": {
    "table": "users",
    "dataKey": "newUser",
    "outputKey": "createdUser"
  }
}

// Find with filter and sorting
{
  "functionId": "db.findMany",
  "params": {
    "table": "users",
    "filter": { "status": "active" },
    "orderBy": "createdAt",
    "orderDir": "desc",
    "limit": 10,
    "outputKey": "activeUsers"
  }
}
```

## Workflow Schema

```json
{
  "id": "my-workflow",
  "name": "My Workflow",
  "version": "1.0.0",
  "description": "Optional description",
  "nodes": [
    {
      "id": "start",
      "functionId": "core.start",
      "params": {},
      "position": { "x": 0, "y": 0 }
    },
    {
      "id": "process",
      "functionId": "core.setValue",
      "params": { "key": "result", "value": "done" },
      "position": { "x": 200, "y": 0 }
    },
    {
      "id": "end",
      "functionId": "core.end",
      "params": {},
      "position": { "x": 400, "y": 0 }
    }
  ],
  "edges": [
    { "from": "start", "to": "process", "action": "default" },
    { "from": "process", "to": "end", "action": "default" }
  ],
  "flow": {
    "startNodeId": "start",
    "envs": {
      "DEFAULT_VAR": "value"
    }
  }
}
```

## Development

```bash
# Run tests
bun run test

# Run tests in watch mode
bun run test:watch

# Type check
npx tsc --noEmit

# Lint
bun run lint

# Build
bun run build
```

## License

MIT
