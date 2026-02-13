import { registerFunction, param } from "../../registry";

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
    actions: ["default", "error"],
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
        success: response.ok,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : "Unknown error";
      return { output: null, success: false, error };
    }
  },
);
