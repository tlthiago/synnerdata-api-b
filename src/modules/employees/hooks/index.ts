import { EventEmitter } from "node:events";
import { logger } from "@/lib/logger";
import type { EmployeeEventName, EmployeeEventPayload } from "./hooks.types";

type EventHandler<T extends EmployeeEventName> = (
  payload: EmployeeEventPayload<T>
) => void | Promise<void>;

/**
 * EmployeeHooksEmitter extends Node's native EventEmitter with:
 * - TypeScript type safety for employee events
 * - Automatic error handling for async handlers
 * - Parallel execution of all handlers
 */
class EmployeeHooksEmitter extends EventEmitter {
  /**
   * Register a handler for an employee event.
   * Handlers are wrapped to catch errors and log them without propagating.
   */
  override on<T extends EmployeeEventName>(
    event: T,
    handler: EventHandler<T>
  ): this {
    const wrappedHandler = async (payload: EmployeeEventPayload<T>) => {
      try {
        await handler(payload);
      } catch (error) {
        logger.error({
          type: "employee:hook:error",
          event,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    return super.on(event, wrappedHandler);
  }

  /**
   * Emit an employee event. All registered handlers are executed in parallel.
   * Returns true if the event had listeners, false otherwise.
   */
  override emit<T extends EmployeeEventName>(
    event: T,
    payload: EmployeeEventPayload<T>
  ): boolean {
    return super.emit(event, payload);
  }
}

// Singleton instance
export const EmployeeHooks = new EmployeeHooksEmitter();
