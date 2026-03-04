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
  createAdminCheckoutResponseSchema,
  createAdminCheckoutSchema,
} from "./admin-checkout.model";
import { AdminCheckoutService } from "./admin-checkout.service";

export const adminCheckoutController = new Elysia({
  name: "admin-checkout",
  prefix: "/admin/checkout",
  detail: { tags: ["Payments - Admin Checkout"] },
})
  .use(betterAuthPlugin)
  .post(
    "/",
    async ({ user, body }) =>
      wrapSuccess(
        await AdminCheckoutService.create({
          ...body,
          adminUserId: user.id,
        })
      ),
    {
      auth: { requireAdmin: true },
      body: createAdminCheckoutSchema,
      response: {
        201: createAdminCheckoutResponseSchema,
        422: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
        404: notFoundErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "Create admin checkout with custom price",
        description:
          "Admin-only endpoint to generate a payment link with a custom (negotiated) price for a specific organization. Creates a dedicated Pagar.me plan with the custom price.",
      },
    }
  );
