import { Elysia } from "elysia";
import {
  createCheckoutResponseSchema,
  createCheckoutSchema,
} from "./checkout.model";
import { CheckoutService } from "./checkout.service";

type AuthUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

type AuthContext = {
  user: AuthUser;
  requirePermission: (
    permissions: Record<string, string[]>,
    errorMessage?: string
  ) => Promise<void>;
};

export const checkoutController = new Elysia({
  name: "checkout",
  prefix: "/checkout",
  detail: { tags: ["Payments - Checkout"] },
}).post(
  "/",
  async (ctx) => {
    const { user, requirePermission } = ctx as unknown as AuthContext;

    // Only owner can upgrade subscription
    await requirePermission(
      { subscription: ["update"] },
      "You don't have permission to upgrade the subscription"
    );

    return CheckoutService.create({
      ...ctx.body,
      userId: user.id,
    });
  },
  {
    body: createCheckoutSchema,
    response: createCheckoutResponseSchema,
    detail: { summary: "Create checkout session for upgrade" },
  }
);
