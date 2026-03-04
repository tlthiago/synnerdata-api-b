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
  createApiKeyResponseSchema,
  createApiKeySchema,
  deleteApiKeyResponseSchema,
  getApiKeyResponseSchema,
  idParamSchema,
  listApiKeysQuerySchema,
  listApiKeysResponseSchema,
  revokeApiKeyResponseSchema,
} from "./api-key.model";
import { ApiKeyService } from "./api-key.service";

export const apiKeysController = new Elysia({
  name: "api-keys",
  prefix: "/api-keys",
  detail: { tags: ["Admin - API Keys"] },
})
  .use(betterAuthPlugin)
  .post(
    "/",
    async ({ body, user }) =>
      wrapSuccess(await ApiKeyService.create(user.id, body)),
    {
      auth: { requireAdmin: true },
      body: createApiKeySchema,
      response: {
        200: createApiKeyResponseSchema,
        422: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Create API Key",
        description:
          "Create a new API key for external service integration. Only admins can create keys. The key value is only returned on creation.",
      },
    }
  )
  .get(
    "/",
    async ({ query, request }) =>
      wrapSuccess(
        await ApiKeyService.list(request.headers, query.organizationId)
      ),
    {
      auth: { requireAdmin: true },
      query: listApiKeysQuerySchema,
      response: {
        200: listApiKeysResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "List API Keys",
        description:
          "List all API keys. Optionally filter by organizationId to see keys for a specific organization.",
      },
    }
  )
  .get(
    "/:id",
    async ({ params, request }) =>
      wrapSuccess(await ApiKeyService.getById(request.headers, params.id)),
    {
      auth: { requireAdmin: true },
      params: idParamSchema,
      response: {
        200: getApiKeyResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Get API Key",
        description:
          "Get details of a specific API key. The key value is never returned after creation.",
      },
    }
  )
  .post(
    "/:id/revoke",
    async ({ params, request }) =>
      wrapSuccess(await ApiKeyService.revoke(request.headers, params.id)),
    {
      auth: { requireAdmin: true },
      params: idParamSchema,
      response: {
        200: revokeApiKeyResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Revoke API Key",
        description:
          "Disable an API key without deleting it. The key can be re-enabled later if needed.",
      },
    }
  )
  .delete(
    "/:id",
    async ({ params, request }) =>
      wrapSuccess(await ApiKeyService.delete(request.headers, params.id)),
    {
      auth: { requireAdmin: true },
      params: idParamSchema,
      response: {
        200: deleteApiKeyResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Delete API Key",
        description:
          "Permanently delete an API key. This action cannot be undone.",
      },
    }
  );
