import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

export const listInvoicesQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .positive()
    .default(1)
    .describe("Page number for pagination"),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .default(20)
    .describe("Number of items per page"),
});

export const invoiceIdParamsSchema = z.object({
  id: z.string().min(1).describe("Invoice ID from payment provider"),
});

export const updateCardSchema = z.object({
  cardId: z.string().min(1).describe("New card ID from Pagarme tokenization"),
});

const invoiceDataSchema = z.object({
  id: z.string().describe("Invoice ID"),
  code: z.string().describe("Invoice code"),
  amount: z.number().int().describe("Amount in cents"),
  status: z.string().describe("Invoice status"),
  dueAt: z.string().describe("Due date in ISO format"),
  paidAt: z.string().nullable().describe("Payment date in ISO format"),
  url: z.string().nullable().describe("Invoice URL"),
});

const listInvoicesDataSchema = z.object({
  invoices: z.array(invoiceDataSchema).describe("List of invoices"),
  total: z.number().int().describe("Total number of invoices"),
  page: z.number().int().describe("Current page number"),
  limit: z.number().int().describe("Items per page"),
});

const downloadInvoiceDataSchema = z.object({
  downloadUrl: z.string().url().describe("Invoice download URL"),
});

const updateCardDataSchema = z.object({
  updated: z.literal(true).describe("Card update confirmation"),
});

export const listInvoicesResponseSchema = successResponseSchema(
  listInvoicesDataSchema
);

export const downloadInvoiceResponseSchema = successResponseSchema(
  downloadInvoiceDataSchema
);

export const updateCardResponseSchema =
  successResponseSchema(updateCardDataSchema);

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
export type ListInvoicesInput = ListInvoicesQuery & { organizationId: string };
export type InvoiceData = z.infer<typeof invoiceDataSchema>;
export type ListInvoicesResponse = z.infer<typeof listInvoicesResponseSchema>;
export type DownloadInvoiceResponse = z.infer<
  typeof downloadInvoiceResponseSchema
>;
export type UpdateCardInput = { organizationId: string; cardId: string };
export type UpdateCardResponse = z.infer<typeof updateCardResponseSchema>;

const usageItemSchema = z.object({
  current: z.number().int().describe("Current usage count"),
  limit: z.number().int().nullable().describe("Plan limit (null = unlimited)"),
  percentage: z
    .number()
    .int()
    .nullable()
    .describe("Usage percentage (null if unlimited)"),
});

const getUsageDataSchema = z.object({
  plan: z.object({
    name: z.string().describe("Plan internal name"),
    displayName: z.string().describe("Plan display name"),
  }),
  usage: z.object({
    members: usageItemSchema.describe("Member usage"),
  }),
  features: z.array(z.string()).describe("Available features"),
});

export const getUsageResponseSchema = successResponseSchema(getUsageDataSchema);

export type GetUsageInput = { organizationId: string };
export type GetUsageResponse = z.infer<typeof getUsageResponseSchema>;

const addressSchema = z.object({
  street: z.string().min(1).describe("Street name"),
  number: z.string().min(1).describe("Street number"),
  complement: z.string().optional().describe("Complement"),
  neighborhood: z.string().min(1).describe("Neighborhood"),
  city: z.string().min(1).describe("City"),
  state: z.string().length(2).describe("State (UF)"),
  zipCode: z.string().length(8).describe("ZIP code (CEP)"),
});

export const updateBillingInfoSchema = z.object({
  taxId: z.string().min(14).max(18).optional().describe("CNPJ"),
  legalName: z.string().min(1).max(255).optional().describe("Legal name"),
  billingEmail: z.string().email().optional().describe("Billing email"),
  phone: z.string().min(10).max(15).optional().describe("Phone number"),
  address: addressSchema.optional().describe("Billing address"),
});

const updateBillingInfoDataSchema = z.object({
  updated: z.literal(true).describe("Update confirmation"),
});

export const updateBillingInfoResponseSchema = successResponseSchema(
  updateBillingInfoDataSchema
);

export type UpdateBillingInfo = z.infer<typeof updateBillingInfoSchema>;
export type UpdateBillingInfoInput = UpdateBillingInfo & {
  organizationId: string;
};
export type UpdateBillingInfoResponse = z.infer<
  typeof updateBillingInfoResponseSchema
>;

// Data-only types for service layer
export type ListInvoicesData = z.infer<typeof listInvoicesDataSchema>;
export type DownloadInvoiceData = z.infer<typeof downloadInvoiceDataSchema>;
export type UpdateCardData = z.infer<typeof updateCardDataSchema>;
export type GetUsageData = z.infer<typeof getUsageDataSchema>;
export type UpdateBillingInfoData = z.infer<typeof updateBillingInfoDataSchema>;
