# TinyFlow Feature Guide

## Bundle Generation with Bun Server & Docker

Generate production-ready bundles with HTTP server and Docker deployment files.

### Basic Bundle Generation

```typescript
import { buildBundle } from "tinyflow/bundle";

const result = await buildBundle({
  workflow: myWorkflow,
  format: "esm",
  bundleFilename: "bundle.mjs",
  includeServer: true,
  serverPort: 3000,
  emitDocker: true,
  emitCompose: true,
});

// Write files to disk
for (const [filename, content] of Object.entries(result.files || {})) {
  await Bun.write(filename, content);
}
```

### Generated Files

- **bundle.mjs** - Standalone ESM bundle with embedded workflow and runtime
- **server.js** - Bun HTTP server exposing POST /run endpoint
- **Dockerfile** - Docker image configuration using `oven/bun`
- **docker-compose.yml** - Docker Compose configuration

### Deploy with Docker

```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build and run manually
docker build -t tinyflow-app .
docker run -p 3000:3000 tinyflow-app
```

### Run Locally with Bun

```bash
bun server.js
```

### Execute Flow via HTTP

```bash
curl -X POST http://localhost:3000/run \
  -H "Content-Type: application/json" \
  -d '{
    "initialData": {"input": "hello"},
    "env": {"API_KEY": "your-key"}
  }'
```

---

## Webhook Triggers

Receive HTTP webhooks and start workflows with incoming data.

### Create Webhook Node

```typescript
{
  id: 'webhook-start',
  functionId: 'http.webhook',
  params: {
    outputKey: 'webhookData',
    method: 'POST',
    validateSecret: true,
    secretKey: 'WEBHOOK_SECRET',
  },
  env: {},
}
```

### Trigger Workflow with Webhook Data

```typescript
const result = await Runtime.run(webhookWorkflow, {
  initialData: {
    __webhook_payload: {
      event: "user.created",
      data: { userId: 123, email: "user@example.com" },
      secret: process.env.WEBHOOK_SECRET,
    },
  },
  env: {
    WEBHOOK_SECRET: "your-secret-key",
  },
});
```

### Webhook Server Integration

```typescript
Bun.serve({
  port: 3000,
  async fetch(req) {
    if (req.method === "POST" && req.url.endsWith("/webhook")) {
      const payload = await req.json();

      const result = await Runtime.run(webhookWorkflow, {
        initialData: { __webhook_payload: payload },
      });

      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }
  },
});
```

---

## Retry Policies & Error Handling

Add resilient retry logic to handle transient failures.

### Use Predefined Retry Policies

```typescript
import { withRetry, RETRY_POLICIES } from "tinyflow/runtime";

// Fast retry (3 attempts, 1s initial delay)
const result = await withRetry(
  async () => await fetch("https://api.example.com"),
  RETRY_POLICIES.fast,
);

// Patient retry for rate-limited APIs (10 attempts, 5s initial delay)
const data = await withRetry(
  async () => await callRateLimitedAPI(),
  RETRY_POLICIES.patient,
  (context) => {
    console.log(
      `Retry attempt ${context.attempt}, last error: ${context.lastError}`,
    );
  },
);
```

### Create Custom Retry Policy

```typescript
import { createRetryPolicy, withRetry } from "tinyflow/runtime";

const customPolicy = createRetryPolicy({
  maxAttempts: 5,
  initialDelay: 2000,
  maxDelay: 30000,
  backoffMultiplier: 1.5,
  jitter: true,
});

const result = await withRetry(myFunction, customPolicy);
```

### Available Retry Policies

- **none** - No retries (1 attempt)
- **fast** - Quick retry for transient errors (3 attempts, 1s delay)
- **standard** - Default policy (3 attempts, 2s delay)
- **aggressive** - Critical operations (5 attempts, 2s delay)
- **patient** - Rate-limited APIs (10 attempts, 5s delay)

### Check if Error is Retryable

```typescript
import { isRetryableError } from "tinyflow/runtime";

try {
  await someOperation();
} catch (error) {
  if (isRetryableError(error)) {
    // Network error, timeout, or 5xx - safe to retry
    await withRetry(someOperation, RETRY_POLICIES.fast);
  } else {
    // Validation error, 4xx - don't retry
    throw error;
  }
}
```

---

## Durable Execution & Persistence

Persist workflow state for long-running or resumable executions.

### Enable Persistence

```typescript
import {
  setPersistenceAdapter,
  InMemoryPersistenceAdapter,
} from "tinyflow/runtime";

// Use in-memory adapter (default, no durability)
setPersistenceAdapter(new InMemoryPersistenceAdapter());

// Or implement custom adapter (e.g., Redis, Postgres, SQLite)
// setPersistenceAdapter(new RedisPersistenceAdapter(...));
```

### Save Execution State

```typescript
import {
  getPersistenceAdapter,
  createExecutionId,
  createExecutionSnapshot,
} from "tinyflow/runtime";

const adapter = getPersistenceAdapter();
const executionId = createExecutionId();

// Save state during execution
const snapshot = createExecutionSnapshot(
  executionId,
  "my-workflow",
  "current-node-id",
  "running",
  { counter: 5, data: "value" },
  ["Log line 1", "Log line 2"],
  new Date(),
);

await adapter.saveState(snapshot);
```

### Resume Execution

