# TinyFlow Workflow Generation Instructions

You are an expert at generating TinyFlow workflow JSON files and creating custom registry functions. TinyFlow is a visual workflow engine with a JSON-based workflow definition format.

## Workflow JSON Schema

Every workflow must follow this structure:

```json
{
  "id": "workflow-id",
  "name": "Human Readable Name",
  "description": "What this workflow does",
  "version": "1.0.0",
  "nodes": [...],
  "edges": [...],
  "flow": {
    "startNodeId": "start",
    "envs": {}
  },
  "metadata": {
    "createdAt": "ISO-date",
    "tags": ["tag1", "tag2"]
  }
}
```

### Node Structure

```json
{
  "id": "unique-node-id",
  "functionId": "category.functionName",
  "params": { ... },
  "position": { "x": 100, "y": 100 },
  "label": "Optional display label"
}
```

### Edge Structure

```json
{
  "from": "source-node-id",
  "to": "target-node-id",
  "action": "default"
}
```

Actions determine which path to take:

- `"default"` - Standard flow
- `"success"` / `"error"` - For conditional routing
- Custom actions - Returned by `control.switch` or `llm.decide`

## Available Registry Functions

### Core Functions

| Function           | Description                       | Key Params           |
| ------------------ | --------------------------------- | -------------------- |
| `core.start`       | Entry point, initializes workflow | `input` (object)     |
| `core.end`         | Terminal node, collects output    | `outputKey` (string) |
| `core.setValue`    | Sets a static value               | `key`, `value`       |
| `core.log`         | Logs value for debugging          | `key`, `message`     |
| `core.passthrough` | Copies value between keys         | `fromKey`, `toKey`   |
| `core.delay`       | Pauses execution                  | `ms` (number)        |

### Control Flow

| Function               | Description             | Key Params                                        |
| ---------------------- | ----------------------- | ------------------------------------------------- |
| `control.condition`    | Conditional branching   | `leftKey`, `operator`, `rightValue`               |
| `control.switch`       | Multi-way routing       | `key`, `cases` (object mapping values to actions) |
| `control.counter`      | Loop counter            | `key`, `increment`                                |
| `control.loopCheck`    | Check loop continuation | `counterKey`, `limit`                             |
| `control.errorHandler` | Catch errors            | `errorKey`, `continueOnError`                     |

Operators for `control.condition`: `eq`, `ne`, `gt`, `lt`, `gte`, `lte`, `truthy`, `falsy`

### Transform Functions

| Function                  | Description          | Key Params                                            |
| ------------------------- | -------------------- | ----------------------------------------------------- |
| `transform.template`      | String interpolation | `template` (uses `{{key}}`), `outputKey`              |
| `transform.jsonParse`     | Parse JSON string    | `inputKey`, `outputKey`                               |
| `transform.jsonStringify` | Stringify to JSON    | `inputKey`, `outputKey`                               |
| `transform.map`           | Extract nested value | `inputKey`, `path` (dot notation), `outputKey`        |
| `transform.merge`         | Merge objects        | `keys` (array), `outputKey`                           |
| `transform.filter`        | Filter array         | `inputKey`, `field`, `operator`, `value`, `outputKey` |

### HTTP Functions

| Function       | Description       | Key Params                                         |
| -------------- | ----------------- | -------------------------------------------------- |
| `http.request` | Full HTTP request | `url`, `method`, `headers`, `bodyKey`, `outputKey` |
| `http.get`     | Simple GET        | `url`, `outputKey`, `headers`                      |
| `http.post`    | Simple POST       | `url`, `bodyKey`, `outputKey`, `headers`           |

URL templates support `{{key}}` interpolation.

### LLM Functions (AI)

| Function       | Description            | Key Params                                                                   |
| -------------- | ---------------------- | ---------------------------------------------------------------------------- |
| `llm.chat`     | Send prompt to LLM     | `promptKey`, `outputKey`, `model`, `systemPrompt`, `temperature`, `simulate` |
| `llm.jsonChat` | Get structured JSON    | `promptKey`, `outputKey`, `model`, `systemPrompt`, `simulate`                |
| `llm.decide`   | Classification/routing | `promptKey`, `options` (array), `outputKey`, `simulate`                      |

Set `simulate: true` for testing without API calls.

### Memory Functions (Key-Value Store)

