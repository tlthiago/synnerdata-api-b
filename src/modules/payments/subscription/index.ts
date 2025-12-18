import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import { wrapSuccess } from "@/lib/responses/envelope";
import {
  forbiddenErrorSchema,
  notFoundErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import { capabilitiesResponseSchema } from "@/modules/payments/limits/limits.model";
import { LimitsService } from "@/modules/payments/limits/limits.service";
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
    async ({ user, session }) =>
      wrapSuccess(
        await SubscriptionService.getByOrganizationId({
          userId: user.id,
          organizationId: session.activeOrganizationId as string,
        })
      ),
    {
      auth: {
        permissions: { subscription: ["read"] },
        requireOrganization: true,
      },
      response: {
        200: getSubscriptionResponseSchema,
        422: validationErrorSchema,
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
  .get(
    "/capabilities",
    async ({ session }) =>
      wrapSuccess(
        await LimitsService.getCapabilities(
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        requireOrganization: true,
      },
      response: {
        200: capabilitiesResponseSchema,
        422: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "Get organization capabilities",
        description:
          "Returns the organization's subscription status, current plan, and all available features with access information.",
      },
    }
  )
  .post(
    "/cancel",
    async ({ user, session }) =>
      wrapSuccess(
        await SubscriptionService.cancel({
          userId: user.id,
          organizationId: session.activeOrganizationId as string,
        })
      ),
    {
      auth: {
        permissions: { subscription: ["update"] },
        requireOrganization: true,
      },
      response: {
        200: cancelSubscriptionResponseSchema,
        422: validationErrorSchema,
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
    async ({ user, session }) =>
      wrapSuccess(
        await SubscriptionService.restore({
          userId: user.id,
          organizationId: session.activeOrganizationId as string,
        })
      ),
    {
      auth: {
        permissions: { subscription: ["update"] },
        requireOrganization: true,
      },
      response: {
        200: restoreSubscriptionResponseSchema,
        422: validationErrorSchema,
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
