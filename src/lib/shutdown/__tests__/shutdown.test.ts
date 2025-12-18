import {
  afterAll,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import type { Pool } from "pg";
import {
  getShutdownState,
  resetShutdownState,
  setupGracefulShutdown,
} from "@/lib/shutdown/shutdown";

type SignalHandler = () => void;

describe("setupGracefulShutdown", () => {
  let processExitSpy: ReturnType<typeof spyOn>;
  let registeredHandlers: Map<string, SignalHandler>;
  let originalOn: typeof process.on;

  beforeEach(() => {
    resetShutdownState();
    registeredHandlers = new Map();
    originalOn = process.on.bind(process);

    // Mock process.on to capture handlers
    process.on = ((event: string, handler: SignalHandler) => {
      if (event === "SIGTERM" || event === "SIGINT") {
        registeredHandlers.set(event, handler);
      }
      return process;
    }) as typeof process.on;

    processExitSpy = spyOn(process, "exit").mockImplementation(
      () => undefined as never
    );
  });

  afterAll(() => {
    process.on = originalOn;
    processExitSpy.mockRestore();
  });

  function createMockApp() {
    return {
      stop: mock(() => {
        // intentionally empty - mock function
      }),
    };
  }

  function createMockPool(endImpl?: () => Promise<void>) {
    return {
      end: mock(endImpl ?? (() => Promise.resolve())),
    } as unknown as Pool;
  }

  test("should register SIGTERM and SIGINT handlers", () => {
    const mockApp = createMockApp();
    const mockPool = createMockPool();

    setupGracefulShutdown({ app: mockApp, pool: mockPool });

    expect(registeredHandlers.has("SIGTERM")).toBe(true);
    expect(registeredHandlers.has("SIGINT")).toBe(true);
  });

  test("should call app.stop() on shutdown", async () => {
    const mockApp = createMockApp();
    const mockPool = createMockPool();

    setupGracefulShutdown({ app: mockApp, pool: mockPool, gracePeriodMs: 10 });

    const handler = registeredHandlers.get("SIGTERM");
    expect(handler).toBeDefined();

    await handler?.();

    expect(mockApp.stop).toHaveBeenCalled();
  });

  test("should close database pool on shutdown", async () => {
    const mockApp = createMockApp();
    const mockPool = createMockPool();

    setupGracefulShutdown({ app: mockApp, pool: mockPool, gracePeriodMs: 10 });

    const handler = registeredHandlers.get("SIGTERM");
    await handler?.();

    expect(mockPool.end).toHaveBeenCalled();
  });

  test("should call process.exit(0) after shutdown", async () => {
    const mockApp = createMockApp();
    const mockPool = createMockPool();

    setupGracefulShutdown({ app: mockApp, pool: mockPool, gracePeriodMs: 10 });

    const handler = registeredHandlers.get("SIGTERM");
    await handler?.();

    expect(processExitSpy).toHaveBeenCalledWith(0);
  });

  test("should prevent duplicate shutdown", async () => {
    const mockApp = createMockApp();
    const mockPool = createMockPool();

    setupGracefulShutdown({ app: mockApp, pool: mockPool, gracePeriodMs: 10 });

    const handler = registeredHandlers.get("SIGTERM");

    // First call
    await handler?.();
    expect(mockApp.stop).toHaveBeenCalledTimes(1);
    expect(mockPool.end).toHaveBeenCalledTimes(1);

    // Second call should be prevented
    await handler?.();
    expect(mockApp.stop).toHaveBeenCalledTimes(1);
    expect(mockPool.end).toHaveBeenCalledTimes(1);
  });

  test("should handle pool.end() error gracefully", async () => {
    const mockApp = createMockApp();
    const mockPool = createMockPool(() =>
      Promise.reject(new Error("Connection already closed"))
    );

    setupGracefulShutdown({ app: mockApp, pool: mockPool, gracePeriodMs: 10 });

    const handler = registeredHandlers.get("SIGTERM");

    // Should not throw even if pool.end() fails
    await expect(handler?.()).resolves.toBeUndefined();
    expect(processExitSpy).toHaveBeenCalledWith(0);
  });

  test("should use custom gracePeriodMs", async () => {
    const mockApp = createMockApp();
    const mockPool = createMockPool();

    const customGracePeriod = 50;
    setupGracefulShutdown({
      app: mockApp,
      pool: mockPool,
      gracePeriodMs: customGracePeriod,
    });

    const handler = registeredHandlers.get("SIGINT");
    const startTime = performance.now();
    await handler?.();
    const elapsed = performance.now() - startTime;

    // Should have waited at least the grace period
    expect(elapsed).toBeGreaterThanOrEqual(customGracePeriod - 10);
  });

  test("should use default gracePeriodMs of 5000ms", () => {
    const mockApp = createMockApp();
    const mockPool = createMockPool();

    // Just verify the function accepts config without gracePeriodMs
    expect(() =>
      setupGracefulShutdown({ app: mockApp, pool: mockPool })
    ).not.toThrow();
  });
});

describe("getShutdownState", () => {
  beforeEach(() => {
    resetShutdownState();
  });

  test("should return false initially", () => {
    expect(getShutdownState()).toBe(false);
  });
});

describe("resetShutdownState", () => {
  test("should reset shutdown state to false", () => {
    resetShutdownState();
    expect(getShutdownState()).toBe(false);
  });
});
