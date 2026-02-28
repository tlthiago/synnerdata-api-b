import { Elysia } from "elysia";
import { adminCheckoutController } from "./admin-checkout";
import { adminProvisionController } from "./admin-provision";
import { billingController } from "./billing";
import { checkoutController } from "./checkout";
import { customerController } from "./customer";
import { jobsController } from "./jobs";
import { orphanedPlansController } from "./pagarme/pagarme-orphaned-plans.controller";
import { planChangeController } from "./plan-change";
import { plansProtectedController, plansPublicController } from "./plans";
import { priceAdjustmentController } from "./price-adjustment";
import { subscriptionController } from "./subscription";
import { webhookController } from "./webhook";

export const paymentsController = new Elysia({
  name: "payments",
  prefix: "/v1/payments",
  detail: { tags: ["Payments"] },
})
  .use(plansPublicController)
  .use(webhookController)
  .use(plansProtectedController)
  .use(checkoutController)
  .use(adminCheckoutController)
  .use(adminProvisionController)
  .use(orphanedPlansController)
  .use(subscriptionController)
  .use(planChangeController)
  .use(priceAdjustmentController)
  .use(billingController)
  .use(customerController)
  .use(jobsController);
