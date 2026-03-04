import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { OrgSubscription } from "@/db/schema";
import { logger } from "@/lib/logger";
import type { PaymentEventName, PaymentEventPayload } from "../hooks.types";

function createMockSubscription(
  overrides?: Partial<OrgSubscription>
): OrgSubscription {
  return {
    id: "sub_123",
    organizationId: "org_123",
    planId: "plan_123",
    status: "active",
    pricingTierId: "tier_123",
    billingCycle: "monthly",
    seats: 1,
    trialUsed: false,
    cancelAtPeriodEnd: false,
    trialStart: null,
    trialEnd: null,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(),
    pagarmeSubscriptionId: null,
    pagarmeUpdatedAt: null,
    canceledAt: null,
    cancelReason: null,
    cancelComment: null,
    pastDueSince: null,
    gracePeriodEnds: null,
    pendingPlanId: null,
    pendingBillingCycle: null,
    pendingPricingTierId: null,
    planChangeAt: null,
    priceAtPurchase: null,
    isCustomPrice: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Fresh emitter class for isolated testing (same implementation as production)
type EventHandler<T extends PaymentEventName> = (
  payload: PaymentEventPayload<T>
) => void | Promise<void>;

class TestPaymentHooksEmitter {
  private readonly handlers = new Map<
    PaymentEventName,
    Set<EventHandler<PaymentEventName>>
  >();

  on<T extends PaymentEventName>(event: T, handler: EventHandler<T>) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      eventHandlers.add(handler as EventHandler<PaymentEventName>);
    }
    return () => this.off(event, handler);
  }

  off<T extends PaymentEventName>(event: T, handler: EventHandler<T>) {
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      eventHandlers.delete(handler as EventHandler<PaymentEventName>);
    }
  }

  async emit<T extends PaymentEventName>(
    event: T,
    payload: PaymentEventPayload<T>
  ) {
    const eventHandlers = this.handlers.get(event);
    if (!eventHandlers) {
      return;
    }

    const promises = Array.from(eventHandlers).map((handler) =>
      Promise.resolve(handler(payload)).catch((error) => {
        logger.error({
          type: "payment:hook:error",
          event,
          error: error instanceof Error ? error.message : String(error),
        });
      })
    );

    await Promise.all(promises);
  }

  getHandlerCount(event: PaymentEventName): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

