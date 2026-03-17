---
name: graph-and-json-flow-builder
description: "Deep-dive skill for Flowneer's graph plugin and JsonFlowBuilder preset. Use for: building DAG flows with withGraph + .addNode()/.addEdge()/.compile(), using withExportGraph / withExportFlow to serialise flow structure, building config-driven flows with JsonFlowBuilder.build() / .validate() / .registerStepBuilder(), combining graph topology with JsonFlowBuilder via a custom FlowClass, registering custom step-type compilers."
argument-hint: "Describe the graph topology or JSON config you want to build"
---

# Graph Plugin & JsonFlowBuilder — Deep Dive

## Decision: which tool?

| Need                                                                                                        | Tool                                                                  |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Express complex DAG topology (multiple conditional forward/back edges, cycles that would need many anchors) | `withGraph`                                                           |
| Serialise / inspect a flow's structure for debugging or visualisation                                       | `withExportGraph` / `withExportFlow`                                  |
| Store flow topology as plain data (DB, API, UI-generated config)                                            | `JsonFlowBuilder`                                                     |
| Config-driven flow with rich graph topology                                                                 | Both — pass a graph-extended `FlowClass` to `JsonFlowBuilder.build()` |

---

## Part 1 — Graph Plugin (`withGraph`)

### Step 1 — Setup

```typescript
import { FlowBuilder } from "flowneer";
import { withGraph } from "flowneer/plugins/graph";

const AppFlow = FlowBuilder.extend([withGraph]);
```

### Step 2 — Declare nodes and edges

```typescript
const flow = new AppFlow<MyState>()
  .addNode("fetch", fetchData)
  .addNode("validate", validateData, { retries: 2 })
  .addNode("transform", transformData, { label: "llm:transform" })
  .addNode("save", saveData, { timeoutMs: 5000 })

  // Unconditional edges — define topological (execution) order
  .addEdge("fetch", "validate")
  .addEdge("validate", "transform")
  .addEdge("transform", "save")

  // Conditional forward edge — skip-ahead when already valid
  .addEdge("validate", "transform", (s) => s.valid)

  // Conditional back-edge — loop back to fetch when retry needed
  .addEdge("validate", "fetch", (s) => s.needsRetry && s.retries < 3)

  .compile(); // must be called last
```

### Step 3 — `addNode` API

```typescript
.addNode(name: string, fn: NodeFn<S, P>, options?: NodeOptions<S, P>)
```

| Option      | Type                          | Description                              |
| ----------- | ----------------------------- | ---------------------------------------- |
| `label`     | `string`                      | Middleware label filter (e.g. `"llm:*"`) |
| `retries`   | `number \| ((s,p) => number)` | Retry count on error                     |
| `delaySec`  | `number \| ((s,p) => number)` | Delay between retries                    |
| `timeoutMs` | `number \| ((s,p) => number)` | Per-node timeout                         |

### Step 4 — Edge-type rules

| Edge type                     | Rule                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| Unconditional                 | Defines topological sort order; must form a DAG                                    |
| Conditional forward           | Fires when condition is true; node is skipped if condition true before it executes |
| Conditional back-edge         | Fires when condition is true; jumps back (cycle/retry loop)                        |
| Cycles on unconditional edges | **Throws** at `compile()` — use a conditional back-edge to break every cycle       |

### Step 5 — How `compile()` works

`compile()` runs Kahn's topological sort on unconditional edges, then:

1. Inserts `.anchor("nodeName")` before each node that is the target of a back-edge.
2. After each node that has outgoing conditional edges, inserts a routing step: if the condition passes → `return "#targetNode"`.
3. All middleware (rate limiting, tracing, retries, circuit breakers) fires per-node exactly as for plain `.then()` steps — because the compiled result is standard `FlowBuilder` DSL.

```
Graph: A → B → C, with back-edge C → A (conditional)

Compiled DSL:
  .anchor("A")         ← back-edge target
  .then(aFn)
  .then(bFn)
  .then(cFn)
  .then((s, p) => condition(s, p) ? "#A" : undefined)
```

### Step 6 — Combining with other plugins

