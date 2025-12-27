import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import { wrapSuccess } from "@/lib/responses/envelope";
import {
  conflictErrorSchema,
  forbiddenErrorSchema,
  notFoundErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import {
  billingStatusResponseSchema,
  getProfileResponseSchema,
  updateProfileResponseSchema,
  updateProfileSchema,
} from "../organization.model";
import { OrganizationService } from "../organization.service";

export const profileController = new Elysia({
  name: "organization-profile",
  prefix: "/v1/organizations",
  detail: { tags: ["Organizations"] },
})
  .use(betterAuthPlugin)
  .get(
    "/profile",
    async ({ session }) =>
      wrapSuccess(
        await OrganizationService.getProfileOrThrow(
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { organization: ["read"] },
        requireOrganization: true,
      },
      response: {
        200: getProfileResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        summary: "Get organization profile",
        description: "Returns the profile of the active organization",
      },
    }
  )
  .put(
    "/profile",
    async ({ session, body, user }) =>
      wrapSuccess(
        await OrganizationService.updateProfile(
          session.activeOrganizationId as string,
          body,
          user.id
        )
      ),
    {
      auth: {
        permissions: { organization: ["update"] },
        requireOrganization: true,
      },
      body: updateProfileSchema,
      response: {
        200: updateProfileResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
        409: conflictErrorSchema,
        422: validationErrorSchema,
      },
      detail: {
        summary: "Update organization profile",
        description:
          "Updates the profile of the active organization. Only organization owners can update.",
      },
    }
  )
  .get(
    "/billing-status",
    async ({ session }) =>
      wrapSuccess(
        await OrganizationService.checkBillingRequirements(
          session.activeOrganizationId as string
        )
      ),
    {
      auth: {
        permissions: { organization: ["read"] },
        requireOrganization: true,
      },
      response: {
        200: billingStatusResponseSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "Get billing status",
        description:
          "Returns whether the organization profile is complete for billing",
      },
    }
  );
