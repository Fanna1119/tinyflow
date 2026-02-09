import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "llm.decide",
    name: "LLM Decide",
    description:
      "Uses an LLM to make a decision/classification from given options. Returns an action for routing.",
    category: "LLM",
    runtimeDependencies: ["openai@^4.0.0"],
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
