import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import {
  createPlanRequestSchema,
  deletePlanResponseSchema,
  planIdParamsSchema,
  planListResponseSchema,
  planResponseSchema,
  syncPlanResponseSchema,
  updatePlanRequestSchema,
} from "./plan.model";
import { PlanService } from "./plan.service";

/**
 * Public routes - no authentication required
 */
export const planPublicController = new Elysia({
  name: "plan-public",
  prefix: "/plans",
  detail: { tags: ["Payments - Plans"] },
})
  .get(
    "/",
    async () => {
      const plans = await PlanService.list();
      return { plans };
    },
    {
      response: planListResponseSchema,
      detail: { summary: "List available plans" },
    }
  )
  .get("/:id", ({ params }) => PlanService.getById(params.id), {
    params: planIdParamsSchema,
    response: planResponseSchema,
    detail: { summary: "Get plan details" },
  });

/**
 * Protected routes - authentication required
 * Uses betterAuthPlugin macros for auth
 */
export const planProtectedController = new Elysia({
  name: "plan-protected",
  prefix: "/plans",
  detail: { tags: ["Payments - Plans (Admin)"] },
})
  .use(betterAuthPlugin)
  .post("/", ({ body }) => PlanService.create(body), {
    auth: true,
    body: createPlanRequestSchema,
    response: planResponseSchema,
    detail: { summary: "Create a new plan" },
  })
  .put("/:id", ({ params, body }) => PlanService.update(params.id, body), {
    auth: true,
    params: planIdParamsSchema,
    body: updatePlanRequestSchema,
    response: planResponseSchema,
    detail: { summary: "Update a plan" },
  })
  .delete(
    "/:id",
    async ({ params }) => {
      await PlanService.delete(params.id);
      return { success: true };
    },
    {
      auth: true,
      params: planIdParamsSchema,
      response: deletePlanResponseSchema,
      detail: { summary: "Delete a plan" },
    }
  )
  .post(
    "/:id/sync",
    async ({ params }) => {
      const pagarmePlanId = await PlanService.syncToPagarme(params.id);
      return { id: params.id, pagarmePlanId };
    },
    {
      auth: true,
      params: planIdParamsSchema,
      response: syncPlanResponseSchema,
      detail: { summary: "Sync plan to Pagarme" },
    }
  );
