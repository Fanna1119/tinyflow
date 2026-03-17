---
name: create-flowneer-flow
description: "Build a Flowneer flow using FlowBuilder. Use for: creating FlowBuilder flows, adding steps with .then()/.branch()/.loop()/.batch()/.parallel(), using the graph plugin (withGraph + .addNode()/.addEdge()/.compile()), building config-driven flows with JsonFlowBuilder, wiring middleware/plugins with FlowBuilder.extend(), designing shared state types, implementing agentic loops, adding per-step middleware like withTiming/withRateLimit/withCircuitBreaker."
argument-hint: "Describe the flow you want to build"
---

# Create a Flowneer Flow

## Decision: Which style?

| Style                 | When to use                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Sequential DSL**    | Linear or moderately branching flows; most common case                                                              |
| **Graph (withGraph)** | Expressive DAG topology: multiple conditional forward/back edges, cycles that would require many anchors in the DSL |
| **JsonFlowBuilder**   | Config-driven flows stored as plain data (database, API, UI-generated); topology must be serialisable               |

---

## Step 1 — Define shared state and params

```typescript
interface MyState {
  input: string;
  result?: string;
}
// P defaults to Record<string, unknown> — only declare if needed
```

State is a **mutable object** passed to every step. Mutate it directly; never spread-replace it.

---

## Step 2 — Choose and extend plugins

```typescript
import { FlowBuilder } from "flowneer";
import { withRateLimit } from "flowneer/plugins/llm";
import { withCircuitBreaker } from "flowneer/plugins/resilience";
import { withTiming } from "flowneer/plugins/observability";
import { withGraph } from "flowneer/plugins/graph";

// Extend once, reuse the class
const MyFlow = FlowBuilder.extend([
  withRateLimit,
  withCircuitBreaker,
  withTiming,
]);
```

Common plugins in this repo:

- `withRateLimit` (`plugins/llm`) — throttle LLM calls; `.withRateLimit({ intervalMs })`
- `withCircuitBreaker` (`plugins/resilience`) — fail-fast on repeated errors
- `withTiming` (`plugins/observability`) — per-step timing spans
- `withGraph` (`plugins/graph`) — `.addNode()` / `.addEdge()` / `.compile()`
- `withTryCatch` (`plugins/resilience`) — per-step error recovery

---

## Step 3A — Sequential DSL

```typescript
const flow = new MyFlow<MyState>()
  .withRateLimit({ intervalMs: 200 })
  .withTiming()

  // Linear steps
  .startWith(fetchData)
  .then(transform)

  // Routing
  .branch(router, { pass: handlePass, fail: handleFail })

  // Loop while condition is true
  .loop(
    (s) => !s.done,
    (b) => b.startWith(callModel).then(checkResult),
  )

  // Batch — runs processor once per item; injects item into shared[key]
  .batch(
    (s) => s.items,
    (b) => b.startWith(processItem),
    { key: "currentItem" },
  )

  // Parallel — runs all fns concurrently
  .parallel([fetchA, fetchB, fetchC])

  // Anchor + goto — named jump target
  .anchor("retry", 5)
  .then(attempt)
  .then((s) => (s.score < 0.9 ? "#retry" : undefined));
```

### `NodeFn` signature

```typescript
type NodeFn<S, P> = (
  shared: S,
  params: P,
) => Promise<string | void> | string | void | AsyncGenerator<...>;
```

Return a `"#anchorName"` string to jump. Return `undefined` / `void` to continue.

### Fragments and `.add()` — reusable partial flows

Use `fragment()` to build a reusable partial flow with the same DSL, then splice it in via `.add()`. Analogous to Zod's `.extend()` / partial schemas — fragments are composable building-blocks, not standalone flows (calling `.run()` or `.stream()` on a fragment throws).

```typescript
import { fragment } from "flowneer";

// Define reusable fragments once
const enrich = fragment<MyState>().then(fetchUser).then(enrichProfile);

const summarise = fragment<MyState>().loop(
  (s) => !s.done,
  (b) => b.then(summarizeChunk),
);

// Splice into any flow
const flow = new MyFlow<MyState>()
  .then(init)
  .add(enrich) // inlines all enrich steps at this position
  .add(summarise) // inlines all summarise steps next
  .then(finalize);
```

Fragments carry full type information and accept all step types (`.loop()`, `.batch()`, `.branch()`, `.anchor()`, etc.). They cannot be extended with plugins — extend the host `FlowBuilder` class instead.

---

## Step 3B — Graph (withGraph)

Best for expressing complex loop topology through edges rather than method nesting.

