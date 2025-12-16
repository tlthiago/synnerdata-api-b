/**
 * Retry utilities for handling transient failures in async operations.
 *
 * @example
 * ```typescript
 * const result = await Retry.withRetry(
 *   () => fetchExternalApi(),
 *   { maxAttempts: 3, delayMs: 1000, backoff: "exponential" }
 * );
 * ```
 */

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_DELAY_MS = 1000;

/**
 * Options for configuring retry behavior.
 */
export type RetryOptions = {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay between attempts in milliseconds (default: 1000) */
  delayMs?: number;
  /** Backoff strategy: "linear" multiplies delay by attempt number, "exponential" doubles it (default: "exponential") */
  backoff?: "linear" | "exponential";
  /** Custom function to determine if an error should trigger a retry (default: network errors and HTTP 5xx) */
  shouldRetry?: (error: Error) => boolean;
};

/**
 * HTTP error with status code for retry decision making.
 */
type HttpError = Error & {
  status?: number;
};

/**
 * Default retry predicate: retries on network errors or HTTP 5xx responses.
 */
const defaultShouldRetry = (error: Error): boolean => {
  // Retry on network errors (fetch failures)
  if (error.name === "TypeError" && error.message.includes("fetch")) {
    return true;
  }

  // Retry on HTTP 5xx errors
  const httpError = error as HttpError;
  if (typeof httpError.status === "number") {
    return httpError.status >= 500 && httpError.status < 600;
  }

  return false;
};

/**
 * Calculates the delay for a given attempt based on the backoff strategy.
 */
const calculateDelay = (
  attempt: number,
  baseDelay: number,
  backoff: "linear" | "exponential"
): number => {
  if (backoff === "exponential") {
    return baseDelay * 2 ** (attempt - 1);
  }
  return baseDelay * attempt;
};

/**
 * Retry helper object with utility methods.
 */
export const Retry = {
  /**
   * Wraps an async operation with automatic retry on failure.
   *
   * @param fn - The async function to execute
   * @param options - Retry configuration options
   * @returns The result of the function if it succeeds within the allowed attempts
   * @throws The last error if all retry attempts are exhausted
   *
   * @example
   * ```typescript
   * // Basic usage with defaults (3 attempts, exponential backoff)
   * const data = await Retry.withRetry(() => fetchData());
   *
   * // Custom configuration
   * const data = await Retry.withRetry(
   *   () => fetchData(),
   *   {
   *     maxAttempts: 5,
   *     delayMs: 500,
   *     backoff: "linear",
   *     shouldRetry: (error) => error.message.includes("temporary"),
   *   }
   * );
   * ```
   */
  async withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxAttempts = DEFAULT_MAX_ATTEMPTS,
      delayMs = DEFAULT_DELAY_MS,
      backoff = "exponential",
      shouldRetry = defaultShouldRetry,
    } = options;

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        const isLastAttempt = attempt === maxAttempts;
        const canRetry = shouldRetry(lastError);

        if (isLastAttempt || !canRetry) {
          break;
        }

        const delay = calculateDelay(attempt, delayMs, backoff);
        await Bun.sleep(delay);
      }
    }

    throw lastError;
  },
};
