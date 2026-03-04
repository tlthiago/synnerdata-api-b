import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

const isProduction = process.env.NODE_ENV === "production";

export const createCheckoutSchema = z.object({
  planId: z.string().min(1).describe("ID of the plan to checkout"),
  tierId: z.string().min(1).describe("ID of the pricing tier"),
  billingCycle: z
    .enum(["monthly", "yearly"])
    .default("monthly")
    .describe("Billing cycle: monthly or yearly"),
  successUrl: (isProduction ? z.httpUrl() : z.url()).describe(
    "URL to redirect after successful payment"
  ),
});

const checkoutDataSchema = z.object({
  checkoutUrl: z.url().describe("URL to complete the payment"),
  paymentLinkId: z.string().describe("Payment link ID from payment provider"),
});

export const createCheckoutResponseSchema =
  successResponseSchema(checkoutDataSchema);

export type CreateCheckout = z.infer<typeof createCheckoutSchema>;
export type CreateCheckoutInput = CreateCheckout & {
  userId: string;
  organizationId: string;
};
export type CheckoutData = z.infer<typeof checkoutDataSchema>;
export type CreateCheckoutResponse = z.infer<
  typeof createCheckoutResponseSchema
>;
