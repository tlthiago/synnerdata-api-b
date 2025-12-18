import { describe, expect, test } from "bun:test";
import { Timeout, TimeoutError } from "@/lib/utils/timeout";

describe("TimeoutError", () => {
  test("should have correct name property", () => {
    const error = new TimeoutError(5000);

    expect(error.name).toBe("TimeoutError");
  });

  test("should include ms in message", () => {
    const error = new TimeoutError(3000);

    expect(error.message).toBe("Operation timed out after 3000ms");
  });

  test("should store timeout duration in timeoutMs property", () => {
    const error = new TimeoutError(7500);

    expect(error.timeoutMs).toBe(7500);
  });

  test("should be an instance of Error", () => {
    const error = new TimeoutError(1000);

    expect(error).toBeInstanceOf(Error);
  });
});

describe("Timeout", () => {
  describe("withTimeout", () => {
    test("should return result when operation completes in time", async () => {
      const expectedResult = { data: "success" };

      const result = await Timeout.withTimeout(async () => {
        await Bun.sleep(10);
        return expectedResult;
      }, 1000);

      expect(result).toEqual(expectedResult);
    });

    test("should throw TimeoutError when operation exceeds timeout", async () => {
      await expect(
        Timeout.withTimeout(async () => {
          await Bun.sleep(200);
          return "should not reach";
        }, 50)
      ).rejects.toBeInstanceOf(TimeoutError);
    });

    test("should include timeout duration in error message", async () => {
      try {
        await Timeout.withTimeout(async () => {
          await Bun.sleep(200);
        }, 50);
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(TimeoutError);
        expect((error as TimeoutError).message).toBe(
          "Operation timed out after 50ms"
        );
        expect((error as TimeoutError).timeoutMs).toBe(50);
      }
    });

    test("should propagate errors from the wrapped function", async () => {
      const customError = new Error("Custom error from function");

      await expect(
        Timeout.withTimeout(() => Promise.reject(customError), 1000)
      ).rejects.toThrow("Custom error from function");
    });

    test("should work with functions that return primitive values", async () => {
      const numberResult = await Timeout.withTimeout(
        () => Promise.resolve(42),
        1000
      );
      const stringResult = await Timeout.withTimeout(
        () => Promise.resolve("hello"),
        1000
      );
      const boolResult = await Timeout.withTimeout(
        () => Promise.resolve(true),
        1000
      );

      expect(numberResult).toBe(42);
      expect(stringResult).toBe("hello");
      expect(boolResult).toBe(true);
    });

    test("should work with functions that return null or undefined", async () => {
      const nullResult = await Timeout.withTimeout(
        () => Promise.resolve(null),
        1000
      );
      const undefinedResult = await Timeout.withTimeout(
        () => Promise.resolve(undefined),
        1000
      );

      expect(nullResult).toBeNull();
      expect(undefinedResult).toBeUndefined();
    });
  });
});
