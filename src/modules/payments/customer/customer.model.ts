import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

export const billingDataSchema = z.object({
  document: z.string().min(14).max(18).optional().describe("CNPJ"),
  phone: z.string().min(10).max(15).optional().describe("Phone number"),
  billingEmail: z.email().optional().describe("Billing email"),
});

export const listCustomersSchema = z.object({
  name: z.string().optional().describe("Filter by customer name"),
  email: z.string().optional().describe("Filter by customer email"),
  document: z.string().optional().describe("Filter by customer document"),
  page: z.coerce.number().int().positive().default(1).describe("Page number"),
  size: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .default(10)
    .describe("Page size"),
});

const customerPhoneSchema = z.object({
  country_code: z.string().describe("Country code"),
  area_code: z.string().describe("Area code"),
  number: z.string().describe("Phone number"),
});

const customerDataSchema = z.object({
  id: z.string().describe("Customer ID"),
  name: z.string().describe("Customer name"),
  email: z.string().describe("Customer email"),
  document: z.string().describe("Customer document"),
  type: z.enum(["individual", "company"]).describe("Customer type"),
  delinquent: z.boolean().optional().describe("Whether customer is delinquent"),
  phones: z
    .object({
      mobile_phone: customerPhoneSchema.optional(),
      home_phone: customerPhoneSchema.optional(),
    })
    .optional()
    .describe("Customer phones"),
  created_at: z.string().describe("Creation timestamp"),
  updated_at: z.string().describe("Last update timestamp"),
});

const pagingSchema = z.object({
  total: z.number().describe("Total number of records"),
  previous: z.string().optional().describe("Previous page URL"),
  next: z.string().optional().describe("Next page URL"),
});

const listCustomersDataSchema = z.object({
  customers: z.array(customerDataSchema).describe("List of customers"),
  paging: pagingSchema.describe("Pagination info"),
});

export const listCustomersResponseSchema = successResponseSchema(
  listCustomersDataSchema
);

export type BillingData = z.infer<typeof billingDataSchema>;
export type ListCustomersInput = z.infer<typeof listCustomersSchema>;
export type CustomerData = z.infer<typeof customerDataSchema>;
export type ListCustomersResponse = z.infer<typeof listCustomersResponseSchema>;

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
