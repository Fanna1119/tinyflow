import { registerFunction, param } from "../../registry";

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
    actions: ["default", "error"],
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
        success: response.ok,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : "Unknown error";
      return { output: null, success: false, error };
    }
  },
);
