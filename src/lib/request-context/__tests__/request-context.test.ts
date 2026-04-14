import { describe, expect, test } from "bun:test";
import { enterRequestContext, getRequestId } from "@/lib/request-context";

describe("request-context", () => {
  test("should return undefined when no context is set", () => {
    expect(getRequestId()).toBeUndefined();
  });

  test("should return requestId after entering context", () => {
    enterRequestContext({ requestId: "req-test-123" });
    expect(getRequestId()).toBe("req-test-123");
  });

  test("should isolate context between async operations", async () => {
    const results: (string | undefined)[] = [];

    const task1 = new Promise<void>((resolve) => {
      enterRequestContext({ requestId: "req-task-1" });
      setTimeout(() => {
        results.push(getRequestId());
        resolve();
      }, 10);
    });

    const task2 = new Promise<void>((resolve) => {
      enterRequestContext({ requestId: "req-task-2" });
      setTimeout(() => {
        results.push(getRequestId());
        resolve();
      }, 5);
    });

    await Promise.all([task1, task2]);

    expect(results).toContain("req-task-1");
    expect(results).toContain("req-task-2");
  });
});
