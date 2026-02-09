import { registerFunction, param } from "../../registry";
import { getTable, autoIncrements } from "./shared";

registerFunction(
  {
    id: "db.clearTable",
    name: "Database Clear Table",
    description: "Clears all records from a table.",
    category: "Database",
    params: [
      param("table", "string", {
        required: true,
        description: "Table name to clear",
      }),
    ],
    outputs: [],
    icon: "Trash",
  },
  async (params, context) => {
    const tableName = params.table as string;

    const table = getTable(tableName);
    const count = table.size;
    table.clear();
    autoIncrements.set(tableName, 1);

    context.log(`DB Clear: ${tableName} (${count} rows removed)`);

    return { output: count, success: true };
  },
);
