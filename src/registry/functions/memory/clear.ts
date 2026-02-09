import { registerFunction } from "../../registry";
import { memoryStore } from "./shared";

registerFunction(
  {
    id: "memory.clear",
    name: "Memory Clear",
    description: "Clears all values from persistent memory.",
    category: "Memory",
    params: [],
    outputs: [],
    icon: "Trash",
  },
  async (_params, context) => {
    const count = memoryStore.size;
    memoryStore.clear();
    context.log(`Memory CLEAR: ${count} entries removed`);

    return { output: count, success: true };
  },
);
