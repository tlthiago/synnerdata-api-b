import { Elysia } from "elysia";
import { billingController } from "./billing";
import { checkoutController } from "./checkout";
import { customerController } from "./customer";
import { jobsController } from "./jobs";
import { planProtectedController, planPublicController } from "./plan";
import { subscriptionController } from "./subscription";
import { webhookController } from "./webhook";

export const paymentsController = new Elysia({
  name: "payments",
  prefix: "/v1/payments",
  detail: { tags: ["Payments"] },
})
  // Public routes (no auth required)
  .use(planPublicController)
  .use(webhookController)
  // Protected routes - each controller manages its own auth via macros
  .use(planProtectedController)
  .use(checkoutController)
  .use(subscriptionController)
  .use(billingController)
  .use(customerController)
  // Internal routes (API key protected)
  .use(jobsController);

export { CustomerService } from "./customer/customer.service";
export type { PaymentEventName, PaymentEvents } from "./hooks";
export { PaymentHooks } from "./hooks";
export { PlanService } from "./plan/plan.service";
// Re-export services for use in other parts of the application
export { SubscriptionService } from "./subscription/subscription.service";
