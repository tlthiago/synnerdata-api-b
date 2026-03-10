import { Elysia } from "elysia";
import { isProduction } from "@/env";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import { wrapSuccess } from "@/lib/responses/envelope";
import {
  badRequestErrorSchema,
  forbiddenErrorSchema,
  notFoundErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import {
  updateTrialLimitsResponseSchema,
  updateTrialLimitsSchema,
} from "./admin-subscription.model";
import { AdminSubscriptionService } from "./admin-subscription.service";

export const adminSubscriptionController = new Elysia({
  name: "admin-subscription",
  prefix: "/admin/subscriptions",
  detail: { tags: ["Payments - Admin Subscription"] },
})
  .use(betterAuthPlugin)
  .patch(
    "/:organizationId/trial-limits",
    async ({ user, params, body }) =>
      wrapSuccess(
        await AdminSubscriptionService.updateTrialLimits({
          ...body,
          organizationId: params.organizationId,
          adminUserId: user.id,
        })
      ),
    {
      auth: { requireAdmin: true },
      body: updateTrialLimitsSchema,
      response: {
        200: updateTrialLimitsResponseSchema,
        400: badRequestErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Update trial limits",
        description:
          "Admin-only endpoint to adjust maxEmployees and/or trialDays on an active or expired trial subscription.",
      },
    }
  );
