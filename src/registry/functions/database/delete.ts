import { registerFunction, param } from "../../registry";
import { getTable } from "./shared";

registerFunction(
  {
    id: "db.delete",
    name: "Database Delete",
    description: "Deletes a record by ID.",
    category: "Database",
    params: [
      param("table", "string", {
        required: true,
        description: "Table name",
      }),
      param("id", "string", {
        required: true,
        description: "Record ID to delete",
      }),
    ],
    outputs: [],
    icon: "Trash2",
  },
  async (params, context) => {
    const tableName = params.table as string;
    const id = params.id as string;

    const table = getTable(tableName);
    const existed = table.delete(id);

    context.log(
      `DB Delete: ${tableName}/${id} (${existed ? "deleted" : "not found"})`,
    );

    return {
      output: existed,
      action: existed ? "success" : "error",
      success: existed,
    };
  },
);
