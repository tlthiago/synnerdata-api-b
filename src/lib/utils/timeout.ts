/**
 * Timeout utilities for handling operations with time limits.
 *
 * @example
 * ```typescript
 * const result = await Timeout.withTimeout(
 *   () => fetch("https://api.example.com/data"),
 *   5000
 * );
 * ```
 */

/**
 * Error thrown when an operation exceeds the specified timeout duration.
 */
export class TimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = "TimeoutError";
    this.timeoutMs = ms;
  }
}

/**
 * Timeout helper object with utility methods.
 */
export const Timeout = {
  /**
   * Wraps an async operation with a timeout.
   * If the operation takes longer than the specified duration, a TimeoutError is thrown.
   *
   * @param fn - The async function to execute
   * @param ms - Timeout duration in milliseconds
   * @returns The result of the function if it completes in time
   * @throws {TimeoutError} If the operation exceeds the timeout
   *
   * @example
   * ```typescript
   * try {
   *   const data = await Timeout.withTimeout(
   *     () => fetchExternalApi(),
   *     5000
   *   );
   * } catch (error) {
   *   if (error instanceof TimeoutError) {
   *     console.log(`Timed out after ${error.timeoutMs}ms`);
   *   }
   * }
   * ```
   */
  async withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new TimeoutError(ms));
      }, ms);
    });

    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      return result;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  },
};
