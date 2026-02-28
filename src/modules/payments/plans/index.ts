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
  createPlanResponseSchema,
  createPlanSchema,
  deletePlanResponseSchema,
  getPlanResponseSchema,
  listArchivedTiersResponseSchema,
  listPlansResponseSchema,
  planIdParamsSchema,
  updatePlanResponseSchema,
  updatePlanSchema,
} from "./plans.model";
import { PlansService } from "./plans.service";

export const plansPublicController = new Elysia({
  name: "plans-public",
  prefix: "/plans",
  detail: { tags: ["Payments - Plans"] },
}).get("/", async () => wrapSuccess(await PlansService.list()), {
  response: {
    200: listPlansResponseSchema,
    422: validationErrorSchema,
  },
  detail: {
    summary: "List available plans",
    description:
      "Returns all active and public plans with their pricing tiers.",
  },
});

export const plansProtectedController = new Elysia({
  name: "plans-protected",
  prefix: "/plans",
  detail: { tags: ["Payments - Plans (Admin)"] },
})
  .use(betterAuthPlugin)
  .get("/all", async () => wrapSuccess(await PlansService.listAll()), {
    auth: { requireAdmin: true },
    response: {
      200: listPlansResponseSchema,
      401: unauthorizedErrorSchema,
      403: forbiddenErrorSchema,
    },
    detail: {
      summary: "List all plans (Admin)",
      description:
        "Returns all plans including inactive and private ones. Requires admin privileges.",
    },
  })
  .get(
    "/:id",
    async ({ params }) => wrapSuccess(await PlansService.getById(params.id)),
    {
      auth: { requireAdmin: true },
      params: planIdParamsSchema,
      response: {
        200: getPlanResponseSchema,
        422: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Get plan details (Admin)",
        description:
          "Returns details of a specific plan with its pricing tiers. Requires admin privileges.",
      },
    }
  )
  .get(
    "/:id/archived-tiers",
    async ({ params }) =>
      wrapSuccess(await PlansService.listArchivedTiers(params.id)),
    {
      auth: { requireAdmin: true },
      params: planIdParamsSchema,
      response: {
        200: listArchivedTiersResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "List archived pricing tiers (Admin)",
        description:
          "Returns archived pricing tiers for a plan with the count of active subscriptions still referencing each tier. Requires admin privileges.",
      },
    }
  )
  .post("/", async ({ body }) => wrapSuccess(await PlansService.create(body)), {
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
        "Creates a new subscription plan with pricing tiers. Requires admin privileges. Non-trial plans must include exactly 10 pricing tiers matching the fixed employee ranges.",
    },
  })
  .put(
    "/:id",
    async ({ params, body }) =>
      wrapSuccess(await PlansService.update(params.id, body)),
    {
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
          "Updates an existing subscription plan. Optionally replaces all pricing tiers. Requires admin privileges.",
      },
    }
  )
  .delete(
    "/:id",
    async ({ params }) => wrapSuccess(await PlansService.delete(params.id)),
    {
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
        description:
          "Deletes a subscription plan and its pricing tiers. Cannot delete plans with active subscriptions. Requires admin privileges.",
      },
    }
  );
