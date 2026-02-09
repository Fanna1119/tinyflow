import { registerFunction, param } from "../../registry";
import { getTable, generateId } from "./shared";

registerFunction(
  {
    id: "db.insert",
    name: "Database Insert",
    description: "Inserts a new record into the database.",
    category: "Database",
    params: [
      param("table", "string", {
        required: true,
        description: "Table name to insert into",
      }),
      param("dataKey", "string", {
        required: true,
        description: "Key in store containing the data object to insert",
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store the inserted record (with generated ID)",
      }),
    ],
    outputs: ["outputKey"],
    icon: "Plus",
  },
  async (params, context) => {
    const tableName = params.table as string;
    const dataKey = params.dataKey as string;
    const outputKey = params.outputKey as string;

    const data = context.store.get(dataKey) as Record<string, unknown>;

    if (!data || typeof data !== "object") {
      return {
        output: null,
        success: false,
        error: `No valid data found at key "${dataKey}"`,
      };
    }

    const table = getTable(tableName);
    const id = generateId(tableName);
    const record = { id, ...data, createdAt: new Date().toISOString() };

    table.set(id, record);
    context.store.set(outputKey, record);
    context.log(`DB Insert: ${tableName} id=${id}`);

    return { output: record, success: true };
  },
);
