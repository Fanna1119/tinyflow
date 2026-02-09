// Global in-memory store (persists across workflow runs in same process)
export const memoryStore = new Map<
  string,
  { value: unknown; expiresAt?: number }
>();
