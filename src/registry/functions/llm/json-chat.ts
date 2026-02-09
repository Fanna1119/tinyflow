import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "llm.jsonChat",
    name: "LLM JSON Chat",
    description: "Sends a prompt to an LLM and parses the response as JSON.",
    category: "LLM",
    runtimeDependencies: ["openai@^4.0.0"],
    params: [
      param("promptKey", "string", {
        required: true,
        description: "Key in store containing the prompt text",
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store the parsed JSON response",
      }),
      param("model", "string", {
        required: false,
        default: "gpt-4o-mini",
        description: "Model to use",
      }),
      param("systemPrompt", "string", {
        required: false,
        default:
          "You are a helpful assistant. Always respond with valid JSON only, no markdown.",
        description: "System prompt (should instruct JSON output)",
      }),
      param("temperature", "number", {
        required: false,
        default: 0.3,
        description: "Temperature (lower is more deterministic for JSON)",
      }),
      param("simulate", "boolean", {
        required: false,
        default: false,
        description: "If true, returns simulated JSON without calling API",
      }),
    ],
    outputs: ["outputKey"],
    icon: "Braces",
  },
  async (params, context) => {
    const promptKey = params.promptKey as string;
    const outputKey = params.outputKey as string;
    const model = (params.model as string) ?? "gpt-4o-mini";
    const systemPrompt =
      (params.systemPrompt as string) ??
      "You are a helpful assistant. Always respond with valid JSON only, no markdown.";
    const temperature = (params.temperature as number) ?? 0.3;
    const simulate = (params.simulate as boolean) ?? false;

    const prompt = context.store.get(promptKey) as string;

    if (!prompt) {
      return {
        output: null,
        success: false,
        error: `No prompt found at key "${promptKey}"`,
      };
    }

    context.log(`LLM JSON Chat: ${prompt.substring(0, 50)}...`);

    // Simulation mode
    if (simulate) {
      const simulatedJson = {
        status: "simulated",
        prompt: prompt.substring(0, 50),
      };
      context.store.set(outputKey, simulatedJson);
      context.log("LLM JSON (simulated) response stored");
      return { output: simulatedJson, success: true };
    }

    const apiKey = context.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        output: null,
        success: false,
        error: "OPENAI_API_KEY not found in environment",
      };
    }

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
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: prompt },
            ],
            temperature,
            response_format: { type: "json_object" },
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
      const content = data.choices[0]?.message?.content ?? "{}";

      // Parse JSON response
      const parsed = JSON.parse(content);
      context.store.set(outputKey, parsed);
      context.log(`LLM JSON response stored`);

      return { output: parsed, success: true };
    } catch (e) {
      return {
        output: null,
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
);
