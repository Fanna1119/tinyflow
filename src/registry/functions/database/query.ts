import { registerFunction, param } from "../../registry";
import { getTable } from "./shared";

registerFunction(
  {
    id: "db.query",
    name: "Database Query",
    description: "Executes a query-like operation on the in-memory database.",
    category: "Database",
    params: [
      param("table", "string", {
        required: true,
        description: "Table name to query",
      }),
      param("filter", "object", {
        required: false,
        description: "Filter criteria as key-value pairs",
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store query results",
      }),
      param("limit", "number", {
        required: false,
        description: "Maximum number of results to return",
      }),
    ],
    outputs: ["outputKey"],
    icon: "Table",
  },
  async (params, context) => {
    const tableName = params.table as string;
    const filter = (params.filter as Record<string, unknown>) ?? {};
    const outputKey = params.outputKey as string;
    const limit = params.limit as number | undefined;

    const table = getTable(tableName);
    let results = Array.from(table.values());

    // Apply filters
    if (Object.keys(filter).length > 0) {
      results = results.filter((row) =>
        Object.entries(filter).every(([key, value]) => row[key] === value),
      );
    }

    // Apply limit
    if (limit && limit > 0) {
      results = results.slice(0, limit);
    }

    context.store.set(outputKey, results);
    context.log(`DB Query: ${tableName} returned ${results.length} rows`);

    return { output: results, success: true };
  },
);
