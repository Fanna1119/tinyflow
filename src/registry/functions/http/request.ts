import { registerFunction, param } from "../../registry";

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
    actions: ["default", "error"],
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
