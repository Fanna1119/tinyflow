import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "http.webhook",
    name: "Webhook Trigger",
    description:
      "Receives HTTP webhook data and initializes the workflow with it.",
    category: "HTTP",
    params: [
      param("url", "string", {
        required: false,
        default: "/",
        description: "Webhook URL path to listen on",
      }),
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
    const url = (params.url as string) ?? "/";
    const outputKey = params.outputKey as string;
    const method = (params.method as string) ?? "POST";
    const validateSecret = (params.validateSecret as boolean) ?? false;
    const secretKey = params.secretKey as string | undefined;

    // In a real webhook scenario, the payload would come from the incoming request
    // For now, we look for it in the store's initial data or context
    const webhookPayload = context.store.get("__webhook_payload") ?? {};

    context.log(
      `Webhook trigger activated for ${method} ${url} (validate: ${validateSecret})`,
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