```typescript
import { withGraph } from "flowneer/plugins/graph";
import { withRateLimit } from "flowneer/plugins/llm";
import { withCircuitBreaker } from "flowneer/plugins/resilience";
import { withTiming } from "flowneer/plugins/observability";

const AppFlow = FlowBuilder.extend([
  withRateLimit,
  withCircuitBreaker,
  withTiming,
  withGraph, // graph plugin last is fine; compile() is also fine last
]);

const flow = new AppFlow<MyState>()
  .withRateLimit({ intervalMs: 200 })
  .withTiming()
  .addNode("callModel", callModel, { label: "llm:callModel" })
  // ...
  .compile();
```

---

## Part 2 — Graph Export Plugins

### `withExportGraph` — graph flows only

Serialises the raw node/edge declarations **before or after** `compile()`. Non-destructive.

```typescript
import { withGraph, withExportGraph } from "flowneer/plugins/graph";

const AppFlow = FlowBuilder.extend([withGraph, withExportGraph]);

const result = new AppFlow<State>()
  .addNode("fetch", fetchData, { retries: 3 })
  .addNode("transform", transformData)
  .addNode("save", saveData)
  .addEdge("fetch", "transform")
  .addEdge("transform", "save")
  .addEdge("transform", "fetch", (s) => s.needsRetry)
  .exportGraph(); // non-destructive — compile() can still follow
```

```json
{
  "format": "json",
  "nodes": [
    { "name": "fetch", "options": { "retries": 3 } },
    { "name": "transform" },
    { "name": "save" }
  ],
  "edges": [
    { "from": "fetch", "to": "transform", "conditional": false },
    { "from": "transform", "to": "save", "conditional": false },
    { "from": "transform", "to": "fetch", "conditional": true }
  ]
}
```

**Notes:**

- Options with value `0` (default) are omitted.
- Dynamic option values (functions) are serialised as `"<dynamic>"`.
- Throws if called on a builder with no nodes.

### `withExportFlow` — any `FlowBuilder`

Exports **any** flow (sequential, loop, batch, parallel, branch) into nodes + edges. Load it **last** — it overrides `.exportGraph()` with the richer `FlowExport` shape.

```typescript
import { withExportFlow } from "flowneer/plugins/graph";

const AppFlow = FlowBuilder.extend([withExportFlow]); // load last
```

Sequential flow example:

```typescript
const result = new AppFlow<State>()
  .startWith(loadData)
  .then(validate)
  .then(save)
  .exportGraph();
// → { format: "json", flow: { nodes: [...], edges: [...] } }
```

Combined with `withGraph` (both sections present):

```typescript
const AppFlow = FlowBuilder.extend([
  withGraph,
  withExportGraph,
  withExportFlow,
]);

const result = new AppFlow<State>()
  .addNode("a", stepA)
  .addNode("b", stepB)
  .addEdge("a", "b")
  .exportGraph(); // before compile() → flow section is empty, graph section is populated
// → { format: "json", flow: { nodes: [], edges: [] }, graph: { nodes: [...], edges: [...] } }
```

**`FlowExport` types:**

```typescript
interface FlowExport {
  format: "json";
  flow: { nodes: FlowNodeExport[]; edges: FlowEdgeExport[] };
  graph?: { nodes: GraphNodeExport[]; edges: GraphEdgeExport[] }; // only when withGraph store present
}

interface FlowNodeExport {
  id: string; // "fn_0", "branch_2", "anchor:name", "loop_1:body:fn_0"
  type: "fn" | "branch" | "loop" | "batch" | "parallel" | "anchor";
  label: string; // function name or "anonymous"
  options?: { retries?; delaySec?; timeoutMs? };
  meta?: Record<string, unknown>;
}

interface FlowEdgeExport {
  from: string;
  to: string;
  kind:
    | "sequential"
    | "branch-arm"
    | "loop-body"
    | "loop-back"
    | "parallel-fan-out"
    | "batch-body";
  label?: string; // branch key, parallel index, etc.
}
```

---

## Part 3 — `JsonFlowBuilder`

### Step 1 — Setup

```typescript
import { JsonFlowBuilder } from "flowneer/presets/config";
import type { FlowConfig, FnRegistry } from "flowneer/plugins/config";
```

### Step 2 — Write the config

```typescript
const config: FlowConfig = {
  steps: [
    { type: "fn", fn: "seed" },
    { type: "fn", fn: "fetchUser", label: "pii:user", retries: 2 },
    {
      type: "branch",
      router: "routeByScore",
      branches: { pass: "saveResult", fail: "refineResult" },
    },
    {
      type: "loop",
      condition: "shouldContinue",
      body: [
        { type: "fn", fn: "callModel", label: "llm:callModel" },
        {
          type: "batch",
          items: "getPendingCalls",
          key: "currentCall",
          processor: [{ type: "fn", fn: "executeTool" }],
        },
      ],
    },
    { type: "parallel", fns: ["workerA", "workerB"] },
    { type: "anchor", name: "retry", maxVisits: 5 },
    { type: "fn", fn: "emitAnswer" },
  ],
};
```

