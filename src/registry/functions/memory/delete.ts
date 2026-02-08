import { registerFunction, param } from "../../registry";
import { memoryStore } from "./shared";

registerFunction(
  {
    id: "memory.delete",
    name: "Memory Delete",
    description: "Deletes a value from persistent memory.",
    category: "Memory",
    params: [
      param("memoryKey", "string", {
        required: true,
        description: "Key to delete from memory",
      }),
    ],
    outputs: [],
    icon: "Trash2",
  },
  async (params, context) => {
    const memoryKey = params.memoryKey as string;

    const existed = memoryStore.delete(memoryKey);
    context.log(
      `Memory DELETE: ${memoryKey} (${existed ? "deleted" : "not found"})`,
    );

    return { output: existed, success: true };
  },
);
