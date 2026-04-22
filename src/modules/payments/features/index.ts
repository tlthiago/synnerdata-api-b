import { Elysia } from "elysia";
import { isProduction } from "@/env";
import { wrapSuccess } from "@/lib/responses/envelope";
import {
  badRequestErrorSchema,
  conflictErrorSchema,
  forbiddenErrorSchema,
  notFoundErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import { betterAuthPlugin } from "@/plugins/auth/auth-plugin";
import {
  createFeatureResponseSchema,
  createFeatureSchema,
  deleteFeatureResponseSchema,
  featureIdParamsSchema,
  listFeaturesResponseSchema,
  listPublicFeaturesResponseSchema,
  updateFeatureResponseSchema,
  updateFeatureSchema,
} from "./features.model";
import { FeaturesService } from "./features.service";

export const featuresPublicController = new Elysia({
  name: "features-public",
  prefix: "/features",
  detail: { tags: ["Payments - Features"] },
}).get("/", async () => wrapSuccess(await FeaturesService.listPublic()), {
  response: {
    200: listPublicFeaturesResponseSchema,
    422: validationErrorSchema,
  },
  detail: {
    hide: isProduction,
    summary: "List active features",
    description:
      "Returns all active features with metadata for the pricing page. No authentication required.",
  },
});

export const featuresProtectedController = new Elysia({
  name: "features-protected",
  prefix: "/features",
  detail: { tags: ["Payments - Features (Admin)"] },
})
  .use(betterAuthPlugin)
  .get("/all", async () => wrapSuccess(await FeaturesService.list()), {
    auth: { requireAdmin: true },
    response: {
      200: listFeaturesResponseSchema,
      401: unauthorizedErrorSchema,
      403: forbiddenErrorSchema,
    },
    detail: {
      hide: isProduction,
      summary: "List all features (Admin)",
      description:
        "Returns all features (active and inactive) with the count of plans using each feature. Requires admin privileges.",
    },
  })
  .post(
    "/",
    async ({ user, body }) =>
      wrapSuccess(await FeaturesService.create({ ...body, userId: user.id })),
    {
      auth: { requireAdmin: true },
      body: createFeatureSchema,
      response: {
        200: createFeatureResponseSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Create a feature",
        description:
          "Creates a new feature. The ID is a snake_case identifier used as a contract in code. Requires admin privileges.",
      },
    }
  )
  .put(
    "/:id",
    async ({ user, params, body }) =>
      wrapSuccess(
        await FeaturesService.update(params.id, { ...body, userId: user.id })
      ),
    {
      auth: { requireAdmin: true },
      params: featureIdParamsSchema,
      body: updateFeatureSchema,
      response: {
        200: updateFeatureResponseSchema,
        422: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Update a feature",
        description:
          "Updates metadata of an existing feature. Cannot change the ID. Requires admin privileges.",
      },
    }
  )
  .delete(
    "/:id",
    async ({ user, params }) =>
      wrapSuccess(await FeaturesService.delete(params.id, user.id)),
    {
      auth: { requireAdmin: true },
      params: featureIdParamsSchema,
      response: {
        200: deleteFeatureResponseSchema,
        400: badRequestErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Delete/deactivate a feature",
        description:
          "If the feature is not associated with any plan, performs a hard delete. Otherwise, deactivates it (isActive = false). Requires admin privileges.",
      },
    }
  );
