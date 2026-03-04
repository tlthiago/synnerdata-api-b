import { Elysia } from "elysia";
import { isProduction } from "@/env";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import { wrapSuccess } from "@/lib/responses/envelope";
import {
  forbiddenErrorSchema,
  notFoundErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import {
  adjustBulkBodySchema,
  adjustBulkResponseSchema,
  adjustIndividualBodySchema,
  adjustIndividualParamsSchema,
  adjustIndividualResponseSchema,
  getHistoryParamsSchema,
  getHistoryQuerySchema,
  getHistoryResponseSchema,
} from "./price-adjustment.model";
import { PriceAdjustmentService } from "./price-adjustment.service";

export const priceAdjustmentController = new Elysia({
  name: "price-adjustment",
  prefix: "/price-adjustments",
  detail: { tags: ["Payments - Price Adjustment"] },
})
  .use(betterAuthPlugin)
  .post(
    "/subscriptions/:subscriptionId",
    async ({ user, params, body }) =>
      wrapSuccess(
        await PriceAdjustmentService.adjustIndividual({
          ...body,
          subscriptionId: params.subscriptionId,
          adminId: user.id,
        })
      ),
    {
      auth: { requireAdmin: true },
      params: adjustIndividualParamsSchema,
      body: adjustIndividualBodySchema,
      response: {
        200: adjustIndividualResponseSchema,
        400: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Adjust price for individual subscription",
        description:
          "Admin-only endpoint to adjust the price for a specific subscription. Creates a dedicated Pagar.me plan and updates the subscription price. Takes effect from the next billing cycle.",
      },
    }
  )
  .post(
    "/bulk",
    async ({ user, body }) =>
      wrapSuccess(
        await PriceAdjustmentService.adjustBulk({
          ...body,
          adminId: user.id,
        })
      ),
    {
      auth: { requireAdmin: true },
      body: adjustBulkBodySchema,
      response: {
        200: adjustBulkResponseSchema,
        400: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Bulk price adjustment by tier",
        description:
          "Admin-only endpoint to adjust prices for all active subscriptions on a specific tier and billing cycle. Updates the catalog plan in Pagar.me, local tier prices, and all affected subscriptions.",
      },
    }
  )
  .get(
    "/subscriptions/:subscriptionId/history",
    async ({ params, query }) => {
      const result = await PriceAdjustmentService.getHistory({
        subscriptionId: params.subscriptionId,
        ...query,
      });
      return { success: true as const, ...result };
    },
    {
      auth: { requireAdmin: true },
      params: getHistoryParamsSchema,
      query: getHistoryQuerySchema,
      response: {
        200: getHistoryResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Get price adjustment history",
        description:
          "Returns the price adjustment history for a specific subscription, ordered by most recent first.",
      },
    }
  );
