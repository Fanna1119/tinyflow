/**
 * Built-in Functions: LLM
 * Language Model functions for agentic workflows
 */

import { registerFunction, param } from "../registry";

// ============================================================================
// LLM Chat
// ============================================================================

registerFunction(
  {
    id: "llm.chat",
    name: "LLM Chat",
    description:
      "Sends a prompt to an LLM (OpenAI-compatible) and returns the response.",
    category: "LLM",
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

// ============================================================================
// LLM JSON Chat (Structured Output)
// ============================================================================

registerFunction(
  {
    id: "llm.jsonChat",
    name: "LLM JSON Chat",
    description: "Sends a prompt to an LLM and parses the response as JSON.",
    category: "LLM",
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

// ============================================================================
// LLM Decide (Classification/Routing)
// ============================================================================

registerFunction(
  {
    id: "llm.decide",
    name: "LLM Decide",
    description:
      "Uses an LLM to make a decision/classification from given options. Returns an action for routing.",
    category: "LLM",
    params: [
      param("promptKey", "string", {
        required: true,
        description: "Key in store containing the context for decision",
      }),
      param("options", "array", {
        required: true,
        description: "Array of valid options/actions to choose from",
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store the decision result",
      }),
      param("model", "string", {
        required: false,
        default: "gpt-4o-mini",
        description: "Model to use",
      }),
      param("systemPrompt", "string", {
        required: false,
        description: "Additional context for decision making",
      }),
      param("simulate", "boolean", {
        required: false,
        default: false,
        description: "If true, returns first option without calling API",
      }),
    ],
    outputs: ["outputKey"],
    icon: "GitBranch",
  },
  async (params, context) => {
    const promptKey = params.promptKey as string;
    const options = params.options as string[];
    const outputKey = params.outputKey as string;
    const model = (params.model as string) ?? "gpt-4o-mini";
    const systemPrompt = params.systemPrompt as string | undefined;
    const simulate = (params.simulate as boolean) ?? false;

    const inputContext = context.store.get(promptKey) as string;

    if (!inputContext) {
      return {
        output: null,
        success: false,
        error: `No context found at key "${promptKey}"`,
      };
    }

    if (!options || options.length === 0) {
      return {
        output: null,
        success: false,
        error: "No options provided for decision",
      };
    }

    context.log(`LLM Decide: choosing from [${options.join(", ")}]`);

    // Simulation mode
    if (simulate) {
      const decision = options[0];
      context.store.set(outputKey, decision);
      context.log(`LLM Decision (simulated): ${decision}`);
      return { output: decision, action: decision, success: true };
    }

    const apiKey = context.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        output: null,
        success: false,
        error: "OPENAI_API_KEY not found in environment",
      };
    }

    const decisionPrompt = `Based on the following context, choose exactly ONE of these options: [${options.join(", ")}]

Context:
${inputContext}

${systemPrompt ? `Additional instructions: ${systemPrompt}\n\n` : ""}
Respond with ONLY the chosen option, nothing else.`;

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
              {
                role: "system",
                content:
                  "You are a decision-making assistant. Always respond with exactly one of the given options, nothing more.",
              },
              { role: "user", content: decisionPrompt },
            ],
            temperature: 0.1,
            max_tokens: 50,
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
      const rawDecision = data.choices[0]?.message?.content?.trim() ?? "";

      // Find matching option (case-insensitive)
      const decision =
        options.find(
          (opt) => opt.toLowerCase() === rawDecision.toLowerCase(),
        ) ?? options[0];

      context.store.set(outputKey, decision);
      context.log(`LLM Decision: ${decision}`);

      return { output: decision, action: decision, success: true };
    } catch (e) {
      return {
        output: null,
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
);
