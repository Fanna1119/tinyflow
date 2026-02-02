# TinyFlow Quick Reference

## 🚀 Production Bundle Generation

```typescript
import { buildBundle } from "tinyflow";

const bundle = await buildBundle({
  workflow,
  format: "esm", // esm | cjs (server-side only)
  includeServer: true,
  serverPort: 3000,
  emitDocker: true,
  emitCompose: true,
  minify: true,
});

// Writes: bundle.mjs, server.js, Dockerfile, docker-compose.yml
for (const [file, content] of Object.entries(bundle.files || {})) {
  await Bun.write(file, content);
}
```

**Deploy:**

```bash
bun server.js                    # Local
docker-compose up -d             # Docker
```

---

## 🔐 Credentials Management

```typescript
import { getCredentialStore } from "tinyflow/credentials";

const store = getCredentialStore();

// Store encrypted credential
store.set({
  id: "api-key",
  name: "My API Key",
  type: "api-key",
  data: { apiKey: "secret-123", endpoint: "https://api.example.com" },
});

// Retrieve (auto-decrypted)
const cred = store.get("api-key");
const apiKey = store.getValue("api-key", "apiKey");

// List (no secrets)
const list = store.list(); // [{ id, name, type }]
```

---

## 🪝 Webhook Triggers

```json
{
  "id": "webhook-start",
  "functionId": "http.webhook",
  "params": {
    "outputKey": "webhookData",
    "method": "POST",
    "validateSecret": true,
    "secretKey": "WEBHOOK_SECRET"
  }
}
```

```typescript
await Runtime.run(workflow, {
  initialData: {
    __webhook_payload: { event: "user.created", data: {...}, secret: "..." }
  }
});
```

---

## 🔄 Retry Policies

```typescript
import { withRetry, RETRY_POLICIES } from "tinyflow/runtime";

// Predefined policies: none, fast, standard, aggressive, patient
const result = await withRetry(
  async () => await fetch("https://api.example.com"),
  RETRY_POLICIES.aggressive,
  (ctx) => console.log(`Retry ${ctx.attempt}: ${ctx.lastError}`),
);

// Custom policy
const custom = createRetryPolicy({
  maxAttempts: 5,
  initialDelay: 2000,
  maxDelay: 30000,
  backoffMultiplier: 1.5,
  jitter: true,
});
```

---

## 💾 Durable Execution

```typescript
import {
  getPersistenceAdapter,
  createExecutionId,
  createExecutionSnapshot,
} from "tinyflow/runtime";

const adapter = getPersistenceAdapter();
const execId = createExecutionId();

// Save state
const snapshot = createExecutionSnapshot(
  execId,
  "my-workflow",
  "current-node",
  "running",
  { data: "value" },
  ["log1", "log2"],
  new Date(),
);
await adapter.saveState(snapshot);

// Resume
const state = await adapter.loadState(execId);
await Runtime.run(workflow, { initialData: state.storeData });

// Cleanup old executions
await adapter.cleanup(7 * 24 * 60 * 60 * 1000); // 7 days
```

---

## 🧪 Testing Workflows

```typescript
import { testWorkflow, createMocks, FunctionSpy } from "tinyflow/testing";

// Test with assertions
const result = await testWorkflow(workflow, {
  initialData: { input: "test" },
  expectedData: { output: "expected" },
  expectedSuccess: true,
  timeout: 5000,
});

console.log(result.passed ? "✓ Pass" : "✗ Fail", result.failures);

// Use mocks
const mocks = createMocks({
  "http-node": { status: 200, data: "mocked" },
  "llm-node": { response: "Mocked response" },
});

await testWorkflow(workflow, { mockValues: mocks });

// Spy on calls
const spy = new FunctionSpy();
await testWorkflow(workflow, { onNodeComplete: spy.getCallback() });
console.log("Calls:", spy.getCalls());
```

---

## 🐛 Debug UI (React)

