/**
 * Retry Policy Tests
 */

import { describe, it, expect } from "vitest";
import {
  withRetry,
  calculateDelay,
  isRetryableError,
  RETRY_POLICIES,
  createRetryPolicy,
} from "../retry";

describe("Retry Policies", () => {
  it("should calculate exponential backoff delays", () => {
    const policy = createRetryPolicy({
      initialDelay: 1000,
      backoffMultiplier: 2,
      maxDelay: 10000,
      jitter: false,
    });

    expect(calculateDelay(policy, 1)).toBe(1000);
    expect(calculateDelay(policy, 2)).toBe(2000);
    expect(calculateDelay(policy, 3)).toBe(4000);
    expect(calculateDelay(policy, 4)).toBe(8000);
    expect(calculateDelay(policy, 5)).toBe(10000); // Capped at maxDelay
  });

  it("should add jitter to delays", () => {
    const policy = createRetryPolicy({
      initialDelay: 1000,
      backoffMultiplier: 1,
      maxDelay: 10000,
      jitter: true,
    });

    const delays = Array.from({ length: 10 }, () => calculateDelay(policy, 1));

    // With jitter, delays should vary
    const uniqueDelays = new Set(delays);
    expect(uniqueDelays.size).toBeGreaterThan(1);

    // All delays should be within ±25% of base delay
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(750);
      expect(delay).toBeLessThanOrEqual(1250);
    }
  });

  it("should retry on failure and eventually succeed", async () => {
    let attempts = 0;

    const fn = async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error("Temporary failure");
      }
      return "success";
    };

    const result = await withRetry(fn, RETRY_POLICIES.fast);

    expect(result).toBe("success");
    expect(attempts).toBe(3);
  });

  it("should fail after max attempts", async () => {
    let attempts = 0;

    const fn = async () => {
      attempts++;
      throw new Error("Always fails");
    };

    await expect(
      withRetry(fn, createRetryPolicy({ maxAttempts: 3, initialDelay: 10 })),
    ).rejects.toThrow("Always fails");

    expect(attempts).toBe(3);
  });

  it("should call onRetry callback", async () => {
    let attempts = 0;
    const retryContexts: unknown[] = [];

    const fn = async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error("Retry me");
      }
      return "ok";
    };

    await withRetry(
      fn,
      createRetryPolicy({ maxAttempts: 3, initialDelay: 10 }),
      (context) => {
        retryContexts.push(context);
      },
    );

    expect(retryContexts).toHaveLength(1);
    expect(retryContexts[0]).toMatchObject({
      attempt: 1,
      lastError: "Retry me",
    });
  });

  it("should identify retryable errors", () => {
    expect(isRetryableError(new Error("Network error occurred"))).toBe(true);
    expect(isRetryableError(new Error("Request timeout"))).toBe(true);
    expect(isRetryableError(new Error("ECONNRESET"))).toBe(true);
    expect(isRetryableError(new Error("HTTP 500 Server Error"))).toBe(true);

    expect(isRetryableError(new Error("Invalid input"))).toBe(false);
    expect(isRetryableError(new Error("Not found"))).toBe(false);
  });

  it("should have predefined retry policies", () => {
    expect(RETRY_POLICIES.none.maxAttempts).toBe(1);
    expect(RETRY_POLICIES.fast.maxAttempts).toBe(3);
    expect(RETRY_POLICIES.standard.maxAttempts).toBe(3);
    expect(RETRY_POLICIES.aggressive.maxAttempts).toBe(5);
    expect(RETRY_POLICIES.patient.maxAttempts).toBe(10);
  });
});
