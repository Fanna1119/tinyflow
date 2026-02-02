/**
 * Built-in Functions: HTTP
 * HTTP request functions
 */

import { registerFunction, param } from "../registry";

// ============================================================================
// HTTP Request
// ============================================================================

registerFunction(
  {
    id: "http.request",
    name: "HTTP Request",
    description: "Makes an HTTP request to an external API.",
    category: "HTTP",
    params: [
      param("url", "string", {
        required: true,
        description: "Request URL",
      }),
      param("method", "string", {
        required: false,
        default: "GET",
        description: "HTTP method (GET, POST, PUT, DELETE, PATCH)",
      }),
      param("headers", "object", {
        required: false,
        description: "Request headers",
      }),
      param("bodyKey", "string", {
        required: false,
        description: "Key in store containing request body",
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store response",
      }),
      param("parseJson", "boolean", {
        required: false,
        default: true,
        description: "Whether to parse response as JSON",
      }),
    ],
    outputs: ["outputKey"],
    icon: "Globe",
  },
  async (params, context) => {
    const url = params.url as string;
    const method = (params.method as string) ?? "GET";
    const headers = (params.headers as Record<string, string>) ?? {};
    const bodyKey = params.bodyKey as string | undefined;
    const outputKey = params.outputKey as string;
    const parseJson = (params.parseJson as boolean) ?? true;

    // Resolve URL template variables
    const resolvedUrl = url.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = context.store.get(key);
      return value !== undefined ? String(value) : `{{${key}}}`;
    });

    // Build request options
    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    // Add body if specified
    if (bodyKey) {
      const body = context.store.get(bodyKey);
      options.body = JSON.stringify(body);
    }

    context.log(`HTTP ${method} ${resolvedUrl}`);

    try {
      const response = await fetch(resolvedUrl, options);

      let data: unknown;
      if (parseJson) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      const result = {
        status: response.status,
        ok: response.ok,
        data,
      };

      context.store.set(outputKey, result);
      context.log(
        `Response: ${response.status} ${response.ok ? "OK" : "FAILED"}`,
      );

      return {
        output: result,
        action: response.ok ? "success" : "error",
        success: response.ok,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : "Unknown error";
      context.log(`HTTP Error: ${error}`);
      return { output: null, success: false, error };
    }
  },
);

// ============================================================================
// HTTP GET (Convenience)
// ============================================================================

registerFunction(
  {
    id: "http.get",
    name: "HTTP GET",
    description: "Simplified GET request.",
    category: "HTTP",
    params: [
      param("url", "string", {
        required: true,
        description: "Request URL",
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store response data",
      }),
      param("headers", "object", {
        required: false,
        description: "Request headers",
      }),
    ],
    outputs: ["outputKey"],
    icon: "Download",
  },
  async (params, context) => {
    const url = params.url as string;
    const outputKey = params.outputKey as string;
    const headers = (params.headers as Record<string, string>) ?? {};

    // Resolve URL template variables
    const resolvedUrl = url.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = context.store.get(key);
      return value !== undefined ? String(value) : `{{${key}}}`;
    });

    context.log(`HTTP GET ${resolvedUrl}`);

    try {
      const response = await fetch(resolvedUrl, { headers });
      const data = await response.json();

      context.store.set(outputKey, data);
      context.log(`GET successful: ${response.status}`);

      return {
        output: data,
        action: response.ok ? "success" : "error",
        success: response.ok,
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : "Unknown error";
      return { output: null, success: false, error };
    }
  },
);

// ============================================================================
// HTTP POST (Convenience)
// ============================================================================

registerFunction(
  {
    id: "http.post",
    name: "HTTP POST",
    description: "Simplified POST request.",
    category: "HTTP",
    params: [
      param("url", "string", {
        required: true,
        description: "Request URL",
      }),
      param("bodyKey", "string", {
        required: true,
        description: "Key in store containing request body",
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store response data",
      }),
      param("headers", "object", {
        required: false,
        description: "Request headers",
      }),
    ],
    outputs: ["outputKey"],
    icon: "Upload",
  },
  async (params, context) => {
    const url = params.url as string;
    const bodyKey = params.bodyKey as string;
    const outputKey = params.outputKey as string;
    const headers = (params.headers as Record<string, string>) ?? {};

    const body = context.store.get(bodyKey);

    context.log(`HTTP POST ${url}`);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      context.store.set(outputKey, data);
      context.log(`POST successful: ${response.status}`);

      return {
        output: data,
        action: response.ok ? "success" : "error",
        success: response.ok,
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : "Unknown error";
      return { output: null, success: false, error };
    }
  },
);

// ============================================================================
// Webhook Trigger
// ============================================================================

registerFunction(
  {
    id: "http.webhook",
    name: "Webhook Trigger",
    description:
      "Receives HTTP webhook data and initializes the workflow with it.",
    category: "HTTP",
    params: [
      param("outputKey", "string", {
        required: true,
        description: "Key to store webhook payload",
      }),
      param("method", "string", {
        required: false,
        default: "POST",
        description: "Expected HTTP method (GET, POST, PUT)",
      }),
      param("validateSecret", "boolean", {
        required: false,
        default: false,
        description: "Whether to validate webhook secret",
      }),
      param("secretKey", "string", {
        required: false,
        description: "Environment key for webhook secret",
      }),
    ],
    outputs: ["outputKey"],
    icon: "Webhook",
  },
  async (params, context) => {
    const outputKey = params.outputKey as string;
    const method = (params.method as string) ?? "POST";
    const validateSecret = (params.validateSecret as boolean) ?? false;
    const secretKey = params.secretKey as string | undefined;

    // In a real webhook scenario, the payload would come from the incoming request
    // For now, we look for it in the store's initial data or context
    const webhookPayload = context.store.get("__webhook_payload") ?? {};

    context.log(
      `Webhook trigger activated (method: ${method}, validate: ${validateSecret})`,
    );

    // Validate secret if required
    if (validateSecret && secretKey) {
      const expectedSecret = context.env[secretKey];
      const providedSecret = (webhookPayload as Record<string, unknown>)
        ?.secret;

      if (!expectedSecret || providedSecret !== expectedSecret) {
        context.log("Webhook secret validation failed");
        return {
          output: null,
          success: false,
          error: "Invalid webhook secret",
        };
      }
    }

    // Store webhook payload
    context.store.set(outputKey, webhookPayload);
    context.log(`Webhook payload stored in ${outputKey}`);

    return {
      output: webhookPayload,
      success: true,
      action: "default",
    };
  },
);
