import { z } from "zod";

export const createCheckoutSchema = z.object({
  planId: z.string().min(1),
  successUrl: z.httpUrl(),
});

export const createCheckoutResponseSchema = z.object({
  checkoutUrl: z.url(),
  paymentLinkId: z.string(),
});

export type CreateCheckout = z.infer<typeof createCheckoutSchema>;
export type CreateCheckoutInput = CreateCheckout & {
  userId: string;
  organizationId: string;
};
export type CreateCheckoutResponse = z.infer<
  typeof createCheckoutResponseSchema
>;
export type CheckoutResponse = CreateCheckoutResponse;