| Function        | Description                   | Key Params                               |
| --------------- | ----------------------------- | ---------------------------------------- |
| `memory.set`    | Store value with optional TTL | `memoryKey`, `valueKey`, `ttl` (seconds) |
| `memory.get`    | Retrieve value                | `memoryKey`, `outputKey`, `defaultValue` |
| `memory.delete` | Delete value                  | `memoryKey`                              |
| `memory.exists` | Check if key exists           | `memoryKey`, `outputKey`                 |
| `memory.clear`  | Clear all memory              | (none)                                   |

### Database Functions (In-Memory)

| Function        | Description           | Key Params                                                     |
| --------------- | --------------------- | -------------------------------------------------------------- |
| `db.insert`     | Insert record         | `table`, `dataKey`, `outputKey`                                |
| `db.findOne`    | Find single record    | `table`, `id` or `filter`, `outputKey`                         |
| `db.findMany`   | Find multiple records | `table`, `filter`, `orderBy`, `orderDir`, `limit`, `outputKey` |
| `db.update`     | Update record         | `table`, `id`, `dataKey`, `outputKey`                          |
| `db.delete`     | Delete record         | `table`, `id`                                                  |
| `db.query`      | Query with filter     | `table`, `filter`, `outputKey`, `limit`                        |
| `db.clearTable` | Clear table           | `table`                                                        |

## Workflow Generation Guidelines

1. **Always start with `core.start`** - Set initial input data
2. **Always end with `core.end`** - Specify the output key
3. **Use meaningful node IDs** - e.g., `fetch-user`, `validate-input`, not `node1`
4. **Position nodes left-to-right** - Increment x by ~250 for linear flows
5. **Connect all nodes with edges** - Every node needs incoming/outgoing edges (except start/end)
6. **Use `transform.template` to build prompts** - Before LLM calls
7. **Use `llm.decide` for routing** - When LLM should choose a path

## Example Workflow Patterns

### Linear Flow

```
start → process → transform → end
```

### Conditional Branching

```
start → condition ──success──→ pathA → end
                  └──error───→ pathB → end
```

### LLM Classification

```
start → build-prompt → llm.decide ──option1──→ handler1 → end
                                  └──option2──→ handler2 → end
```

### Loop Pattern

```
start → init-counter → [process] → increment → check ──continue──→ [process]
                                             └──done──→ end
```

---

## Creating Custom Registry Functions

When a workflow requires functionality not available in the built-in registry (e.g., math operations, PDF generation, web scraping), create a new function file.

### File Location

`src/registry/functions/{category}.ts`

### Function Template

```typescript
/**
 * Built-in Functions: {Category}
 * {Description of what this category provides}
 */

import { registerFunction, param } from "../registry";

// ============================================================================
// {Function Name}
// ============================================================================

registerFunction(
  {
    id: "{category}.{functionName}",  // e.g., "math.calculate", "pdf.generate"
    name: "{Human Readable Name}",
    description: "{What this function does}",
    category: "{Category}",
    params: [
      param("inputKey", "string", {
        required: true,
        description: "Key in store containing the input",
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store the result",
      }),
      // Add more params as needed
    ],
    outputs: ["outputKey"],
    icon: "{LucideIconName}",  // e.g., "Calculator", "FileText", "Globe"
  },
  async (params, context) => {
    // 1. Extract params
    const inputKey = params.inputKey as string;
    const outputKey = params.outputKey as string;

    // 2. Get data from store
    const input = context.store.get(inputKey);

    // 3. Validate input
    if (!input) {
      return {
        output: null,
        success: false,
        error: `No input found at key "${inputKey}"`,
      };
    }

    // 4. Do the work
    context.log(`Processing: ${JSON.stringify(input).substring(0, 50)}...`);
    const result = /* your logic here */;

    // 5. Store result
    context.store.set(outputKey, result);

    // 6. Return result
    return {
      output: result,
      success: true,
      // Optional: action: "custom" for routing
    };
  },
);
```

### Parameter Types

```typescript
param("name", "string", { required: true, description: "..." });
param("name", "number", { required: false, default: 10 });
param("name", "boolean", { required: false, default: false });
param("name", "object", { required: false, description: "..." });
param("name", "array", { required: true, description: "..." });
```

### Execution Context

```typescript
interface ExecutionContext {
  nodeId: string; // Current node ID
  store: Map<string, unknown>; // Shared workflow state
  env: Record<string, string>; // Environment variables
  log: (message: string) => void; // Logging function
}
```

### Function Result

```typescript
interface FunctionResult {
  output: unknown; // Data to return
  action?: string; // Edge to follow (default: "default")
  success: boolean; // Did it succeed?
  error?: string; // Error message if failed
}
```

### Register the Function

Add import to `src/registry/index.ts`:

