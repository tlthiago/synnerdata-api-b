import { z } from "zod";
import { isProduction } from "@/env";
import { isValidCNPJ } from "@/lib/document-validators";
import { successResponseSchema } from "@/lib/responses/response.types";

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

export const createAdminCheckoutSchema = z
  .object({
    organizationId: z.string().min(1).describe("Target organization ID"),
    basePlanId: z
      .string()
      .min(1)
      .describe("Base plan ID (public, active, non-trial) to inherit features"),
    minEmployees: z
      .number()
      .int()
      .min(0)
      .describe("Minimum employees in custom tier"),
    maxEmployees: z
      .number()
      .int()
      .min(1)
      .describe("Maximum employees in custom tier"),
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
  })
  .refine((data) => data.maxEmployees > data.minEmployees, {
    message: "maxEmployees must be greater than minEmployees",
    path: ["maxEmployees"],
  });

const adminCheckoutDataSchema = z.object({
  checkoutUrl: z.url().describe("Payment link URL"),
  paymentLinkId: z.string().describe("Pagar.me payment link ID"),
  privatePlanId: z.string().describe("Created private plan ID"),
  privateTierId: z.string().describe("Created private tier ID"),
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
    .describe("Catalog monthly price for the matching tier (centavos)"),
  discountPercentage: z
    .number()
    .describe("Discount percentage from catalog price"),
  basePlanDisplayName: z.string().describe("Base plan display name"),
  minEmployees: z.number().int().describe("Custom tier min employees"),
  maxEmployees: z.number().int().describe("Custom tier max employees"),
  expiresAt: z.string().describe("Checkout link expiration (ISO 8601)"),
});

export const createAdminCheckoutResponseSchema = successResponseSchema(
  adminCheckoutDataSchema
);

const pendingCheckoutItemSchema = z.object({
  id: z.string().describe("Pending checkout ID"),
  organizationId: z.string().describe("Organization ID"),
  planId: z.string().describe("Plan ID (private or public)"),
  pricingTierId: z.string().nullable().describe("Pricing tier ID"),
  billingCycle: z.string().nullable().describe("Billing cycle"),
  paymentLinkId: z.string().describe("Pagar.me payment link ID"),
  checkoutUrl: z.string().nullable().describe("Payment link URL"),
  status: z
    .enum(["pending", "completed", "expired"])
    .describe("Checkout status"),
  isExpired: z
    .boolean()
    .describe("Whether the checkout link has expired (computed)"),
  expiresAt: z.string().describe("Expiration date (ISO 8601)"),
  completedAt: z.string().nullable().describe("Completion date (ISO 8601)"),
  customPriceMonthly: z
    .number()
    .nullable()
    .describe("Custom monthly price (centavos)"),
  customPriceYearly: z
    .number()
    .nullable()
    .describe("Custom yearly price (centavos)"),
  createdByAdminId: z.string().nullable().describe("Admin who created"),
  notes: z.string().nullable().describe("Admin notes"),
  createdAt: z.string().describe("Creation date (ISO 8601)"),
});

export const listPendingCheckoutsResponseSchema = successResponseSchema(
  z.array(pendingCheckoutItemSchema)
);

export const organizationIdParamSchema = z.object({
  organizationId: z.string().min(1).describe("Organization ID"),
});

export type CreateAdminCheckout = z.infer<typeof createAdminCheckoutSchema>;
export type CreateAdminCheckoutInput = CreateAdminCheckout & {
  adminUserId: string;
};
export type AdminCheckoutData = z.infer<typeof adminCheckoutDataSchema>;
export type PendingCheckoutItem = z.infer<typeof pendingCheckoutItemSchema>;
