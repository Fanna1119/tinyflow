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

// These will be dynamically imported to avoid bundling in client
let runtimeModule: typeof import("../runtime") | null = null;

// Server-side environment variables loaded from .env files
let serverEnv: Record<string, string> = {};

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
}

interface NodeEvent {
  type: "node_start" | "node_complete" | "log" | "error" | "done";
  nodeId?: string;
  params?: Record<string, unknown>;
  success?: boolean;
  output?: unknown;
  message?: string;
  result?: {
    success: boolean;
    logs: string[];
    duration: number;
    store: Record<string, unknown>;
    error?: { nodeId: string; message: string };
  };
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
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

            // Execute workflow with callbacks that stream events
            const result = await runWorkflow(body.workflow, {
              env: { ...envForRuntime, ...body.env },
              mockValues: mockValuesMap,
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
              onLog: (message) => {
                sendSSE(res, { type: "log", message });
              },
              onError: (nodeId, message) => {
                sendSSE(res, { type: "error", nodeId, message });
              },
            });

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
            sendJson(res, { error: message }, 500);
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

        next();
      });
    },
  };
}
