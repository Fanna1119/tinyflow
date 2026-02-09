import { registerFunction, param } from "../../registry";
import { getTable } from "./shared";

registerFunction(
  {
    id: "db.update",
    name: "Database Update",
    description: "Updates a record by ID.",
    category: "Database",
    params: [
      param("table", "string", {
        required: true,
        description: "Table name",
      }),
      param("id", "string", {
        required: true,
        description: "Record ID to update",
      }),
      param("dataKey", "string", {
        required: true,
        description: "Key in store containing the update data",
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store the updated record",
      }),
    ],
    outputs: ["outputKey"],
    icon: "Edit",
  },
  async (params, context) => {
    const tableName = params.table as string;
    const id = params.id as string;
    const dataKey = params.dataKey as string;
    const outputKey = params.outputKey as string;

    const table = getTable(tableName);
    const existing = table.get(id);

    if (!existing) {
      context.store.set(outputKey, null);
      return {
        output: null,
        success: false,
        error: `Record not found: ${tableName}/${id}`,
      };
    }

    const updateData = context.store.get(dataKey) as Record<string, unknown>;
    const updated = {
      ...existing,
      ...updateData,
      updatedAt: new Date().toISOString(),
    };

    table.set(id, updated);
    context.store.set(outputKey, updated);
    context.log(`DB Update: ${tableName}/${id}`);

    return { output: updated, success: true };
  },
);