```typescript
import { useExecutionLog } from "tinyflow/ui/hooks/useExecutionLog";

function MyComponent() {
  const log = useExecutionLog();

  const run = async () => {
    log.startExecution();

    await Runtime.run(workflow, {
      onBeforeNode: (nodeId) => log.startNode(nodeId, functionId),
      onNodeComplete: (nodeId, success, output) =>
        log.endNode(nodeId, success, output),
      onLog: (msg) => log.addLog(msg),
    });

    log.endExecution(true);
  };

  return (
    <div>
      <button onClick={run}>Run</button>

      {/* Display per-node execution */}
      {log.currentExecution?.nodeExecutions.map((node) => (
        <div key={node.nodeId}>
          {node.nodeId}: {node.duration}ms {node.success ? "✓" : "✗"}
        </div>
      ))}

      {/* History */}
      {log.history.map((exec) => (
        <div key={exec.executionId}>
          {exec.executionId} - {exec.duration}ms
        </div>
      ))}
    </div>
  );
}
```

---

## 📚 CLI Quick Reference

```bash
# Run workflow
bun run cli run workflow.json -v

# Build workflow
bun run cli build workflow.json -o dist/

# Bundle workflow
bun run cli bundle workflow.json -o dist/bundle.js -m

# Generate production bundle
bun examples/generate-bundle.ts workflow.json

# Validate workflow
bun run cli validate workflow.json

# List functions
bun run cli list
```

---

## 🔗 Built-in Functions

### HTTP

- `http.request` - Full HTTP request
- `http.get` - GET request
- `http.post` - POST request
- `http.webhook` - Webhook trigger ✨ NEW

### Core

- `core.start`, `core.end`, `core.log`, `core.setValue`, `core.passthrough`, `core.delay`

### Control

- `control.condition`, `control.switch`, `control.counter`, `control.loopCheck`, `control.errorHandler`

### Transform

- `transform.jsonParse`, `transform.jsonStringify`, `transform.template`, `transform.map`, `transform.merge`, `transform.filter`

### LLM

- `llm.chat`, `llm.completion`, `llm.embedding`, `llm.function`

### Memory

- `memory.set`, `memory.get`, `memory.list`, `memory.delete`, `memory.search`

### Database

- `database.insert`, `database.select`, `database.update`, `database.delete`

---

## 🎯 Common Patterns

### Production API Workflow

```typescript
// 1. Generate bundle
await buildBundle({
  workflow,
  includeServer: true,
  emitDocker: true,
});

// 2. Store credentials
const store = getCredentialStore();
store.set({ id: "api", data: { key: process.env.API_KEY } });

// 3. Add retry logic to HTTP nodes
const apiCall = async () => fetch("...");
const result = await withRetry(apiCall, RETRY_POLICIES.aggressive);

// 4. Deploy
// bun server.js or docker-compose up
```

### Testing Pipeline

```typescript
// 1. Mock external services
const mocks = createMocks({
  "api-call": { status: 200, data: "test" },
});

// 2. Test with assertions
const result = await testWorkflow(workflow, {
  mockValues: mocks,
  expectedSuccess: true,
  expectedData: { result: "expected" },
});

// 3. Verify calls
const spy = new FunctionSpy();
await testWorkflow(workflow, { onNodeComplete: spy.getCallback() });
assert(spy.wasNodeCalled("critical-node"), "Node should be called");
```

### Long-running Workflow

```typescript
// 1. Setup persistence
setPersistenceAdapter(new InMemoryPersistenceAdapter());

// 2. Save state during execution
const execId = createExecutionId();
await Runtime.run(workflow, {
  onNodeComplete: async (nodeId) => {
    const snapshot = createExecutionSnapshot(
      execId,
      "workflow-id",
      nodeId,
      "running",
      store.toObject(),
      logs,
      startTime,
    );
    await getPersistenceAdapter().saveState(snapshot);
  },
});

// 3. Resume later
const state = await getPersistenceAdapter().loadState(execId);
await Runtime.run(workflow, { initialData: state.storeData });
```

---

## 📖 Documentation

- [FEATURES.md](./FEATURES.md) - Comprehensive feature guide
- [IMPLEMENTATION.md](./IMPLEMENTATION.md) - Implementation details
- [README.md](./README.md) - Getting started guide
