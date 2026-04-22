import { Elysia } from "elysia";
import { isProduction } from "@/env";
import { wrapSuccess } from "@/lib/responses/envelope";
import {
  forbiddenErrorSchema,
  notFoundErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import { betterAuthPlugin } from "@/plugins/auth/auth-plugin";
import {
  createCheckoutResponseSchema,
  createCheckoutSchema,
} from "./checkout.model";
import { CheckoutService } from "./checkout.service";

export const checkoutController = new Elysia({
  name: "checkout",
  prefix: "/checkout",
  detail: { tags: ["Payments - Checkout"] },
})
  .use(betterAuthPlugin)
  .post(
    "/",
    async ({ user, session, body }) =>
      wrapSuccess(
        await CheckoutService.create({
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
      body: createCheckoutSchema,
      response: {
        200: createCheckoutResponseSchema,
        422: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Create checkout session for upgrade",
        description:
          "Creates a payment link for the user to upgrade their subscription plan. Requires an active organization and subscription update permission.",
      },
    }
  );
