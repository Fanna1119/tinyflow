/**
 * Retry Policies & Error Handling
 * Configurable retry logic for workflow nodes
 */

export interface RetryPolicy {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  initialDelay: number;
  /** Maximum delay in milliseconds */
  maxDelay: number;
  /** Backoff multiplier (e.g., 2 for exponential backoff) */
  backoffMultiplier: number;
  /** Whether to add jitter to delays */
  jitter?: boolean;
}

export interface RetryContext {
  /** Current attempt number (1-indexed) */
  attempt: number;
  /** Error from previous attempt */
  lastError?: string;
  /** Total time spent retrying (ms) */
  totalDelay: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Calculate delay for next retry attempt
 */
export function calculateDelay(policy: RetryPolicy, attempt: number): number {
  const baseDelay = Math.min(
    policy.initialDelay * Math.pow(policy.backoffMultiplier, attempt - 1),
    policy.maxDelay,
  );

  if (policy.jitter) {
    // Add random jitter (±25%)
    const jitterAmount = baseDelay * 0.25;
    return baseDelay + (Math.random() * 2 - 1) * jitterAmount;
  }

  return baseDelay;
}

/**
 * Sleep utility for delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  onRetry?: (context: RetryContext) => void,
): Promise<T> {
  let lastError: Error | undefined;
  let totalDelay = 0;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));

      // If this was the last attempt, throw
      if (attempt >= policy.maxAttempts) {
        throw lastError;
      }

      // Calculate delay and notify
      const delay = calculateDelay(policy, attempt);
      totalDelay += delay;

      if (onRetry) {
        onRetry({
          attempt,
          lastError: lastError.message,
          totalDelay,
        });
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError ?? new Error("Retry failed");
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Network errors, timeouts, and 5xx HTTP errors are typically retryable
    return (
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("econnreset") ||
      message.includes("enotfound") ||
      message.includes("http 5")
    );
  }
  return false;
}

/**
 * Create a custom retry policy
 */
export function createRetryPolicy(
  overrides: Partial<RetryPolicy>,
): RetryPolicy {
  return {
    ...DEFAULT_RETRY_POLICY,
    ...overrides,
  };
}

/**
 * Common retry policies
 */
export const RETRY_POLICIES = {
  /** No retries */
  none: createRetryPolicy({ maxAttempts: 1 }),

  /** Fast retry for transient errors (3 attempts, 1s initial delay) */
  fast: createRetryPolicy({
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 5000,
    backoffMultiplier: 2,
  }),

  /** Standard retry (3 attempts, 2s initial delay) */
  standard: DEFAULT_RETRY_POLICY,

  /** Aggressive retry for critical operations (5 attempts, 2s initial delay) */
  aggressive: createRetryPolicy({
    maxAttempts: 5,
    initialDelay: 2000,
    maxDelay: 60000,
    backoffMultiplier: 2,
  }),

  /** Patient retry for rate-limited APIs (10 attempts, 5s initial delay) */
  patient: createRetryPolicy({
    maxAttempts: 10,
    initialDelay: 5000,
    maxDelay: 120000,
    backoffMultiplier: 1.5,
  }),
};
