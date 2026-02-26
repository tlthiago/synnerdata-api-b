import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";
import { isValidCNPJ } from "@/lib/validation/documents";

const isProduction = process.env.NODE_ENV === "production";

const billingDataSchema = z.object({
  legalName: z.string().min(1).describe("Razao social do pagador"),
  taxId: z
    .string()
    .refine((value) => isValidCNPJ(value), { message: "CNPJ invalido" })
    .describe("CNPJ do pagador"),
  email: z.email().describe("Email de cobranca"),
  phone: z.string().min(10).max(15).describe("Telefone de contato"),
  street: z.string().min(1).describe("Street name"),
  number: z.string().min(1).describe("Street number"),
  complement: z.string().optional().describe("Complement"),
  neighborhood: z.string().min(1).describe("Neighborhood"),
  city: z.string().min(1).describe("City"),
  state: z.string().length(2).describe("State (UF)"),
  zipCode: z.string().length(8).describe("ZIP code (CEP)"),
});

export const createAdminCheckoutSchema = z.object({
  organizationId: z.string().min(1).describe("Target organization ID"),
  planId: z.string().min(1).describe("Plan ID"),
  pricingTierId: z.string().min(1).describe("Pricing tier ID"),
  billingCycle: z
    .enum(["monthly", "yearly"])
    .default("monthly")
    .describe("Billing cycle"),
  customPriceMonthly: z
    .number()
    .int()
    .min(100, "Minimum price is 100 centavos (R$ 1.00)")
    .describe("Custom monthly price in centavos"),
  successUrl: (isProduction ? z.httpUrl() : z.url()).describe(
    "URL to redirect after successful payment"
  ),
  notes: z
    .string()
    .max(500)
    .optional()
    .describe("Admin notes (discount reason, contract info)"),
  billing: billingDataSchema
    .optional()
    .describe("Billing data -- required if org has no billing profile"),
});

const adminCheckoutDataSchema = z.object({
  checkoutUrl: z.url().describe("Payment link URL"),
  paymentLinkId: z.string().describe("Pagar.me payment link ID"),
  customPriceMonthly: z
    .number()
    .int()
    .describe("Custom monthly price (centavos)"),
  customPriceYearly: z
    .number()
    .int()
    .describe("Custom yearly price (centavos)"),
  catalogPriceMonthly: z
    .number()
    .int()
    .describe("Catalog monthly price (centavos)"),
  catalogPriceYearly: z
    .number()
    .int()
    .describe("Catalog yearly price (centavos)"),
  discountPercentage: z
    .number()
    .describe("Discount percentage compared to catalog"),
  expiresAt: z.string().describe("Checkout link expiration (ISO 8601)"),
});

export const createAdminCheckoutResponseSchema = successResponseSchema(
  adminCheckoutDataSchema
);

export type CreateAdminCheckout = z.infer<typeof createAdminCheckoutSchema>;
export type CreateAdminCheckoutInput = CreateAdminCheckout & {
  adminUserId: string;
};
export type AdminCheckoutData = z.infer<typeof adminCheckoutDataSchema>;
