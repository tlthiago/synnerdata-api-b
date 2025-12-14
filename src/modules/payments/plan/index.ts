import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import {
  forbiddenErrorSchema,
  notFoundErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import {
  createPlanResponseSchema,
  createPlanSchema,
  deletePlanResponseSchema,
  getPlanResponseSchema,
  listPlansResponseSchema,
  planIdParamsSchema,
  syncPlanResponseSchema,
  updatePlanResponseSchema,
  updatePlanSchema,
} from "./plan.model";
import { PlanService } from "./plan.service";

export const planPublicController = new Elysia({
  name: "plan-public",
  prefix: "/plans",
  detail: { tags: ["Payments - Plans"] },
})
  .get("/", () => PlanService.list(), {
    response: {
      200: listPlansResponseSchema,
      422: validationErrorSchema,
    },
    detail: {
      summary: "List available plans",
      description:
        "Returns all active and public plans available for subscription.",
    },
  })
  .get("/:id", ({ params }) => PlanService.getById(params.id), {
    params: planIdParamsSchema,
    response: {
      200: getPlanResponseSchema,
      422: validationErrorSchema,
      404: notFoundErrorSchema,
    },
    detail: {
      summary: "Get plan details",
      description: "Returns details of a specific plan by ID.",
    },
  });

export const planProtectedController = new Elysia({
  name: "plan-protected",
  prefix: "/plans",
  detail: { tags: ["Payments - Plans (Admin)"] },
})
  .use(betterAuthPlugin)
  .post("/", ({ body }) => PlanService.create(body), {
    auth: { requireAdmin: true },
    body: createPlanSchema,
    response: {
      200: createPlanResponseSchema,
      422: validationErrorSchema,
      401: unauthorizedErrorSchema,
      403: forbiddenErrorSchema,
    },
    detail: {
      summary: "Create a new plan",
      description:
        "Creates a new subscription plan. Requires admin privileges.",
    },
  })
  .put("/:id", ({ params, body }) => PlanService.update(params.id, body), {
    auth: { requireAdmin: true },
    params: planIdParamsSchema,
    body: updatePlanSchema,
    response: {
      200: updatePlanResponseSchema,
      422: validationErrorSchema,
      401: unauthorizedErrorSchema,
      403: forbiddenErrorSchema,
      404: notFoundErrorSchema,
    },
    detail: {
      summary: "Update a plan",
      description:
        "Updates an existing subscription plan. Requires admin privileges.",
    },
  })
  .delete("/:id", ({ params }) => PlanService.delete(params.id), {
    auth: { requireAdmin: true },
    params: planIdParamsSchema,
    response: {
      200: deletePlanResponseSchema,
      422: validationErrorSchema,
      401: unauthorizedErrorSchema,
      403: forbiddenErrorSchema,
      404: notFoundErrorSchema,
    },
    detail: {
      summary: "Delete a plan",
      description: "Deletes a subscription plan. Requires admin privileges.",
    },
  })
  .post("/:id/sync", ({ params }) => PlanService.syncToPagarme(params.id), {
    auth: { requireAdmin: true },
    params: planIdParamsSchema,
    response: {
      200: syncPlanResponseSchema,
      422: validationErrorSchema,
      401: unauthorizedErrorSchema,
      403: forbiddenErrorSchema,
      404: notFoundErrorSchema,
    },
    detail: {
      summary: "Sync plan to Pagarme",
      description:
        "Syncs the plan to Pagarme payment gateway. Requires admin privileges.",
    },
  });
