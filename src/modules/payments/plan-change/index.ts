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
  changeBillingCycleResponseSchema,
  changeBillingCycleSchema,
  changePlanResponseSchema,
  changePlanSchema,
  getScheduledChangeResponseSchema,
} from "./plan-change.model";
import { PlanChangeService } from "./plan-change.service";

export const planChangeController = new Elysia({
  name: "plan-change",
  prefix: "/subscription",
  detail: { tags: ["Payments - Plan Change"] },
})
  .use(betterAuthPlugin)
  .post(
    "/change-plan",
    async ({ user, session, body }) =>
      wrapSuccess(
        await PlanChangeService.changePlan({
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
      body: changePlanSchema,
      response: {
        200: changePlanResponseSchema,
        422: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Change subscription plan",
        description:
          "Changes the subscription to a different plan. Upgrades are processed immediately via payment link. Downgrades are scheduled for the end of the current billing period.",
      },
    }
  )
  .post(
    "/change-billing-cycle",
    async ({ user, session, body }) =>
      wrapSuccess(
        await PlanChangeService.changeBillingCycle({
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
      body: changeBillingCycleSchema,
      response: {
        200: changeBillingCycleResponseSchema,
        422: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Change billing cycle",
        description:
          "Changes the billing cycle between monthly and yearly. Monthly to yearly is processed immediately via payment link. Yearly to monthly is scheduled for the end of the current billing period.",
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
  );