```typescript
const flow = new MyFlow<MyState>()
  .withRateLimit({ intervalMs: 200 })

  .addNode("seed", seedFn)
  .addNode("callModel", callModelFn, { label: "llm:callModel" })
  .addNode("executeTools", executeToolsFn)
  .addNode("emitAnswer", emitAnswerFn)

  // Unconditional edges define topological order
  .addEdge("seed", "callModel")
  .addEdge("callModel", "executeTools")
  .addEdge("executeTools", "emitAnswer")

  // Conditional forward skip — fires when model is done
  .addEdge("callModel", "emitAnswer", (s) => s.done)

  // Conditional back-edge — loop back after tool execution
  .addEdge("executeTools", "callModel", (s) => !s.done && s.turn < s.maxTurns)

  .compile();
```

**Edge-type rules:**

- Unconditional edges form the topological sort order (Kahn's algorithm)
- Conditional edges pointing _forward_ → skip-ahead
- Conditional edges pointing _backward_ → cycle/retry loop
- Cycles among _unconditional_ edges throw at compile time

**Middleware on DAG nodes:** Because the `"dag"` handler is `transparent`, every registered middleware fires once per graph node — identical to a plain `.then()` step. Label-scoped filters (e.g. `withRateLimit({}, ["llm:*"])`) work on node labels set via `NodeOptions.label`.

---

## Step 3C — JsonFlowBuilder

Topology is plain data; functions live in a registry.

```typescript
import { JsonFlowBuilder } from "flowneer/presets/config";
import type { FlowConfig, FnRegistry } from "flowneer/plugins/config";

const config: FlowConfig = {
  steps: [
    { type: "fn", fn: "seed" },
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
    { type: "fn", fn: "emitAnswer" },
  ],
};

const registry: FnRegistry = {
  seed,
  shouldContinue,
  callModel,
  getPendingCalls,
  executeTool,
  emitAnswer,
};

// Pass a custom FlowClass to get extended mixins on the result
const flow = JsonFlowBuilder.build<MyState>(config, registry, MyFlow as any);
```

Built-in config step types: `fn`, `branch`, `loop`, `batch`, `parallel`, `anchor`.
Register custom types with `JsonFlowBuilder.registerStepBuilder(type, builder)`.

---

## Step 4A — Run (fire-and-forget)

```typescript
const shared: MyState = { input: "hello" };
await flow.run(shared);
console.log(shared.result);
```

`run()` accepts an optional second argument for params:

```typescript
await flow.run(shared, { userId: "u_123" });
```

---

## Step 4B — Stream (incremental output)

Use `.stream()` instead of `.run()` when you need to push tokens or step events to a consumer as they arrive — e.g. HTTP streaming, SSE, or a UI progress feed.

```typescript
for await (const event of flow.stream(shared)) {
  if (event.type === "chunk") console.log(event.data); // token / payload
  if (event.type === "step:after") console.log(event.meta); // step completed
  if (event.type === "error") throw event.error;
  if (event.type === "done") break;
}
```

**Event types:**

| Event         | When                               | Payload                       |
| ------------- | ---------------------------------- | ----------------------------- |
| `step:before` | Before each step                   | `meta: StepMeta`              |
| `step:after`  | After each step                    | `meta: StepMeta`, `shared: S` |
| `chunk`       | Each `yield` from a generator step | `data: unknown`               |
| `error`       | Uncaught step error                | `error: unknown`              |
| `done`        | Flow completed — always last       | —                             |

**Yielding chunks from a step** — declare the step as `async function*` and `yield` each token/item. The generator's `return` value is still routed normally.

```typescript
.then(async function* (s) {
  for await (const token of openai.streamTokens(s.prompt)) {
    s.response += token;
    yield token;           // → { type: "chunk", data: token }
  }
  // return "#anchorName" still works here
})
```

**When to use `.stream()` vs `.run()`:**

- `.run()` — batch processing, scripts, tests, anything where you just need the final state
- `.stream()` — HTTP server-sent events, WebSocket feeds, CLI progress bars, any consumer that needs incremental output

---

## Step 5 — Validate

- [ ] State type covers all fields mutated by steps
- [ ] Plugins extended before middleware calls (`.extend([...])` before `new`)
- [ ] Middleware configured with `.withX()` after `new MyFlow()`
- [ ] For graphs: `compile()` called last, after all `.addNode()` / `.addEdge()`
- [ ] For JsonFlowBuilder: all `fn` refs in config exist as keys in registry
- [ ] No errors: run `get_errors` on the file after editing