```typescript
import "./functions/core";
import "./functions/transform";
import "./functions/control";
import "./functions/http";
import "./functions/llm";
import "./functions/memory";
import "./functions/database";
import "./functions/{your-category}"; // Add this line
```

### Add to Bundle Builder (Optional)

If the function should work in standalone bundles, add implementation to `src/bundle/builder.ts` in the `FUNCTION_IMPLEMENTATIONS` object:

```typescript
"{category}.{functionName}": `async (params, ctx) => {
  // Simplified standalone implementation
  // Use ctx.store.get/set, ctx.log
}`,
```

---

## Example Custom Functions

### Math Functions

```typescript
// src/registry/functions/math.ts

import { registerFunction, param } from "../registry";

registerFunction(
  {
    id: "math.calculate",
    name: "Calculate",
    description: "Performs mathematical operations on numbers.",
    category: "Math",
    params: [
      param("expression", "string", {
        required: true,
        description: "Math expression with {{key}} placeholders",
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store the result",
      }),
    ],
    outputs: ["outputKey"],
    icon: "Calculator",
  },
  async (params, context) => {
    const expression = params.expression as string;
    const outputKey = params.outputKey as string;

    // Replace placeholders with values
    const resolved = expression.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = context.store.get(key);
      return value !== undefined ? String(value) : "0";
    });

    try {
      // Safe eval using Function constructor
      const result = new Function(`return ${resolved}`)();
      context.store.set(outputKey, result);
      context.log(`Math: ${resolved} = ${result}`);
      return { output: result, success: true };
    } catch (e) {
      return {
        output: null,
        success: false,
        error: `Invalid expression: ${resolved}`,
      };
    }
  },
);
```

### Web Scraper

```typescript
// src/registry/functions/scraper.ts

import { registerFunction, param } from "../registry";

registerFunction(
  {
    id: "scraper.fetchPage",
    name: "Fetch Web Page",
    description: "Fetches HTML content from a URL.",
    category: "Scraper",
    params: [
      param("url", "string", { required: true, description: "URL to fetch" }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store HTML",
      }),
      param("selector", "string", {
        required: false,
        description: "CSS selector to extract",
      }),
    ],
    outputs: ["outputKey"],
    icon: "Globe",
  },
  async (params, context) => {
    const url = params.url as string;
    const outputKey = params.outputKey as string;

    try {
      const response = await fetch(url);
      const content = await response.text();

      context.store.set(outputKey, content);
      context.log(`Fetched ${url} (${content.length} chars)`);

      return { output: content, success: true };
    } catch (e) {
      return { output: null, success: false, error: (e as Error).message };
    }
  },
);
```

### PDF Generator (Example Structure)

```typescript
// src/registry/functions/pdf.ts

import { registerFunction, param } from "../registry";

registerFunction(
  {
    id: "pdf.generate",
    name: "Generate PDF",
    description: "Generates a PDF from HTML content.",
    category: "PDF",
    params: [
      param("htmlKey", "string", {
        required: true,
        description: "Key containing HTML",
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store PDF data",
      }),
      param("filename", "string", { required: false, default: "document.pdf" }),
    ],
    outputs: ["outputKey"],
    icon: "FileText",
  },
  async (params, context) => {
    const htmlKey = params.htmlKey as string;
    const outputKey = params.outputKey as string;
    const html = context.store.get(htmlKey) as string;

    // Would use a PDF library like puppeteer, jsPDF, or call an API
    // This is a placeholder showing the structure
    const pdfData = { html, generatedAt: new Date().toISOString() };

    context.store.set(outputKey, pdfData);
    context.log(`PDF generated from ${htmlKey}`);

    return { output: pdfData, success: true };
  },
);
```

## Naming Conventions

- **Function IDs**: `category.camelCase` (e.g., `math.calculate`, `pdf.generate`)
- **Node IDs**: `kebab-case` (e.g., `fetch-user`, `process-data`)
- **Store Keys**: `camelCase` (e.g., `userData`, `processedResult`)
- **Categories**: PascalCase in UI (e.g., "Math", "PDF", "Scraper")

## Testing Functions

Create tests in `src/registry/__tests__/functions.test.ts`:

```typescript
describe("math.calculate", () => {
  it("should evaluate expressions", async () => {
    const context = createMockContext({ a: 10, b: 5 });
    const fn = registry.getExecutable("math.calculate")!;

    const result = await fn(
      { expression: "{{a}} + {{b}} * 2", outputKey: "result" },
      context,
    );

    expect(result.success).toBe(true);
    expect(result.output).toBe(20);
  });
});
```
