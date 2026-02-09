import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "control.condition",
    name: "Condition",
    description: "Evaluates a condition and returns success or error action.",
    category: "Control",
    params: [
      param("leftKey", "string", {
        required: true,
        description: "Key for left side value",
      }),
      param("operator", "string", {
        required: true,
        description:
          "Comparison operator (eq, ne, gt, lt, gte, lte, truthy, falsy)",
      }),
      param("rightValue", "object", {
        required: false,
        description: "Right side value (not needed for truthy/falsy)",
      }),
    ],
    outputs: [],
    icon: "GitFork",
  },
  async (params, context) => {
    const leftKey = params.leftKey as string;
    const operator = params.operator as string;
    const rightValue = params.rightValue;
    const leftValue = context.store.get(leftKey);

    let result = false;
    switch (operator) {
      case "eq":
        result = leftValue === rightValue;
        break;
      case "ne":
        result = leftValue !== rightValue;
        break;
      case "gt":
        result = (leftValue as number) > (rightValue as number);
        break;
      case "lt":
        result = (leftValue as number) < (rightValue as number);
        break;
      case "gte":
        result = (leftValue as number) >= (rightValue as number);
        break;
      case "lte":
        result = (leftValue as number) <= (rightValue as number);
        break;
      case "truthy":
        result = Boolean(leftValue);
        break;
      case "falsy":
        result = !leftValue;
        break;
    }

    context.log(`Condition: ${leftKey} ${operator} ${rightValue} = ${result}`);
    return {
      output: result,
      action: result ? "success" : "error",
      success: true,
    };
  },
);
