// In-memory database simulation (tables with rows)
export const database = new Map<string, Map<string, Record<string, unknown>>>();

// Auto-increment counters per table
export const autoIncrements = new Map<string, number>();

export function getTable(
  tableName: string,
): Map<string, Record<string, unknown>> {
  if (!database.has(tableName)) {
    database.set(tableName, new Map());
    autoIncrements.set(tableName, 1);
  }
  return database.get(tableName)!;
}

export function generateId(tableName: string): string {
  const id = autoIncrements.get(tableName) ?? 1;
  autoIncrements.set(tableName, id + 1);
  return String(id);
}
