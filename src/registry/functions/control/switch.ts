import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "control.switch",
    name: "Switch",
    description: "Routes to different paths based on a value.",
    category: "Control",
    params: [
      param("key", "string", {
        required: true,
        description: "Key to read value from",
      }),
      param("cases", "object", {
        required: true,
        description: "Object mapping values to action names",
      }),
      param("default", "string", {
        required: false,
        default: "default",
        description: "Action if no case matches",
      }),
    ],
    outputs: [],
    icon: "Route",
  },
  async (params, context) => {
    const key = params.key as string;
    const cases = params.cases as Record<string, string>;
    const defaultAction = (params.default as string) ?? "default";
    const value = String(context.store.get(key));

    const action = cases[value] ?? defaultAction;
    context.log(`Switch on "${key}" = "${value}" -> action: ${action}`);
    return { output: value, action, success: true };
  },
);
