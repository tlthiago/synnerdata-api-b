import { Elysia } from "elysia";
import {
  cancelSubscriptionBodySchema,
  cancelSubscriptionResponseSchema,
  getSubscriptionQuerySchema,
  restoreSubscriptionBodySchema,
  restoreSubscriptionResponseSchema,
  subscriptionResponseSchema,
} from "./subscription.model";
import { SubscriptionService } from "./subscription.service";

type AuthContext = {
  requirePermission: (
    permissions: Record<string, string[]>,
    errorMessage?: string
  ) => Promise<void>;
};

export const subscriptionController = new Elysia({
  name: "subscription",
  prefix: "/subscription",
  detail: { tags: ["Payments - Subscription"] },
})
  .get(
    "/",
    async (ctx) => {
      const { requirePermission } = ctx as unknown as AuthContext;

      // owner, manager can view subscription
      await requirePermission(
        { subscription: ["read"] },
        "You don't have permission to view subscription details"
      );

      return SubscriptionService.getByOrganizationId(ctx.query.organizationId);
    },
    {
      query: getSubscriptionQuerySchema,
      response: subscriptionResponseSchema,
      detail: { summary: "Get organization subscription" },
    }
  )
  .post(
    "/cancel",
    async (ctx) => {
      const { requirePermission } = ctx as unknown as AuthContext;

      // Only owner can cancel subscription
      await requirePermission(
        { subscription: ["update"] },
        "You don't have permission to cancel the subscription"
      );

      return SubscriptionService.cancel(ctx.body.organizationId);
    },
    {
      body: cancelSubscriptionBodySchema,
      response: cancelSubscriptionResponseSchema,
      detail: { summary: "Cancel subscription at period end" },
    }
  )
  .post(
    "/restore",
    async (ctx) => {
      const { requirePermission } = ctx as unknown as AuthContext;

      // Only owner can restore subscription
      await requirePermission(
        { subscription: ["update"] },
        "You don't have permission to restore the subscription"
      );

      return SubscriptionService.restore(ctx.body.organizationId);
    },
    {
      body: restoreSubscriptionBodySchema,
      response: restoreSubscriptionResponseSchema,
      detail: { summary: "Restore canceled subscription" },
    }
  );
