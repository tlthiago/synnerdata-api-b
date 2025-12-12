import { Elysia } from "elysia";
import { billingController } from "./billing";
import { checkoutController } from "./checkout";
import { customerController } from "./customer";
import { PaymentError } from "./errors";
import { planProtectedController, planPublicController } from "./plan";
import { subscriptionController } from "./subscription";
import { webhookController } from "./webhook";

export const paymentsController = new Elysia({
  name: "payments",
  prefix: "/v1/payments",
  detail: { tags: ["Payments"] },
})
  // Register custom error handler
  .error({ PaymentError })
  .onError(({ error, set }) => {
    if (error instanceof PaymentError) {
      set.status = error.status;
      return error.toResponse();
    }
  })
  // Public routes (no auth required)
  .use(planPublicController)
  .use(webhookController)
  // Protected routes (auth required via guard)
  .guard(
    {
      // @ts-expect-error - auth macro from betterAuthPlugin
      auth: true,
    },
    (app) =>
      app
        .use(planProtectedController)
        .use(checkoutController)
        .use(subscriptionController)
        .use(billingController)
        .use(customerController)
  );

export { CustomerService } from "./customer/customer.service";
export type { PaymentEventName, PaymentEvents } from "./hooks";
export { PaymentHooks } from "./hooks";
export { PlanService } from "./plan/plan.service";
// Re-export services for use in other parts of the application
export { SubscriptionService } from "./subscription/subscription.service";
