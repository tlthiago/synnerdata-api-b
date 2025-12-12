import { z } from "zod";

// ============================================================
// INPUT SCHEMAS
// ============================================================

export const createCheckoutSchema = z.object({
  organizationId: z.string().min(1),
  planId: z.string().min(1),
  successUrl: z.httpUrl(),
});

// ============================================================
// OUTPUT SCHEMAS
// ============================================================

export const createCheckoutResponseSchema = z.object({
  checkoutUrl: z.url(),
  paymentLinkId: z.string(),
});

// ============================================================
// INFERRED TYPES
// ============================================================

export type CreateCheckout = z.infer<typeof createCheckoutSchema>;
export type CreateCheckoutInput = CreateCheckout & { userId: string };
export type CreateCheckoutResponse = z.infer<
  typeof createCheckoutResponseSchema
>;
export type CheckoutResponse = CreateCheckoutResponse;
