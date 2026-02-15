import { registerFunction, param } from "../../registry";
import {
  withRetry,
  RETRY_POLICIES,
  type RetryPolicy,
} from "../../../runtime/retry";

interface RequestDescriptor {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  bodyKey?: string;
  parseJson?: boolean;
  retryPolicy?: string | RetryPolicy;
}

interface RequestResult {
  status: number | null;
  ok: boolean;
  data: unknown | null;
  error?: string;
}

registerFunction(
  {
    id: "http.batch",
    name: "HTTP Batch",
    description:
      "Makes multiple HTTP requests in parallel with concurrency limits and optional retry.",
    category: "HTTP",
    params: [
      param("requests", "object", {
        required: true,
        description:
          "Array of request descriptors or store key containing the array. Each descriptor: { url:string, method?:string, headers?:object, bodyKey?:string, parseJson?:boolean, retryPolicy?:string|object }",
      }),
      param("outputKey", "string", {
        required: false,
        default: "httpBatchResults",
        description: "Key to store array of request results",
      }),
      param("maxConcurrency", "number", {
        required: false,
        default: 10,
        description: "Maximum number of concurrent requests",
      }),
      param("retryPolicy", "object", {
        required: false,
        description:
          "Global retry policy (string from RETRY_POLICIES or custom object). Can be overridden per-request.",
      }),
    ],
    outputs: ["outputKey"],
    icon: "Globe",
    actions: ["default", "error"],
  },
  async (params, context) => {
    const requestsParam = params.requests as RequestDescriptor[] | string;
    const outputKey = (params.outputKey as string) ?? "httpBatchResults";
    const maxConcurrency = (params.maxConcurrency as number) ?? 10;
    const globalRetryPolicy = params.retryPolicy as
      | string
      | RetryPolicy
      | undefined;

    // Resolve requests array
    let requests: RequestDescriptor[];
    if (typeof requestsParam === "string") {
      const resolved = context.store.get(requestsParam);
      if (!Array.isArray(resolved)) {
        const error = `requests key "${requestsParam}" does not contain an array`;
        context.log(`HTTP Batch: ${error}`);
        return { output: null, success: false, error };
      }
      requests = resolved as RequestDescriptor[];
    } else if (Array.isArray(requestsParam)) {
      requests = requestsParam;
    } else {
      const error =
        "requests must be an array or a store key containing an array";
      context.log(`HTTP Batch: ${error}`);
      return { output: null, success: false, error };
    }

    if (requests.length === 0) {
      context.log("HTTP Batch: No requests to process");
      context.store.set(outputKey, []);
      return { output: [], success: true };
    }

    context.log(
      `HTTP Batch: Processing ${requests.length} requests with max concurrency ${maxConcurrency}`,
    );

    // Process requests in batches
    const results: RequestResult[] = [];
    const batches: RequestDescriptor[][] = [];

    // Split into batches
    for (let i = 0; i < requests.length; i += maxConcurrency) {
      batches.push(requests.slice(i, i + maxConcurrency));
    }

    // Process each batch
    for (const batch of batches) {
      const batchPromises = batch.map(async (req, index) => {
        const globalIndex = results.length + index;
        const result: RequestResult = { status: null, ok: false, data: null };

        try {
          // Resolve URL templates
          const resolvedUrl = req.url.replace(/\{\{(\w+)\}\}/g, (_, key) => {
            const value = context.store.get(key);
            return value !== undefined ? String(value) : `{{${key}}}`;
          });

          // Build request options
          const method = req.method ?? "GET";
          const headers = {
            "Content-Type": "application/json",
            ...req.headers,
          };
          const options: RequestInit = { method, headers };

          // Add body if specified
          if (req.bodyKey) {
            const body = context.store.get(req.bodyKey);
            options.body = JSON.stringify(body);
          }

          context.log(`[Request ${globalIndex}] ${method} ${resolvedUrl}`);

          // Determine retry policy
          let retryPolicy: RetryPolicy | undefined;
          if (req.retryPolicy) {
            if (typeof req.retryPolicy === "string") {
              retryPolicy = (RETRY_POLICIES as any)[req.retryPolicy];
              if (!retryPolicy) {
                throw new Error(`Unknown retry policy: ${req.retryPolicy}`);
              }
            } else {
              retryPolicy = req.retryPolicy as RetryPolicy;
            }
          } else if (globalRetryPolicy) {
            if (typeof globalRetryPolicy === "string") {
              retryPolicy = (RETRY_POLICIES as any)[globalRetryPolicy];
              if (!retryPolicy) {
                throw new Error(
                  `Unknown global retry policy: ${globalRetryPolicy}`,
                );
              }
            } else {
              retryPolicy = globalRetryPolicy;
            }
          }

          // Make the request
          const fetchFn = () => fetch(resolvedUrl, options);
          const response = retryPolicy
            ? await withRetry(fetchFn, retryPolicy)
            : await fetchFn();

          // Parse response
          const parseJson = req.parseJson ?? true;
          let data: unknown;
          if (parseJson) {
            data = await response.json();
          } else {
            data = await response.text();
          }

          result.status = response.status;
          result.ok = response.ok;
          result.data = data;

          context.log(
            `[Request ${globalIndex}] Response: ${response.status} ${response.ok ? "OK" : "FAILED"}`,
          );
        } catch (e) {
          const error = e instanceof Error ? e.message : "Unknown error";
          result.error = error;
          context.log(`[Request ${globalIndex}] Error: ${error}`);
        }

        return result;
      });

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    // Store results
    context.store.set(outputKey, results);

    // Check if all requests succeeded
    const allOk = results.every((r) => r.ok);
    const successCount = results.filter((r) => r.ok).length;
    context.log(
      `HTTP Batch: Completed ${successCount}/${requests.length} requests successfully`,
    );

    return {
      output: results,
      success: allOk,
      error: allOk
        ? undefined
        : `${requests.length - successCount} requests failed`,
    };
  },
);