```typescript
// Load previous state
const state = await adapter.loadState(executionId);

if (state) {
  // Resume from saved state
  const result = await Runtime.run(workflow, {
    initialData: state.storeData,
  });
}
```

### List & Cleanup Executions

```typescript
// List recent executions for a workflow
const executions = await adapter.listExecutions("my-workflow", 10);

// Clean up old completed executions (older than 7 days)
const deleted = await adapter.cleanup(7 * 24 * 60 * 60 * 1000);
console.log(`Cleaned up ${deleted} old executions`);
```

---

## Testing Harness

Utilities for testing workflows with assertions and mocks.

### Test Workflow with Assertions

```typescript
import { testWorkflow } from "tinyflow/testing";

const result = await testWorkflow(myWorkflow, {
  initialData: { input: "test" },
  expectedData: { output: "expected-result" },
  expectedSuccess: true,
  timeout: 5000,
});

if (result.passed) {
  console.log("✓ Test passed");
} else {
  console.error("✗ Test failed:", result.failures);
}
```

### Use Mocks

```typescript
import { testWorkflow, createMocks } from "tinyflow/testing";

const mocks = createMocks({
  "http-node": { status: 200, data: { result: "mocked" } },
  "llm-node": { response: "Mocked LLM response" },
});

const result = await testWorkflow(myWorkflow, {
  mockValues: mocks,
  expectedSuccess: true,
});
```

### Spy on Function Calls

```typescript
import { testWorkflow, FunctionSpy } from "tinyflow/testing";

const spy = new FunctionSpy();

await testWorkflow(myWorkflow, {
  onNodeComplete: spy.getCallback(),
});

console.log("Node was called:", spy.wasNodeCalled("my-node"));
console.log("All calls:", spy.getCalls());
console.log("Calls for node:", spy.getCallsForNode("my-node"));
```

### Assertion Helpers

```typescript
import { assert, assertEqual } from "tinyflow/testing";

// Simple assertion
assert(result.success, "Workflow should succeed");

// Deep equality check
assertEqual(result.data, { expected: "value" }, "Data should match");
```

---

## Enhanced Debug UI

Track detailed per-node execution with the new execution log hook.

### Use Execution Log Hook (React)

```typescript
import { useExecutionLog } from 'tinyflow/ui/hooks/useExecutionLog';

function MyWorkflowRunner() {
  const log = useExecutionLog();

  const runWorkflow = async () => {
    const executionId = log.startExecution();

    await Runtime.run(workflow, {
      onBeforeNode: async (nodeId) => {
        log.startNode(nodeId, node.functionId);
      },
      onNodeComplete: (nodeId, success, output) => {
        log.endNode(nodeId, success, output);
      },
      onLog: (message) => {
        log.addLog(message);
      },
    });

    log.endExecution(true);
  };

  return (
    <div>
      <button onClick={runWorkflow}>Run</button>

      {/* Display current execution */}
      {log.currentExecution && (
        <div>
          <h3>Execution {log.currentExecution.executionId}</h3>
          <p>Duration: {log.currentExecution.duration}ms</p>

          {log.currentExecution.nodeExecutions.map(node => (
            <div key={node.nodeId}>
              <span>{node.nodeId}</span>
              <span>{node.duration}ms</span>
              <span>{node.success ? '✓' : '✗'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Display execution history */}
      <h3>History</h3>
      {log.history.map(exec => (
        <div key={exec.executionId}>
          {exec.executionId} - {exec.success ? 'Success' : 'Failed'}
        </div>
      ))}
    </div>
  );
}
```

### Get Node Status

```typescript
const status = log.getNodeStatus("my-node");
// Returns: 'pending' | 'running' | 'success' | 'error' | undefined

const duration = log.getNodeDuration("my-node");
// Returns: number (ms) or undefined
```

---

## Complete Example: Production-Ready Workflow

```typescript
import { buildBundle } from "tinyflow/bundle";
import { Runtime } from "tinyflow/runtime";
import { withRetry, RETRY_POLICIES } from "tinyflow/runtime";
import { testWorkflow } from "tinyflow/testing";

// 1. Define workflow with webhook trigger
const workflow = {
  flow: {
    id: "production-workflow",
    name: "Production Workflow",
    startNodeId: "webhook",
    envs: {
      API_KEY: "${API_KEY}", // Use environment variables for secrets
    },
  },
  nodes: [
    {
      id: "webhook",
      functionId: "http.webhook",
      params: { outputKey: "webhookData" },
      env: {},
    },
    // ... more nodes
  ],
  edges: [
    // ... edges
  ],
};

// 2. Test workflow
const testResult = await testWorkflow(workflow, {
  initialData: { __webhook_payload: { test: "data" } },
  expectedSuccess: true,
  timeout: 10000,
});

if (!testResult.passed) {
  throw new Error(`Tests failed: ${testResult.failures.join(", ")}`);
}

// 3. Build production bundle
const bundle = await buildBundle({
  workflow,
  format: "esm",
  includeServer: true,
  serverPort: 3000,
  emitDocker: true,
  emitCompose: true,
  minify: true,
});

// 4. Write files
for (const [filename, content] of Object.entries(bundle.files || {})) {
  await Bun.write(filename, content);
}

// 5. Deploy with Docker
// docker-compose up -d

console.log("✓ Production bundle generated and ready to deploy!");
```
