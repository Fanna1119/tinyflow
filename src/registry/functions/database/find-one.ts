import { registerFunction, param } from "../../registry";
import { getTable } from "./shared";

registerFunction(
  {
    id: "db.findOne",
    name: "Database Find One",
    description: "Finds a single record by ID or filter criteria.",
    category: "Database",
    params: [
      param("table", "string", {
        required: true,
        description: "Table name to search",
      }),
      param("id", "string", {
        required: false,
        description: "Record ID to find (takes precedence over filter)",
      }),
      param("filter", "object", {
        required: false,
        description: "Filter criteria as key-value pairs",
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store the found record",
      }),
    ],
    outputs: ["outputKey"],
    icon: "Search",
  },
  async (params, context) => {
    const tableName = params.table as string;
    const id = params.id as string | undefined;
    const filter = (params.filter as Record<string, unknown>) ?? {};
    const outputKey = params.outputKey as string;

    const table = getTable(tableName);
    let result: Record<string, unknown> | null = null;

    if (id) {
      result = table.get(id) ?? null;
    } else if (Object.keys(filter).length > 0) {
      result =
        Array.from(table.values()).find((row) =>
          Object.entries(filter).every(([key, value]) => row[key] === value),
        ) ?? null;
    }

    context.store.set(outputKey, result);
    context.log(`DB FindOne: ${tableName} ${result ? "found" : "not found"}`);

    return {
      output: result,
      action: result ? "success" : "error",
      success: true,
    };
  },
);
