import { registerFunction, param } from "../../registry";

registerFunction(
  {
    id: "control.counter",
    name: "Counter",
    description: "Maintains a counter, useful for loops.",
    category: "Control",
    params: [
      param("counterKey", "string", {
        required: true,
        description: "Key to store counter",
      }),
      param("operation", "string", {
        required: true,
        description: "Operation: init, increment, decrement",
      }),
      param("initialValue", "number", {
        required: false,
        default: 0,
        description: "Initial value for init operation",
      }),
      param("step", "number", {
        required: false,
        default: 1,
        description: "Step value for increment/decrement",
      }),
    ],
    outputs: ["counterKey"],
    icon: "Hash",
  },
  async (params, context) => {
    const counterKey = params.counterKey as string;
    const operation = params.operation as string;
    const initialValue = (params.initialValue as number) ?? 0;
    const step = (params.step as number) ?? 1;

    let value = (context.store.get(counterKey) as number) ?? 0;

    switch (operation) {
      case "init":
        value = initialValue;
        break;
      case "increment":
        value += step;
        break;
      case "decrement":
        value -= step;
        break;
    }

    context.store.set(counterKey, value);
    context.log(`Counter "${counterKey}" = ${value}`);
    return { output: value, success: true };
  },
);
