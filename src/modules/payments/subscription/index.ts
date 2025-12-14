import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import {
  forbiddenErrorSchema,
  notFoundErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import {
  cancelSubscriptionResponseSchema,
  getSubscriptionResponseSchema,
  restoreSubscriptionResponseSchema,
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
    ({ user, session }) =>
      SubscriptionService.getByOrganizationId({
        userId: user.id,
        organizationId: session.activeOrganizationId as string,
      }),
    {
      auth: {
        permissions: { subscription: ["read"] },
        requireOrganization: true,
      },
      response: {
        200: getSubscriptionResponseSchema,
        400: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Get organization subscription",
        description:
          "Returns the subscription details for the active organization, including plan information, trial status, and billing period.",
      },
    }
  )
  .post(
    "/cancel",
    ({ user, session }) =>
      SubscriptionService.cancel({
        userId: user.id,
        organizationId: session.activeOrganizationId as string,
      }),
    {
      auth: {
        permissions: { subscription: ["update"] },
        requireOrganization: true,
      },
      response: {
        200: cancelSubscriptionResponseSchema,
        400: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Cancel subscription at period end",
        description:
          "Schedules the subscription to be canceled at the end of the current billing period. The subscription remains active until then.",
      },
    }
  )
  .post(
    "/restore",
    ({ user, session }) =>
      SubscriptionService.restore({
        userId: user.id,
        organizationId: session.activeOrganizationId as string,
      }),
    {
      auth: {
        permissions: { subscription: ["update"] },
        requireOrganization: true,
      },
      response: {
        200: restoreSubscriptionResponseSchema,
        400: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Restore canceled subscription",
        description:
          "Restores a subscription that was scheduled for cancellation, reactivating it before the period ends.",
      },
    }
  );
