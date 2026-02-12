/**
 * TinyFlow Dev Server Plugin
 * Provides API endpoints for workflow execution in development mode
 * All workflow execution happens server-side, never in the browser
 */

import type { Plugin, ViteDevServer } from "vite";
import { loadEnv } from "vite";
import type { IncomingMessage, ServerResponse } from "http";
import type { WorkflowDefinition } from "../schema/types";
import type { MockValue } from "../compiler";
import type { WorkflowTemplate, WorkflowPattern } from "../ui/templates/types";

// These will be dynamically imported to avoid bundling in client
let runtimeModule: typeof import("../runtime") | null = null;

// Server-side environment variables loaded from .env files
let serverEnv: Record<string, string> = {};

/** Absolute path to the templates directory */
let templatesDir: string = "";

/** Absolute path to the patterns directory */
let patternsDir: string = "";

async function getRuntime() {
  if (!runtimeModule) {
    runtimeModule = await import("../runtime");
  }
  return runtimeModule;
}

interface RunWorkflowRequest {
  workflow: WorkflowDefinition;
  env?: Record<string, string>;
  mockValues?: Record<string, MockValue>;
  /** When true, execution pauses before each node and waits for step-resume */
  stepMode?: boolean;
  /** When true, capture per-node performance metrics (time, memory, CPU) */
  profiling?: boolean;
}

interface NodeEvent {
  type:
    | "node_start"
    | "node_complete"
    | "node_profile"
    | "log"
    | "error"
    | "done"
    | "session"
    | "paused"
    | "stopped";
  nodeId?: string;
  params?: Record<string, unknown>;
  success?: boolean;
  output?: unknown;
  message?: string;
  sessionId?: string;
  profile?: import("../pocketflow/shared").NodeProfile;
  result?: {
    success: boolean;
    logs: string[];
    duration: number;
    store: Record<string, unknown>;
    error?: { nodeId: string; message: string };
  };
}

// ============================================================================
// Step-by-step Debug Session Management
// ============================================================================

interface DebugSession {
  /** Resolve function to resume execution at the current pause point */
  resolver: (() => void) | null;
  /** Whether the session has been stopped/cancelled */
  stopped: boolean;
  /** SSE response for sending events */
  res: ServerResponse;
}

/** Active debug sessions keyed by session ID */
const debugSessions = new Map<string, DebugSession>();

let sessionCounter = 0;
function createSessionId(): string {
  return `dbg_${Date.now()}_${++sessionCounter}`;
}

/**
 * Parse JSON body from request
 */
async function parseJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body) as T);
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

/**
 * Send SSE event
 */
