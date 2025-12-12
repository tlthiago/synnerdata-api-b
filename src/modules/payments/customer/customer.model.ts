import { z } from "zod";

// ============================================================
// BILLING DATA SCHEMA
// ============================================================

export const billingDataSchema = z.object({
  document: z.string().min(14).max(18).optional(), // CNPJ
  phone: z.string().min(10).max(15).optional(),
  billingEmail: z.email().optional(),
});

// ============================================================
// INFERRED TYPES
// ============================================================

export type BillingData = z.infer<typeof billingDataSchema>;

// ============================================================
// INTERNAL TYPES
// ============================================================

export type OrganizationProfileData = {
  organizationId: string;
  tradeName: string;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  pagarmeCustomerId: string | null;
};

export type CreateCustomerInput = {
  organizationId: string;
  name: string;
  email: string;
  document: string;
  phone: string;
};

// ============================================================
// LIST CUSTOMERS SCHEMAS
// ============================================================

export const listCustomersQuerySchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  document: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  size: z.coerce.number().int().positive().max(100).default(10),
});

export const customerPhoneSchema = z.object({
  country_code: z.string(),
  area_code: z.string(),
  number: z.string(),
});

export const customerResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  document: z.string(),
  type: z.enum(["individual", "company"]),
  delinquent: z.boolean().optional(),
  phones: z
    .object({
      mobile_phone: customerPhoneSchema.optional(),
      home_phone: customerPhoneSchema.optional(),
    })
    .optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const listCustomersResponseSchema = z.object({
  data: z.array(customerResponseSchema),
  paging: z.object({
    total: z.number(),
    previous: z.string().optional(),
    next: z.string().optional(),
  }),
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type CustomerResponse = z.infer<typeof customerResponseSchema>;
export type ListCustomersResponseType = z.infer<
  typeof listCustomersResponseSchema
>;
