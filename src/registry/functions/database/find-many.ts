import { registerFunction, param } from "../../registry";
import { getTable } from "./shared";

registerFunction(
  {
    id: "db.findMany",
    name: "Database Find Many",
    description: "Finds multiple records matching filter criteria.",
    category: "Database",
    params: [
      param("table", "string", {
        required: true,
        description: "Table name to search",
      }),
      param("filter", "object", {
        required: false,
        description: "Filter criteria as key-value pairs",
      }),
      param("outputKey", "string", {
        required: true,
        description: "Key to store the found records",
      }),
      param("orderBy", "string", {
        required: false,
        description: "Field name to sort by",
      }),
      param("orderDir", "string", {
        required: false,
        default: "asc",
        description: "Sort direction: asc or desc",
      }),
      param("limit", "number", {
        required: false,
        description: "Maximum number of results",
      }),
    ],
    outputs: ["outputKey"],
    icon: "List",
  },
  async (params, context) => {
    const tableName = params.table as string;
    const filter = (params.filter as Record<string, unknown>) ?? {};
    const outputKey = params.outputKey as string;
    const orderBy = params.orderBy as string | undefined;
    const orderDir = (params.orderDir as string) ?? "asc";
    const limit = params.limit as number | undefined;

    const table = getTable(tableName);
    let results = Array.from(table.values());

    // Apply filters
    if (Object.keys(filter).length > 0) {
      results = results.filter((row) =>
        Object.entries(filter).every(([key, value]) => row[key] === value),
      );
    }

    // Apply sorting
    if (orderBy) {
      results.sort((a, b) => {
        const aVal = a[orderBy] as string | number;
        const bVal = b[orderBy] as string | number;
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return orderDir === "desc" ? -cmp : cmp;
      });
    }

    // Apply limit
    if (limit && limit > 0) {
      results = results.slice(0, limit);
    }

    context.store.set(outputKey, results);
    context.log(`DB FindMany: ${tableName} returned ${results.length} rows`);

    return { output: results, success: true };
  },
);
