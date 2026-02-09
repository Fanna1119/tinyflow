import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "transform.double",
    name: "Double Number",
    description: "Doubles a number value.",
    category: "Transform",
    params: [
      param("currentItem", "number", {
        required: true,
        description: "Number to double",
      }),
    ],
    outputs: [],
    icon: "Calculator",
  },
  async (params, context) => {
    const currentItem = params.currentItem as number;
    const result = currentItem * 2;

    context.log(`Doubled ${currentItem} -> ${result}`);
    return { output: result, success: true };
  },
);
