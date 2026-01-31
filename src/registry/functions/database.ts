/**
 * Built-in Functions: Database
 * SQLite-like in-memory database operations for workflows
 */

import { registerFunction, param } from "../registry";

// In-memory database simulation (tables with rows)
const database = new Map<string, Map<string, Record<string, unknown>>>();

// Auto-increment counters per table
const autoIncrements = new Map<string, number>();

function getTable(tableName: string): Map<string, Record<string, unknown>> {
  if (!database.has(tableName)) {
    database.set(tableName, new Map());
    autoIncrements.set(tableName, 1);
  }
  return database.get(tableName)!;
}

function generateId(tableName: string): string {
  const id = autoIncrements.get(tableName) ?? 1;
  autoIncrements.set(tableName, id + 1);
  return String(id);
}

// ============================================================================
// Database Query (Raw)
// ============================================================================

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

// ============================================================================
// Database Insert
// ============================================================================

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

// ============================================================================
// Database Find One
// ============================================================================

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

// ============================================================================
// Database Find Many
// ============================================================================

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

// ============================================================================
// Database Update
// ============================================================================

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

// ============================================================================
// Database Delete
// ============================================================================

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

// ============================================================================
// Database Clear Table
// ============================================================================

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
