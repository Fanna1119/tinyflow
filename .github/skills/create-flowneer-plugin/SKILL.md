---
name: create-flowneer-plugin
description: "Design and implement a Flowneer plugin. Use for: writing a FlowneerPlugin object, choosing lifecycle hooks (beforeFlow/beforeStep/wrapStep/afterStep/onError/afterFlow), applying StepFilter to scope hooks, adding TypeScript types via declaration merging, registering a new step type with CoreFlowBuilder.registerStepType(), building a builder method that pushes a step descriptor, composing multiple hooks in one plugin, and packaging a plugin for reuse."
argument-hint: "Describe what the plugin should do — e.g. rate-limit LLM steps, record per-step metrics, add a sleep step type"
---

# Create a Flowneer Plugin

## Decision: which extension mechanism?

| Goal                                                                       | Mechanism                                                                          |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Add a new **builder method** (e.g. `.withMetrics()`) that wires hooks      | `FlowneerPlugin` + `FlowBuilder.extend()`                                          |
| Add a completely new **step type** (e.g. `.sleep()`) handled by the engine | `CoreFlowBuilder.registerStepType()` + a builder method that pushes the descriptor |
| Compose reusable **step sequences** without a new method                   | `fragment()` — not a plugin                                                        |

Plugins live in `plugins/<category>/withXxx.ts` and are re-exported from `plugins/<category>/index.ts`.

---

## Step 1 — Scaffold the file

```typescript
// plugins/myCategory/withMyPlugin.ts
import type {
  FlowBuilder,
  FlowneerPlugin,
  StepFilter,
  StepMeta,
} from "flowneer";

// (1) Declare the builder method via module augmentation
declare module "flowneer" {
  interface FlowBuilder<S, P> {
    withMyPlugin(opts?: MyPluginOptions, filter?: StepFilter): this;
  }
}

// (2) Export public types consumers may need
export interface MyPluginOptions {
  verbose?: boolean;
}

// (3) Implement the plugin object
export const withMyPlugin: FlowneerPlugin = {
  withMyPlugin(
    this: FlowBuilder<any, any>,
    opts: MyPluginOptions = {},
    filter?: StepFilter,
  ) {
    (this as any)._setHooks(
      {
        beforeStep: (meta: StepMeta, shared: any, params: any) => {
          // runs before each matched step
        },
        afterStep: (meta: StepMeta, shared: any, params: any) => {
          // runs after each matched step
        },
      },
      filter,
    );
    return this; // always return `this` for chaining
  },
};
```

---

## Step 2 — Choose lifecycle hooks

Register hooks via `(this as any)._setHooks(hooks, filter?)`.

| Hook              | Signature                                                | Fires                                         |
| ----------------- | -------------------------------------------------------- | --------------------------------------------- |
| `beforeFlow`      | `(shared, params) => void`                               | Once before the first step                    |
| `beforeStep`      | `(meta, shared, params) => void`                         | Before each step body                         |
| `wrapStep`        | `(meta, next, shared, params) => Promise<void>`          | Wraps step body — call `next()` to execute it |
| `afterStep`       | `(meta, shared, params) => void`                         | After each step completes                     |
| `wrapParallelFn`  | `(meta, fnIndex, next, shared, params) => Promise<void>` | Wraps each fn inside `.parallel()`            |
| `onError`         | `(meta, error, shared, params) => void`                  | When a step throws (before re-throw)          |
| `afterFlow`       | `(shared, params) => void`                               | Once after the last step                      |
| `onLoopIteration` | `(meta, iteration, shared, params) => void`              | After each loop iteration                     |

**`wrapStep` is the most powerful hook** — it lets you run code before and after, suppress errors, or skip the step:

```typescript
wrapStep: async (meta, next, shared, params) => {
  console.log("before", meta.index);
  await next();                         // ← omit to skip the step entirely
  console.log("after", meta.index);
},
```

Multiple `wrapStep` registrations compose innermost-first (last registered = outermost wrapper).

---

## Step 3 — Scope with `StepFilter`

`StepFilter` restricts step-scoped hooks to a subset of steps. `beforeFlow` / `afterFlow` are unaffected.

```typescript
// String array — glob wildcard supported
(this as any)._setHooks({ beforeStep: myHook }, ["llm:*", "embed:*"]);

// Predicate — full runtime control
(this as any)._setHooks(
  { beforeStep: myHook },
  (meta) => meta.type === "fn" && meta.label?.startsWith("llm:"),
);
```

For `wrapStep` / `wrapParallelFn`, non-matching steps automatically call `next()` — the middleware chain is never broken.

Steps get labels via `NodeOptions.label`:

```typescript
flow.then(callModel, { label: "llm:callModel" });
// withGraph: .addNode("callModel", callModel, { label: "llm:callModel" })
```

---

## Step 4 — Access `StepMeta`

```typescript
interface StepMeta {
  index: number; // 0-based step position
  type: string; // "fn" | "branch" | "loop" | "batch" | "parallel" | "anchor" | "dag"
  label?: string; // set via NodeOptions.label
}
```

---

## Step 5 — Common patterns

### Observe-only (read shared, no side-effects on flow)

```typescript
export const withTiming: FlowneerPlugin = {
  withTiming(this: FlowBuilder<any, any>, filter?: StepFilter) {
    const starts = new Map<number, number>();
    (this as any)._setHooks(
      {
        beforeStep: (meta: StepMeta) => starts.set(meta.index, Date.now()),
        afterStep: (meta: StepMeta, shared: any) => {
          if (!shared.__timings) shared.__timings = {};
          shared.__timings[meta.index] =
            Date.now() - (starts.get(meta.index) ?? Date.now());
          starts.delete(meta.index);
        },
      },
      filter,
    );
    return this;
  },
};
```