**Built-in step types:**

| type       | Required fields      | Optional fields                             |
| ---------- | -------------------- | ------------------------------------------- |
| `fn`       | `fn`                 | `label`, `retries`, `delaySec`, `timeoutMs` |
| `branch`   | `router`, `branches` | `label`                                     |
| `loop`     | `condition`, `body`  | `label`                                     |
| `batch`    | `items`, `processor` | `key`, `label`                              |
| `parallel` | `fns`                | `label`, `retries`, `delaySec`, `timeoutMs` |
| `anchor`   | `name`               | `maxVisits`                                 |

### Step 3 — Build the registry

Every `fn`, `router`, branch value, `condition`, `items`, and all `fns` entries must be keys in the registry.

```typescript
const registry: FnRegistry = {
  seed,
  fetchUser,
  routeByScore,
  saveResult,
  refineResult,
  shouldContinue,
  callModel,
  getPendingCalls,
  executeTool,
  workerA,
  workerB,
  emitAnswer,
};
```

### Step 4 — Validate (optional pre-check)

```typescript
const { valid, errors } = JsonFlowBuilder.validate(config, registry);
if (!valid) {
  errors.forEach((e) => console.error(`${e.path}: ${e.message}`));
}
```

### Step 5 — Build and run

```typescript
// Plain FlowBuilder:
const flow = JsonFlowBuilder.build<MyState>(config, registry);

// Custom FlowClass (e.g. with plugins):
const flow = JsonFlowBuilder.build<MyState>(config, registry, MyFlow as any);

await flow.run(shared);
```

**`build()` always calls `validate()` first — throws `ConfigValidationError` if invalid.**

```typescript
import { ConfigValidationError } from "flowneer/presets/config";

try {
  const flow = JsonFlowBuilder.build<MyState>(config, registry);
} catch (e) {
  if (e instanceof ConfigValidationError) {
    console.error(e.errors); // [{ path, message }]
  }
}
```

### Step 6 — Register a custom step type

```typescript
import type { StepConfigBuilder } from "flowneer/presets/config";

JsonFlowBuilder.registerStepBuilder("sleep", (step, flow) => {
  flow.then(async () => new Promise((r) => setTimeout(r, (step as any).ms)));
});

// Now usable in config:
// { type: "sleep", ms: 1000 }
```

The `recurse` argument lets nested compilers call `applySteps` on sub-step arrays (same as `loop` / `batch` do for their bodies):

```typescript
JsonFlowBuilder.registerStepBuilder(
  "retry-block",
  (step, flow, registry, recurse) => {
    flow.loop(
      (s) => (s as any).shouldRetry,
      (inner) => recurse((step as any).body, inner as any, registry),
    );
  },
);
```

---

## Part 4 — Combining Graph + JsonFlowBuilder

Pass a `withGraph`-extended class as the third argument to produce a graph-capable flow from config:

```typescript
import { FlowBuilder } from "flowneer";
import { withGraph } from "flowneer/plugins/graph";
import { JsonFlowBuilder } from "flowneer/presets/config";

const GraphFlow = FlowBuilder.extend([withGraph]);

const flow = JsonFlowBuilder.build<MyState>(config, registry, GraphFlow as any);
// flow is a GraphFlow instance with graph DSL available after build
```

This is useful when middleware plugins (rate limiting, tracing) should apply uniformly across config-driven flows.

---

## Validation Checklist

- [ ] Every `fn` / `router` / `items` / `condition` ref in config exists as a key in registry
- [ ] `compile()` called **last** in the chain, after all `.addNode()` / `.addEdge()` calls
- [ ] No unconditional edge cycles — verify with `compile()` (throws on cycle detection)
- [ ] `withExportFlow` placed **last** in `FlowBuilder.extend([...])` to win the override
- [ ] Custom step types registered with `JsonFlowBuilder.registerStepBuilder()` before `build()`
- [ ] `ConfigValidationError.errors` array inspected when `build()` throws
- [ ] Run `get_errors` on the file after editing to catch TypeScript issues
