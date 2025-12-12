import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import {
  cancelSubscriptionBodySchema,
  cancelSubscriptionResponseSchema,
  getSubscriptionQuerySchema,
  restoreSubscriptionBodySchema,
  restoreSubscriptionResponseSchema,
  subscriptionResponseSchema,
} from "./subscription.model";
import { SubscriptionService } from "./subscription.service";

export const subscriptionController = new Elysia({
  name: "subscription",
  prefix: "/subscription",
  detail: { tags: ["Payments - Subscription"] },
})
  .use(betterAuthPlugin)
  .get(
    "/",
    ({ query }) =>
      SubscriptionService.getByOrganizationId(query.organizationId),
    {
      permissions: { subscription: ["read"] },
      query: getSubscriptionQuerySchema,
      response: subscriptionResponseSchema,
      detail: { summary: "Get organization subscription" },
    }
  )
  .post(
    "/cancel",
    ({ body }) => SubscriptionService.cancel(body.organizationId),
    {
      permissions: { subscription: ["update"] },
      body: cancelSubscriptionBodySchema,
      response: cancelSubscriptionResponseSchema,
      detail: { summary: "Cancel subscription at period end" },
    }
  )
  .post(
    "/restore",
    ({ body }) => SubscriptionService.restore(body.organizationId),
    {
      permissions: { subscription: ["update"] },
      body: restoreSubscriptionBodySchema,
      response: restoreSubscriptionResponseSchema,
      detail: { summary: "Restore canceled subscription" },
    }
  );
