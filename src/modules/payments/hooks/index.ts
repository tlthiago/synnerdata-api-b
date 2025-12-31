import { EventEmitter } from "node:events";
import { logger } from "@/lib/logger";
import type { PaymentEventName, PaymentEventPayload } from "./hooks.types";

type EventHandler<T extends PaymentEventName> = (
  payload: PaymentEventPayload<T>
) => void | Promise<void>;

/**
 * PaymentHooksEmitter extends Node's native EventEmitter with:
 * - TypeScript type safety for payment events
 * - Automatic error handling for async handlers
 * - Parallel execution of all handlers
 */
class PaymentHooksEmitter extends EventEmitter {
  /**
   * Register a handler for a payment event.
   * Handlers are wrapped to catch errors and log them without propagating.
   */
  override on<T extends PaymentEventName>(
    event: T,
    handler: EventHandler<T>
  ): this {
    const wrappedHandler = async (payload: PaymentEventPayload<T>) => {
      try {
        await handler(payload);
      } catch (error) {
        logger.error({
          type: "payment:hook:error",
          event,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    return super.on(event, wrappedHandler);
  }

  /**
   * Emit a payment event. All registered handlers are executed in parallel.
   * Returns true if the event had listeners, false otherwise.
   */
  override emit<T extends PaymentEventName>(
    event: T,
    payload: PaymentEventPayload<T>
  ): boolean {
    return super.emit(event, payload);
  }
}

// Singleton instance
export const PaymentHooks = new PaymentHooksEmitter();

// Re-export types
export type {
  PaymentEventName,
  PaymentEventPayload,
  PaymentEvents,
} from "./hooks.types";
