import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "llm.chat",
    name: "LLM Chat",
    description:
      "Sends a prompt to an LLM (OpenAI-compatible) and returns the response.",
    category: "LLM",
    runtimeDependencies: ["openai@^4.0.0"],
    params: [
      param("promptKey", "string", {
        required: true,
        description: "Key in store containing the prompt text",
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store the LLM response",
      }),
      param("model", "string", {
        required: false,
        default: "gpt-4o-mini",
        description: "Model to use (e.g., gpt-4o, gpt-4o-mini, gpt-3.5-turbo)",
      }),
      param("systemPrompt", "string", {
        required: false,
        description: "System prompt to set context for the LLM",
      }),
      param("temperature", "number", {
        required: false,
        default: 0.7,
        description: "Temperature for response randomness (0-2)",
      }),
      param("maxTokens", "number", {
        required: false,
        description: "Maximum tokens in response",
      }),
      param("simulate", "boolean", {
        required: false,
        default: false,
        description:
          "If true, returns a simulated response without calling API",
      }),
    ],
    outputs: ["outputKey"],
    icon: "Brain",
  },
  async (params, context) => {
    const promptKey = params.promptKey as string;
    const outputKey = params.outputKey as string;
    const model = (params.model as string) ?? "gpt-4o-mini";
    const systemPrompt = params.systemPrompt as string | undefined;
    const temperature = (params.temperature as number) ?? 0.7;
    const maxTokens = params.maxTokens as number | undefined;
    const simulate = (params.simulate as boolean) ?? false;

    const prompt = context.store.get(promptKey) as string;

    if (!prompt) {
      return {
        output: null,
        success: false,
        error: `No prompt found at key "${promptKey}"`,
      };
    }

    context.log(`LLM Chat: ${prompt.substring(0, 50)}...`);

    // Simulation mode for testing without API
    if (simulate) {
      const simulatedResponse = `[Simulated LLM Response] Received prompt: "${prompt.substring(0, 100)}..."`;
      context.store.set(outputKey, simulatedResponse);
      context.log("LLM (simulated) response stored");
      return { output: simulatedResponse, success: true };
    }

    // Get API key from environment
    const apiKey = context.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        output: null,
        success: false,
        error: "OPENAI_API_KEY not found in environment",
      };
    }

    // Build messages array
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature,
            ...(maxTokens && { max_tokens: maxTokens }),
          }),
        },
      );

      if (!response.ok) {
        const error = await response.text();
        return { output: null, success: false, error: `API error: ${error}` };
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      const content = data.choices[0]?.message?.content ?? "";

      context.store.set(outputKey, content);
      context.log(`LLM response stored (${content.length} chars)`);

      return { output: content, success: true };
    } catch (e) {
      return {
        output: null,
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
);
