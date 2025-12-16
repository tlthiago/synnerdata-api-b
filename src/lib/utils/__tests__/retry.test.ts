import { describe, expect, test } from "bun:test";
import { Retry } from "../retry";

describe("Retry", () => {
  describe("withRetry", () => {
    test("should return result on first successful attempt", async () => {
      const expectedResult = { data: "success" };
      let callCount = 0;

      const result = await Retry.withRetry(() => {
        callCount += 1;
        return Promise.resolve(expectedResult);
      });

      expect(result).toEqual(expectedResult);
      expect(callCount).toBe(1);
    });

    test("should retry and succeed on second attempt", async () => {
      let callCount = 0;
      const networkError = new TypeError("fetch failed");

      const result = await Retry.withRetry(
        () => {
          callCount += 1;
          if (callCount === 1) {
            return Promise.reject(networkError);
          }
          return Promise.resolve("success");
        },
        { delayMs: 10 }
      );

      expect(result).toBe("success");
      expect(callCount).toBe(2);
    });

    test("should retry with exponential backoff", async () => {
      let callCount = 0;
      const timestamps: number[] = [];
      const networkError = new TypeError("fetch failed");

      await Retry.withRetry(
        () => {
          callCount += 1;
          timestamps.push(Date.now());
          if (callCount < 3) {
            return Promise.reject(networkError);
          }
          return Promise.resolve("success");
        },
        { delayMs: 50, backoff: "exponential", maxAttempts: 3 }
      );

      expect(callCount).toBe(3);
      expect(timestamps.length).toBe(3);

      const firstDelay = timestamps[1] - timestamps[0];
      const secondDelay = timestamps[2] - timestamps[1];

      // Exponential: first delay ~50ms, second delay ~100ms
      expect(firstDelay).toBeGreaterThanOrEqual(40);
      expect(firstDelay).toBeLessThan(80);
      expect(secondDelay).toBeGreaterThanOrEqual(80);
      expect(secondDelay).toBeLessThan(150);
    });

    test("should retry with linear backoff when configured", async () => {
      let callCount = 0;
      const timestamps: number[] = [];
      const networkError = new TypeError("fetch failed");

      await Retry.withRetry(
        () => {
          callCount += 1;
          timestamps.push(Date.now());
          if (callCount < 3) {
            return Promise.reject(networkError);
          }
          return Promise.resolve("success");
        },
        { delayMs: 50, backoff: "linear", maxAttempts: 3 }
      );

      expect(callCount).toBe(3);

      const firstDelay = timestamps[1] - timestamps[0];
      const secondDelay = timestamps[2] - timestamps[1];

      // Linear: first delay ~50ms (50*1), second delay ~100ms (50*2)
      expect(firstDelay).toBeGreaterThanOrEqual(40);
      expect(firstDelay).toBeLessThan(80);
      expect(secondDelay).toBeGreaterThanOrEqual(80);
      expect(secondDelay).toBeLessThan(150);
    });

    test("should throw after exhausting all attempts", async () => {
      let callCount = 0;
      const networkError = new TypeError("fetch failed");

      await expect(
        Retry.withRetry(
          () => {
            callCount += 1;
            return Promise.reject(networkError);
          },
          { maxAttempts: 3, delayMs: 10 }
        )
      ).rejects.toThrow("fetch failed");

      expect(callCount).toBe(3);
    });

    test("should not retry when shouldRetry returns false", async () => {
      let callCount = 0;
      const customError = new Error("Do not retry this");

      await expect(
        Retry.withRetry(
          () => {
            callCount += 1;
            return Promise.reject(customError);
          },
          {
            maxAttempts: 3,
            delayMs: 10,
            shouldRetry: () => false,
          }
        )
      ).rejects.toThrow("Do not retry this");

      expect(callCount).toBe(1);
    });

    test("should retry on network errors (TypeError fetch)", async () => {
      let callCount = 0;
      const networkError = new TypeError("fetch failed: connection refused");

      const result = await Retry.withRetry(
        () => {
          callCount += 1;
          if (callCount === 1) {
            return Promise.reject(networkError);
          }
          return Promise.resolve("recovered");
        },
        { delayMs: 10 }
      );

      expect(result).toBe("recovered");
      expect(callCount).toBe(2);
    });

    test("should retry on HTTP 5xx errors", async () => {
      let callCount = 0;
      const serverError = Object.assign(new Error("Internal Server Error"), {
        status: 500,
      });

      const result = await Retry.withRetry(
        () => {
          callCount += 1;
          if (callCount === 1) {
            return Promise.reject(serverError);
          }
          return Promise.resolve("recovered");
        },
        { delayMs: 10 }
      );

      expect(result).toBe("recovered");
      expect(callCount).toBe(2);
    });

    test("should not retry on HTTP 4xx errors", async () => {
      let callCount = 0;
      const clientError = Object.assign(new Error("Bad Request"), {
        status: 400,
      });

      await expect(
        Retry.withRetry(
          () => {
            callCount += 1;
            return Promise.reject(clientError);
          },
          { maxAttempts: 3, delayMs: 10 }
        )
      ).rejects.toThrow("Bad Request");

      expect(callCount).toBe(1);
    });

    test("should use custom shouldRetry function", async () => {
      let callCount = 0;
      const retryableError = new Error("TEMPORARY_ERROR");
      const nonRetryableError = new Error("PERMANENT_ERROR");

      const resultRetryable = await Retry.withRetry(
        () => {
          callCount += 1;
          if (callCount === 1) {
            return Promise.reject(retryableError);
          }
          return Promise.resolve("success");
        },
        {
          delayMs: 10,
          shouldRetry: (error) => error.message === "TEMPORARY_ERROR",
        }
      );

      expect(resultRetryable).toBe("success");
      expect(callCount).toBe(2);

      callCount = 0;
      await expect(
        Retry.withRetry(
          () => {
            callCount += 1;
            return Promise.reject(nonRetryableError);
          },
          {
            delayMs: 10,
            shouldRetry: (error) => error.message === "TEMPORARY_ERROR",
          }
        )
      ).rejects.toThrow("PERMANENT_ERROR");

      expect(callCount).toBe(1);
    });

    test("should convert non-Error throws to Error", async () => {
      await expect(
        Retry.withRetry(() => Promise.reject("string error"), {
          maxAttempts: 1,
        })
      ).rejects.toThrow("string error");
    });

    test("should work with default options", async () => {
      let callCount = 0;

      const result = await Retry.withRetry(() => {
        callCount += 1;
        return Promise.resolve("success");
      });

      expect(result).toBe("success");
      expect(callCount).toBe(1);
    });
  });
});
