import { z } from "zod";

// ============================================================
// INPUT SCHEMAS
// ============================================================

export const billingPortalBodySchema = z.object({
  organizationId: z.string().min(1),
  returnUrl: z.httpUrl().optional(),
});

export const listInvoicesQuerySchema = z.object({
  organizationId: z.string().min(1),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const invoiceIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const downloadInvoiceQuerySchema = z.object({
  organizationId: z.string().min(1),
});

// ============================================================
// OUTPUT SCHEMAS
// ============================================================

export const billingPortalResponseSchema = z.object({
  portalUrl: z.url(),
});

export const invoiceSchema = z.object({
  id: z.string(),
  code: z.string(),
  amount: z.number().int(),
  status: z.string(),
  dueAt: z.iso.datetime(),
  paidAt: z.iso.datetime().nullable(),
  url: z.url().nullable(),
});

export const listInvoicesResponseSchema = z.object({
  invoices: z.array(invoiceSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});

export const downloadInvoiceResponseSchema = z.object({
  downloadUrl: z.url(),
});

// ============================================================
// INFERRED TYPES
// ============================================================

export type BillingPortalBody = z.infer<typeof billingPortalBodySchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
export type InvoiceIdParams = z.infer<typeof invoiceIdParamsSchema>;
export type DownloadInvoiceQuery = z.infer<typeof downloadInvoiceQuerySchema>;
export type BillingPortalResponse = z.infer<typeof billingPortalResponseSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type ListInvoicesResponse = z.infer<typeof listInvoicesResponseSchema>;
export type DownloadInvoiceResponse = z.infer<
  typeof downloadInvoiceResponseSchema
>;
