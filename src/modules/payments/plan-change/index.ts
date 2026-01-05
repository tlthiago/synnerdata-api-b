import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import { wrapSuccess } from "@/lib/responses/envelope";
import {
  forbiddenErrorSchema,
  notFoundErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import {
  cancelScheduledChangeResponseSchema,
  changeSubscriptionResponseSchema,
  changeSubscriptionSchema,
  getScheduledChangeResponseSchema,
  previewChangeResponseSchema,
  previewChangeSchema,
} from "./plan-change.model";
import { PlanChangeService } from "./plan-change.service";

export const planChangeController = new Elysia({
  name: "plan-change",
  prefix: "/subscription",
  detail: { tags: ["Payments - Plan Change"] },
})
  .use(betterAuthPlugin)
  .post(
    "/change",
    async ({ user, session, body }) =>
      wrapSuccess(
        await PlanChangeService.changeSubscription({
          ...body,
          userId: user.id,
          organizationId: session.activeOrganizationId as string,
        })
      ),
    {
      auth: {
        permissions: { subscription: ["update"] },
        requireOrganization: true,
      },
      body: changeSubscriptionSchema,
      response: {
        200: changeSubscriptionResponseSchema,
        422: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Change subscription",
        description:
          "Unified endpoint to change plan, billing cycle, and/or employee count. Upgrades are processed immediately via payment link. Downgrades are scheduled for the end of the current billing period.",
      },
    }
  )
  .delete(
    "/scheduled-change",
    async ({ user, session }) =>
      wrapSuccess(
        await PlanChangeService.cancelScheduledChange({
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
        200: cancelScheduledChangeResponseSchema,
        422: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Cancel scheduled plan change",
        description:
          "Cancels a scheduled plan change (downgrade). The current plan will continue after the current billing period.",
      },
    }
  )
  .get(
    "/scheduled-change",
    async ({ session }) =>
      wrapSuccess(
        await PlanChangeService.getScheduledChange(
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { subscription: ["read"] },
        requireOrganization: true,
      },
      response: {
        200: getScheduledChangeResponseSchema,
        422: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Get scheduled plan change",
        description:
          "Returns information about any scheduled plan change, including the pending plan and scheduled date.",
      },
    }
  )
  .post(
    "/preview-change",
    async ({ session, body }) =>
      wrapSuccess(
        await PlanChangeService.previewChange({
          ...body,
          organizationId: session.activeOrganizationId as string,
        })
      ),
    {
      auth: {
        permissions: { subscription: ["read"] },
        requireOrganization: true,
      },
      body: previewChangeSchema,
      response: {
        200: previewChangeResponseSchema,
        422: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Preview subscription change",
        description:
          "Returns a preview of what would happen if the subscription change was executed. Does not make any changes. Useful for confirmation modals.",
      },
    }
  );