function sendSSE(res: ServerResponse, event: NodeEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * TinyFlow dev server plugin for Vite
 * Handles workflow execution server-side
 */
export function tinyflowDevServer(): Plugin {
  return {
    name: "tinyflow-dev-server",
    config(config, { mode }) {
      // Load all env vars from .env files (not just VITE_ prefixed)
      // The empty prefix '' means load ALL env vars
      serverEnv = loadEnv(mode, process.cwd(), "");
      console.log("[TinyFlow] Loaded env vars from .env files");
      console.log(
        "[TinyFlow] OPENAI_API_KEY:",
        serverEnv.OPENAI_API_KEY
          ? "configured (" + serverEnv.OPENAI_API_KEY.substring(0, 10) + "...)"
          : "NOT SET",
      );
    },
    configureServer(server: ViteDevServer) {
      console.log("[TinyFlow] Server initialized");
      // Add middleware for API endpoints
      server.middlewares.use(async (req, res, next) => {
        // Handle CORS preflight
        if (req.method === "OPTIONS") {
          res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          });
          res.end();
          return;
        }

        // GET /api/env-vars - Get masked environment variables for UI display
        if (req.method === "GET" && req.url === "/api/env-vars") {
          const vars: Array<{ key: string; masked: string }> = [];

          for (const [key, value] of Object.entries(serverEnv)) {
            if (
              typeof value === "string" &&
              (key.startsWith("OPENAI_") || key.startsWith("VITE_"))
            ) {
              // Mask sensitive values
              let masked: string;
              if (value.length <= 8) {
                masked = "•".repeat(value.length);
              } else {
                masked =
                  value.slice(0, 4) +
                  "•".repeat(Math.min(value.length - 4, 20)) +
                  value.slice(-4);
              }
              vars.push({ key, masked });
            }
          }

          vars.sort((a, b) => a.key.localeCompare(b.key));
          sendJson(res, { vars });
          return;
        }

        // POST /api/run-workflow - Execute workflow with streaming events
        if (req.method === "POST" && req.url === "/api/run-workflow") {
          try {
            const body = await parseJsonBody<RunWorkflowRequest>(req);
            const { runWorkflow } = await getRuntime();

            // Set up SSE for streaming events
            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
              "Access-Control-Allow-Origin": "*",
            });

            // Convert mockValues object to Map if provided
            let mockValuesMap: Map<string, MockValue> | undefined;
            if (body.mockValues) {
              mockValuesMap = new Map(Object.entries(body.mockValues));
            }

            // Use env vars loaded from .env files (filtered to OPENAI_ and VITE_)
            const envForRuntime: Record<string, string> = {};
            for (const [key, value] of Object.entries(serverEnv)) {
              if (
                typeof value === "string" &&
                (key.startsWith("OPENAI_") || key.startsWith("VITE_"))
              ) {
                envForRuntime[key] = value;
              }
            }

            // Set up step-by-step session if stepMode is enabled
            let sessionId: string | undefined;
            let session: DebugSession | undefined;
            let onBeforeNode: ((nodeId: string) => Promise<void>) | undefined;

            if (body.stepMode) {
              sessionId = createSessionId();
              session = { resolver: null, stopped: false, res };
              debugSessions.set(sessionId, session);

              // Send session ID to client so it can send step-resume requests
              sendSSE(res, { type: "session", sessionId });

              // Clean up session on client disconnect
              req.on("close", () => {
                const s = debugSessions.get(sessionId!);
                if (s) {
                  s.stopped = true;
                  // Unblock any pending pause so the runtime can exit
                  if (s.resolver) {
                    s.resolver();
                    s.resolver = null;
                  }
                  debugSessions.delete(sessionId!);
                }
              });

              // onBeforeNode pauses execution until the client sends a step-resume
              onBeforeNode = (nodeId: string) => {
                return new Promise<void>((resolve, reject) => {
                  const s = debugSessions.get(sessionId!);
                  if (!s || s.stopped) {
                    reject(new Error("Debug session stopped"));
                    return;
                  }
                  // Tell the client we are paused before this node
                  sendSSE(res, { type: "paused", nodeId });
                  // Store the resolver — POST /api/debug-step will call it
                  s.resolver = resolve;
                });
              };

              console.log(`[TinyFlow] Debug session started: ${sessionId}`);
            }

            // Execute workflow with callbacks that stream events
            const result = await runWorkflow(body.workflow, {
              env: { ...envForRuntime, ...body.env },
              mockValues: mockValuesMap,
              profiling: body.profiling,
              onBeforeNode,
              onNodeStart: (nodeId, params) => {
                sendSSE(res, { type: "node_start", nodeId, params });
              },
              onNodeComplete: (nodeId, success, output) => {
                sendSSE(res, {
                  type: "node_complete",
                  nodeId,
                  success,
                  output,
                });
              },
              onNodeProfile: body.profiling
                ? (nodeId, profile) => {
                    sendSSE(res, { type: "node_profile", nodeId, profile });
                  }
                : undefined,
              onLog: (message) => {
                sendSSE(res, { type: "log", message });
              },
              onError: (nodeId, message) => {
                sendSSE(res, { type: "error", nodeId, message });
              },
            });

            // Clean up debug session
            if (sessionId) {
              debugSessions.delete(sessionId);
              console.log(`[TinyFlow] Debug session ended: ${sessionId}`);
            }

            // Send final result
            sendSSE(res, {
              type: "done",
              result: {
                success: result.success,
                logs: result.logs,
                duration: result.duration,
                store: Object.fromEntries(result.store.data),
                error: result.error,
              },
            });

            res.end();
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            // If the SSE headers were already sent we can't sendJson,
            // so try sending an SSE error event and ending the stream
            if (res.headersSent) {
              sendSSE(res, { type: "error", message });
              res.end();
            } else {
              sendJson(res, { error: message }, 500);
            }
          }
          return;
        }

        // POST /api/run-workflow-simple - Execute workflow without streaming
        if (req.method === "POST" && req.url === "/api/run-workflow-simple") {
          try {
            const body = await parseJsonBody<RunWorkflowRequest>(req);
            const { runWorkflow } = await getRuntime();

            // Convert mockValues object to Map if provided
            let mockValuesMap: Map<string, MockValue> | undefined;
            if (body.mockValues) {
              mockValuesMap = new Map(Object.entries(body.mockValues));
            }

            // Use env vars loaded from .env files (filtered to OPENAI_ and VITE_)
            const envForRuntime: Record<string, string> = {};
            for (const [key, value] of Object.entries(serverEnv)) {
              if (
                typeof value === "string" &&
                (key.startsWith("OPENAI_") || key.startsWith("VITE_"))
              ) {
                envForRuntime[key] = value;
              }
            }

            const result = await runWorkflow(body.workflow, {
              env: { ...envForRuntime, ...body.env },
              mockValues: mockValuesMap,
            });

            sendJson(res, {
              success: result.success,
              logs: result.logs,
              duration: result.duration,
              store: Object.fromEntries(result.store.data),
              error: result.error,
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            sendJson(res, { error: message }, 500);
          }
          return;
        }

        // POST /api/debug-step - Resume a paused debug session (advance one step)
        if (req.method === "POST" && req.url === "/api/debug-step") {
          try {
            const body = await parseJsonBody<{ sessionId: string }>(req);
            const session = debugSessions.get(body.sessionId);

            if (!session) {
              sendJson(
                res,
                { error: "Session not found or already ended" },
                404,
              );
              return;
            }

            if (session.resolver) {
              const resolver = session.resolver;
              session.resolver = null;
              resolver();
              sendJson(res, { ok: true });
            } else {
              sendJson(res, { ok: true, message: "Not currently paused" });
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            sendJson(res, { error: message }, 500);
          }
          return;
        }

        // POST /api/debug-stop - Stop/cancel a debug session mid-run
        if (req.method === "POST" && req.url === "/api/debug-stop") {
          try {
            const body = await parseJsonBody<{ sessionId: string }>(req);
            const session = debugSessions.get(body.sessionId);

            if (!session) {
              sendJson(
                res,
                { error: "Session not found or already ended" },
                404,
              );
              return;
            }

            // Mark stopped and unblock the paused runtime
            session.stopped = true;
            if (session.resolver) {
              session.resolver();
              session.resolver = null;
            }

            // Send stopped event to SSE stream
            sendSSE(session.res, { type: "stopped" });

            debugSessions.delete(body.sessionId);
            console.log(`[TinyFlow] Debug session stopped: ${body.sessionId}`);

            sendJson(res, { ok: true });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            sendJson(res, { error: message }, 500);
          }
          return;
        }

        // POST /api/debug-snapshot - Take a V8 heap snapshot on-demand
        if (req.method === "POST" && req.url === "/api/debug-snapshot") {
          try {
            const v8 = await import("v8");
            const fs = await import("fs/promises");
            const path = await import("path");
            const { Writable } = await import("stream");

            const snapshotDir = path.join(process.cwd(), ".tinyflow-snapshots");
            await fs.mkdir(snapshotDir, { recursive: true });

            const filename = `heap-${Date.now()}.heapsnapshot`;
            const filePath = path.join(snapshotDir, filename);

            // Write heap snapshot using the stream API
            const snapshotStream = v8.writeHeapSnapshot(filePath);

            sendJson(res, {
              success: true,
              file: filename,
              path: snapshotStream, // v8.writeHeapSnapshot returns the filepath
              sizeHint: "Check .tinyflow-snapshots/ for the file",
            });

            console.log(`[TinyFlow] Heap snapshot written: ${snapshotStream}`);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            sendJson(res, { error: message }, 500);
          }
          return;
        }

        // POST /api/build-bundle - Build workflow bundle to dist folder
        if (req.method === "POST" && req.url === "/api/build-bundle") {
          try {
            const body = await parseJsonBody<{
              options: import("../bundle/types").BundleOptions;
              outputDir: string;
            }>(req);

            const { buildBundle } = await import("../bundle/builder");
            const fs = await import("fs/promises");
            const path = await import("path");

            const result = await buildBundle(body.options);

            if (!result.success || !result.files) {
              sendJson(
                res,
                { success: false, error: result.error || "Build failed" },
                400,
              );
              return;
            }

            // Create output directory
            const outputPath = path.join(process.cwd(), "dist", body.outputDir);
            await fs.mkdir(outputPath, { recursive: true });

            // Write all files
            const writtenFiles: string[] = [];
            for (const [filename, content] of Object.entries(result.files)) {
              const filePath = path.join(outputPath, filename);
              await fs.writeFile(filePath, content, "utf-8");
              writtenFiles.push(filename);
            }

            sendJson(res, {
              success: true,
              outputDir: path.relative(process.cwd(), outputPath),
              files: writtenFiles,
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            sendJson(res, { error: message }, 500);
          }
          return;
        }

        // GET /api/templates - List all templates from the templates directory
        if (req.method === "GET" && req.url === "/api/templates") {
          try {
            const fs = await import("fs/promises");
            const path = await import("path");
            const dir = templatesDir || path.join(process.cwd(), "templates");
            templatesDir = dir;

            // Ensure directory exists
            await fs.mkdir(dir, { recursive: true });

            const files = await fs.readdir(dir);
            const jsonFiles = files.filter((f) => f.endsWith(".json"));

            const templates: WorkflowTemplate[] = [];
            for (const file of jsonFiles) {
              try {
                const content = await fs.readFile(
                  path.join(dir, file),
                  "utf-8",
                );
                const raw = JSON.parse(content) as Record<string, unknown>;
                // Normalize template: support both old format (top-level fields)
                // and new format (metadata section + flow.startNodeId)
                const metadata =
                  (raw.metadata as Record<string, unknown>) ?? {};
                const flow = (raw.flow as Record<string, unknown>) ?? {};
                const template: WorkflowTemplate = {
                  id: raw.id as string,
                  name: raw.name as string,
                  description: (raw.description as string) ?? "",
                  category: (raw.category ??
                    metadata.category ??
                    "Patterns") as WorkflowTemplate["category"],
                  icon: (raw.icon ?? metadata.icon ?? "Box") as string,
                  difficulty: (raw.difficulty ??
                    metadata.difficulty ??
                    "beginner") as WorkflowTemplate["difficulty"],
                  tags: (raw.tags ?? metadata.tags ?? []) as string[],
                  nodes: raw.nodes as WorkflowTemplate["nodes"],
                  edges: raw.edges as WorkflowTemplate["edges"],
                  startNodeId: (raw.startNodeId ??
                    flow.startNodeId ??
                    "start") as string,
                };
                templates.push(template);
              } catch {
                console.warn(
                  `[TinyFlow] Skipping invalid template file: ${file}`,
                );
              }
            }

            sendJson(res, { templates });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            sendJson(res, { error: message }, 500);
          }
          return;
        }

        // POST /api/templates - Save a new template to the templates directory
        if (req.method === "POST" && req.url === "/api/templates") {
          try {
            const fs = await import("fs/promises");
            const path = await import("path");
            const dir = templatesDir || path.join(process.cwd(), "templates");
            templatesDir = dir;

            const template = await parseJsonBody<WorkflowTemplate>(req);

            // Validate required fields
            if (!template.id || !template.name || !template.nodes) {
              sendJson(
                res,
                { error: "Template must have id, name, and nodes" },
                400,
              );
              return;
            }

            // Sanitize filename from template id
            const safeId = template.id.replace(/[^a-zA-Z0-9_-]/g, "-");
            const filePath = path.join(dir, `${safeId}.json`);

            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(
              filePath,
              JSON.stringify(template, null, 2),
              "utf-8",
            );

            console.log(`[TinyFlow] Template saved: ${safeId}.json`);
            sendJson(res, { success: true, id: template.id });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            sendJson(res, { error: message }, 500);
          }
          return;
        }

        // DELETE /api/templates?id=<template-id> - Remove a template
        if (req.method === "DELETE" && req.url?.startsWith("/api/templates?")) {
          try {
            const fs = await import("fs/promises");
            const path = await import("path");
            const dir = templatesDir || path.join(process.cwd(), "templates");
            templatesDir = dir;

            const url = new URL(req.url, `http://${req.headers.host}`);
            const id = url.searchParams.get("id");
            if (!id) {
              sendJson(res, { error: "Missing id parameter" }, 400);
              return;
            }

            const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "-");
            const filePath = path.join(dir, `${safeId}.json`);

            await fs.unlink(filePath);
            console.log(`[TinyFlow] Template deleted: ${safeId}.json`);
            sendJson(res, { success: true });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            if (message.includes("ENOENT")) {
              sendJson(res, { error: "Template not found" }, 404);
            } else {
              sendJson(res, { error: message }, 500);
            }
          }
          return;
        }

        // ==================================================================
        // Pattern API — CRUD for reusable sub-graph patterns
        // ==================================================================

        // GET /api/patterns - List all patterns from the patterns directory
        if (req.method === "GET" && req.url === "/api/patterns") {
          try {
            const fs = await import("fs/promises");
            const path = await import("path");
            const dir = patternsDir || path.join(process.cwd(), "patterns");
            patternsDir = dir;

            await fs.mkdir(dir, { recursive: true });

            const files = await fs.readdir(dir);
            const jsonFiles = files.filter((f) => f.endsWith(".json"));

            const patterns: WorkflowPattern[] = [];
            for (const file of jsonFiles) {
              try {
                const content = await fs.readFile(
                  path.join(dir, file),
                  "utf-8",
                );
                const pattern = JSON.parse(content) as WorkflowPattern;
                patterns.push(pattern);
              } catch {
                console.warn(
                  `[TinyFlow] Skipping invalid pattern file: ${file}`,
                );
              }
            }

            sendJson(res, { patterns });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            sendJson(res, { error: message }, 500);
          }
          return;
        }

        // POST /api/patterns - Save a new pattern
        if (req.method === "POST" && req.url === "/api/patterns") {
          try {
            const fs = await import("fs/promises");
            const path = await import("path");
            const dir = patternsDir || path.join(process.cwd(), "patterns");
            patternsDir = dir;

            const pattern = await parseJsonBody<WorkflowPattern>(req);

            if (!pattern.id || !pattern.name || !pattern.nodes) {
              sendJson(
                res,
                { error: "Pattern must have id, name, and nodes" },
                400,
              );
              return;
            }

            const safeId = pattern.id.replace(/[^a-zA-Z0-9_-]/g, "-");
            const filePath = path.join(dir, `${safeId}.json`);

            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(
              filePath,
              JSON.stringify(pattern, null, 2),
              "utf-8",
            );

            console.log(`[TinyFlow] Pattern saved: ${safeId}.json`);
            sendJson(res, { success: true, id: pattern.id });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            sendJson(res, { error: message }, 500);
          }
          return;
        }

        // DELETE /api/patterns?id=<pattern-id> - Remove a pattern
        if (req.method === "DELETE" && req.url?.startsWith("/api/patterns?")) {
          try {
            const fs = await import("fs/promises");
            const path = await import("path");
            const dir = patternsDir || path.join(process.cwd(), "patterns");
            patternsDir = dir;

            const url = new URL(req.url, `http://${req.headers.host}`);
            const id = url.searchParams.get("id");
            if (!id) {
              sendJson(res, { error: "Missing id parameter" }, 400);
              return;
            }

            const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "-");
            const filePath = path.join(dir, `${safeId}.json`);

            await fs.unlink(filePath);
            console.log(`[TinyFlow] Pattern deleted: ${safeId}.json`);
            sendJson(res, { success: true });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            if (message.includes("ENOENT")) {
              sendJson(res, { error: "Pattern not found" }, 404);
            } else {
              sendJson(res, { error: message }, 500);
            }
          }
          return;
        }

        next();
      });
    },
  };
}
