import { Elysia } from "elysia";
import { z } from "zod";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import { wrapSuccess } from "@/lib/responses/envelope";
import {
  badRequestErrorSchema,
  conflictErrorSchema,
  forbiddenErrorSchema,
  notFoundErrorSchema,
  successResponseSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import {
  createProvisionCheckoutResponseSchema,
  createProvisionCheckoutSchema,
  createProvisionTrialResponseSchema,
  createProvisionTrialSchema,
  listProvisionsQuerySchema,
  listProvisionsResponseSchema,
} from "./admin-provision.model";
import { AdminProvisionService } from "./admin-provision.service";

const deleteProvisionResponseSchema = successResponseSchema(
  z.object({ deleted: z.literal(true) })
);

export const adminProvisionController = new Elysia({
  name: "admin-provision",
  prefix: "/admin/provisions",
  detail: { tags: ["Payments - Admin Provisions"] },
})
  .use(betterAuthPlugin)
  // POST /trial — Create user+org with trial
  .post(
    "/trial",
    async ({ user, body, request }) =>
      wrapSuccess(
        await AdminProvisionService.createWithTrial({
          ...body,
          adminUserId: user.id,
          adminUserName: user.name,
          headers: request.headers,
        })
      ),
    {
      auth: { requireAdmin: true },
      body: createProvisionTrialSchema,
      response: {
        201: createProvisionTrialResponseSchema,
        422: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        409: conflictErrorSchema,
      },
      detail: {
        summary: "Provision organization with trial",
        description:
          "Admin-only endpoint to create a user + organization with a 14-day trial. Owner receives an activation email.",
      },
    }
  )
  // POST /checkout — Create user+org with checkout link
  .post(
    "/checkout",
    async ({ user, body, request }) =>
      wrapSuccess(
        await AdminProvisionService.createWithCheckout({
          ...body,
          adminUserId: user.id,
          adminUserName: user.name,
          headers: request.headers,
        })
      ),
    {
      auth: { requireAdmin: true },
      body: createProvisionCheckoutSchema,
      response: {
        201: createProvisionCheckoutResponseSchema,
        422: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
      },
      detail: {
        summary: "Provision organization with checkout",
        description:
          "Admin-only endpoint to create a user + organization with a Pagarme payment link. Owner receives checkout link email.",
      },
    }
  )
  // GET / — List provisions
  .get(
    "/",
    async ({ query }) => {
      const parsed = listProvisionsQuerySchema.parse(query);
      const result = await AdminProvisionService.list(parsed);
      return { success: true as const, ...result };
    },
    {
      auth: { requireAdmin: true },
      response: {
        200: listProvisionsResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List provisions",
        description:
          "Admin-only endpoint to list all provisioned organizations.",
      },
    }
  )
  // POST /:id/resend-activation — Resend activation email
  .post(
    "/:id/resend-activation",
    async ({ params, request }) =>
      wrapSuccess(
        await AdminProvisionService.resendActivation(params.id, request.headers)
      ),
    {
      auth: { requireAdmin: true },
      response: {
        200: createProvisionTrialResponseSchema,
        400: badRequestErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Resend activation email",
        description:
          "Admin-only endpoint to resend the account activation email for a provisioned user.",
      },
    }
  )
  // POST /:id/regenerate-checkout — Regenerate expired checkout link
  .post(
    "/:id/regenerate-checkout",
    async ({ user, params }) =>
      wrapSuccess(
        await AdminProvisionService.regenerateCheckout(params.id, user.id)
      ),
    {
      auth: { requireAdmin: true },
      response: {
        200: createProvisionCheckoutResponseSchema,
        400: badRequestErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Regenerate checkout link",
        description:
          "Admin-only endpoint to regenerate an expired Pagarme checkout link.",
      },
    }
  )
  // DELETE /:id — Delete provision (org + user)
  .delete(
    "/:id",
    async ({ user, params }) => {
      await AdminProvisionService.deleteProvision(params.id, user.id);
      return wrapSuccess({ deleted: true as const });
    },
    {
      auth: { requireAdmin: true },
      response: {
        200: deleteProvisionResponseSchema,
        400: badRequestErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Delete provision",
        description:
          "Admin-only endpoint to delete a provisioned organization and user. Hard deletes org/user, soft-deletes provision for audit.",
      },
    }
  );