### Error interception (recover without re-throwing)

```typescript
export const withFallback: FlowneerPlugin = {
  withFallback(this: FlowBuilder<any, any>, fn: NodeFn, filter?: StepFilter) {
    (this as any)._setHooks(
      {
        wrapStep: async (meta, next, shared, params) => {
          try {
            await next();
          } catch (e) {
            if (e instanceof InterruptError) throw e; // always propagate cancellations
            shared.__fallbackError = {
              stepIndex: meta.index,
              message: String(e),
            };
            await fn(shared, params);
          }
        },
      },
      filter,
    );
    return this;
  },
};
```

### Feature flag / skip (dry-run)

```typescript
export const withDryRun: FlowneerPlugin = {
  withDryRun(this: FlowBuilder<any, any>) {
    (this as any)._setHooks({
      wrapStep: async (_meta, _next) => {
        /* no-op — skip step body */
      },
    });
    return this;
  },
};
```

### Per-step side-effect store (audit log pattern)

```typescript
export const withAuditLog: FlowneerPlugin = {
  withAuditLog(
    this: FlowBuilder<any, any>,
    store: AuditLogStore,
    filter?: StepFilter,
  ) {
    const clone = (v: unknown) => JSON.parse(JSON.stringify(v));
    (this as any)._setHooks(
      {
        afterStep: async (meta, shared) => {
          await store.append({
            stepIndex: meta.index,
            type: meta.type,
            timestamp: Date.now(),
            shared: clone(shared),
          });
        },
        onError: (meta, err, shared) => {
          store.append({
            stepIndex: meta.index,
            type: meta.type,
            timestamp: Date.now(),
            shared: clone(shared),
            error: err instanceof Error ? err.message : String(err),
          });
        },
      },
      filter,
    );
    return this;
  },
};
```

### Circuit breaker (state machine in closure)

```typescript
export const withCircuitBreaker: FlowneerPlugin = {
  withCircuitBreaker(
    this: FlowBuilder<any, any>,
    opts: CircuitBreakerOptions = {},
  ) {
    const { maxFailures = 3, resetMs = 30_000 } = opts;
    let consecutiveFailures = 0;
    let openedAt: number | null = null;
    (this as any)._setHooks({
      beforeStep: () => {
        if (openedAt !== null) {
          if (Date.now() - openedAt >= resetMs) {
            consecutiveFailures = 0;
            openedAt = null;
          } else
            throw new Error(
              `circuit open after ${consecutiveFailures} failures`,
            );
        }
      },
      afterStep: () => {
        consecutiveFailures = 0;
      },
      onError: () => {
        if (++consecutiveFailures >= maxFailures) openedAt = Date.now();
      },
    });
    return this;
  },
};
```

---

## Step 6 — Register a new step type (optional)

Use this when you need a first-class step type callable via `.myStep()` on the builder.

```typescript
import { CoreFlowBuilder, FlowBuilder } from "flowneer";
import type { StepHandler } from "flowneer";

// (1) Register the engine handler once at module load
const sleepHandler: StepHandler = async (step, ctx) => {
  await new Promise((r) => setTimeout(r, step.ms));
  // return undefined → continue; return "anchorName" → goto
};
CoreFlowBuilder.registerStepType("sleep", sleepHandler);

// (2) Builder method that pushes the step descriptor
export const withSleep: FlowneerPlugin = {
  sleep(this: any, ms: number, opts?: { label?: string }) {
    this._steps.push({ type: "sleep", ms, ...opts });
    return this;
  },
};

// (3) TypeScript declaration
declare module "flowneer" {
  interface FlowBuilder<S, P> {
    sleep(ms: number, opts?: { label?: string }): this;
  }
}
```

`ctx` in the handler provides: `shared`, `params`, `signal` (AbortSignal), `hooks`, `builder`.

For step types with nested sub-flows (like `loop`/`batch`), use `ctx.builder._runSub()` to execute the inner flow.

---

## Step 7 — Wire the plugin via `FlowBuilder.extend()`

```typescript
import { FlowBuilder } from "flowneer";
import { withMyPlugin } from "./plugins/myCategory/withMyPlugin";

// Creates a subclass — never mutates FlowBuilder.prototype
const AppFlow = FlowBuilder.extend([withMyPlugin]);

const flow = new AppFlow<MyState>()
  .withMyPlugin({ verbose: true }, ["llm:*"])
  .then(step1)
  .then(step2);
```

Layer multiple plugins:

```typescript
const AppFlow = FlowBuilder.extend([
  withCircuitBreaker,
  withTiming,
  withMyPlugin,
]);
```

---

## Step 8 — Export from the category index

```typescript
// plugins/myCategory/index.ts
export { withMyPlugin } from "./withMyPlugin";
export type { MyPluginOptions } from "./withMyPlugin";
```

---

## Validation Checklist

- [ ] Builder method returns `this` for chaining
- [ ] `declare module "../../Flowneer"` augments `FlowBuilder<S, P>` (not a concrete class)
- [ ] `InterruptError` re-thrown inside `wrapStep` catch blocks — never swallowed
- [ ] `_setHooks` called inside the builder method body, not at module load time
- [ ] Step-type handlers registered via `CoreFlowBuilder.registerStepType()` only once (module-level)
- [ ] Plugin exported from category `index.ts`
- [ ] Run `get_errors` on the file after editing