describe("PaymentHooksEmitter", () => {
  let emitter: TestPaymentHooksEmitter;

  beforeEach(() => {
    emitter = new TestPaymentHooksEmitter();
  });

  describe("on()", () => {
    test("should register a handler for an event", () => {
      const handler = mock((_payload: PaymentEventPayload<"trial.started">) => {
        // handler logic
      });

      emitter.on("trial.started", handler);

      expect(emitter.getHandlerCount("trial.started")).toBe(1);
    });

    test("should register multiple handlers for the same event", () => {
      const handler1 = mock(
        (_payload: PaymentEventPayload<"trial.started">) => {
          // handler logic
        }
      );
      const handler2 = mock(
        (_payload: PaymentEventPayload<"trial.started">) => {
          // handler logic
        }
      );

      emitter.on("trial.started", handler1);
      emitter.on("trial.started", handler2);

      expect(emitter.getHandlerCount("trial.started")).toBe(2);
    });

    test("should register handlers for different events independently", () => {
      const handler1 = mock(
        (_payload: PaymentEventPayload<"trial.started">) => {
          // handler logic
        }
      );
      const handler2 = mock(
        (_payload: PaymentEventPayload<"subscription.activated">) => {
          // handler logic
        }
      );

      emitter.on("trial.started", handler1);
      emitter.on("subscription.activated", handler2);

      expect(emitter.getHandlerCount("trial.started")).toBe(1);
      expect(emitter.getHandlerCount("subscription.activated")).toBe(1);
    });

    test("should return unsubscribe function", () => {
      const handler = mock((_payload: PaymentEventPayload<"trial.started">) => {
        // handler logic
      });

      const unsubscribe = emitter.on("trial.started", handler);

      expect(typeof unsubscribe).toBe("function");
      expect(emitter.getHandlerCount("trial.started")).toBe(1);

      unsubscribe();

      expect(emitter.getHandlerCount("trial.started")).toBe(0);
    });
  });

  describe("off()", () => {
    test("should remove a specific handler", () => {
      const handler1 = mock(
        (_payload: PaymentEventPayload<"trial.started">) => {
          // handler logic
        }
      );
      const handler2 = mock(
        (_payload: PaymentEventPayload<"trial.started">) => {
          // handler logic
        }
      );

      emitter.on("trial.started", handler1);
      emitter.on("trial.started", handler2);

      expect(emitter.getHandlerCount("trial.started")).toBe(2);

      emitter.off("trial.started", handler1);

      expect(emitter.getHandlerCount("trial.started")).toBe(1);
    });

    test("should not throw when removing non-existent handler", () => {
      const handler = mock((_payload: PaymentEventPayload<"trial.started">) => {
        // handler logic
      });

      expect(() => emitter.off("trial.started", handler)).not.toThrow();
    });

    test("should not throw when removing from event with no handlers", () => {
      const handler = mock((_payload: PaymentEventPayload<"trial.started">) => {
        // handler logic
      });

      // trial.expired never had handlers registered
      expect(() => emitter.off("trial.expired", handler)).not.toThrow();
    });
  });

  describe("emit()", () => {
    test("should call all registered handlers with payload", async () => {
      const handler1 = mock(
        (_payload: PaymentEventPayload<"trial.started">) => {
          // handler logic
        }
      );
      const handler2 = mock(
        (_payload: PaymentEventPayload<"trial.started">) => {
          // handler logic
        }
      );
      const payload: PaymentEventPayload<"trial.started"> = {
        subscription: createMockSubscription(),
      };

      emitter.on("trial.started", handler1);
      emitter.on("trial.started", handler2);

      await emitter.emit("trial.started", payload);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler1).toHaveBeenCalledWith(payload);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledWith(payload);
    });

    test("should not call handlers for other events", async () => {
      const trialHandler = mock(
        (_payload: PaymentEventPayload<"trial.started">) => {
          // handler logic
        }
      );
      const subscriptionHandler = mock(
        (_payload: PaymentEventPayload<"subscription.activated">) => {
          // handler logic
        }
      );
      const payload: PaymentEventPayload<"trial.started"> = {
        subscription: createMockSubscription(),
      };

      emitter.on("trial.started", trialHandler);
      emitter.on("subscription.activated", subscriptionHandler);

      await emitter.emit("trial.started", payload);

      expect(trialHandler).toHaveBeenCalledTimes(1);
      expect(subscriptionHandler).not.toHaveBeenCalled();
    });

    test("should handle events with no registered handlers", async () => {
      const payload: PaymentEventPayload<"trial.started"> = {
        subscription: createMockSubscription(),
      };

      // Should not throw
      await emitter.emit("trial.started", payload);
    });

    test("should await async handlers before returning", async () => {
      const executionOrder: number[] = [];
      const payload: PaymentEventPayload<"trial.started"> = {
        subscription: createMockSubscription(),
      };

      const asyncHandler = mock(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        executionOrder.push(1);
      });

      emitter.on("trial.started", asyncHandler);

      await emitter.emit("trial.started", payload);
      executionOrder.push(2);

      // If async handlers are awaited, order should be [1, 2]
      expect(executionOrder).toEqual([1, 2]);
    });

    test("should run multiple async handlers in parallel", async () => {
      const startTimes: number[] = [];
      const payload: PaymentEventPayload<"trial.started"> = {
        subscription: createMockSubscription(),
      };

      const slowHandler1 = mock(async () => {
        startTimes.push(Date.now());
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const slowHandler2 = mock(async () => {
        startTimes.push(Date.now());
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      emitter.on("trial.started", slowHandler1);
      emitter.on("trial.started", slowHandler2);

      const start = Date.now();
      await emitter.emit("trial.started", payload);
      const elapsed = Date.now() - start;

      // If parallel, elapsed should be ~50ms, not ~100ms
      expect(elapsed).toBeLessThan(80);
      // Both handlers should have started at nearly the same time
      expect(Math.abs(startTimes[0] - startTimes[1])).toBeLessThan(10);
    });
  });

  describe("error handling", () => {
    test("should catch error in async handler and continue with other handlers", async () => {
      const payload: PaymentEventPayload<"trial.started"> = {
        subscription: createMockSubscription(),
      };

      const failingHandler = mock(async () => {
        await Promise.resolve();
        throw new Error("Async handler failed");
      });
      const successHandler = mock(
        (_payload: PaymentEventPayload<"trial.started">) => {
          // handler logic
        }
      );

      emitter.on("trial.started", failingHandler);
      emitter.on("trial.started", successHandler);

      // Should not throw - errors are caught internally
      await emitter.emit("trial.started", payload);

      expect(failingHandler).toHaveBeenCalledTimes(1);
      expect(successHandler).toHaveBeenCalledTimes(1);
    });

    test("should log error when handler throws", async () => {
      const loggerSpy = mock(() => {
        // logger spy
      });
      const originalError = logger.error;
      logger.error = loggerSpy;

      const payload: PaymentEventPayload<"trial.started"> = {
        subscription: createMockSubscription(),
      };

      const failingHandler = mock(async () => {
        await Promise.resolve();
        throw new Error("Test error message");
      });

      emitter.on("trial.started", failingHandler);
      await emitter.emit("trial.started", payload);

      expect(loggerSpy).toHaveBeenCalledTimes(1);
      expect(loggerSpy).toHaveBeenCalledWith({
        type: "payment:hook:error",
        event: "trial.started",
        error: "Test error message",
      });

      logger.error = originalError;
    });
  });
});
