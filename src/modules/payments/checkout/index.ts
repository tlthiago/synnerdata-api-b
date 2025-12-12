import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
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
    ({ user, session, body }) =>
      CheckoutService.create({
        ...body,
        userId: user.id,
        organizationId: session.activeOrganizationId as string,
      }),
    {
      auth: {
        permissions: { subscription: ["update"] },
        requireOrganization: true,
      },
      body: createCheckoutSchema,
      response: createCheckoutResponseSchema,
      detail: { summary: "Create checkout session for upgrade" },
    }
  );
