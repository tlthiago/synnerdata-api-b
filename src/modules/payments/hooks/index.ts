import type { PaymentEventName, PaymentEventPayload } from "./hooks.types";

type EventHandler<T extends PaymentEventName> = (
  payload: PaymentEventPayload<T>
) => void | Promise<void>;

class PaymentHooksEmitter {
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
        console.error(`Error in payment hook handler for ${event}:`, error);
      })
    );

    await Promise.all(promises);
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
