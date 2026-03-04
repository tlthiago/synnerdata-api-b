import { z } from "zod";
import {
  paginatedResponseSchema,
  successResponseSchema,
} from "@/lib/responses/response.types";
import { entityReferenceSchema } from "@/lib/schemas/relationships";
import { isValidCNPJ } from "@/lib/validation/documents";

const isProduction = process.env.NODE_ENV === "production";

const SLUG_REGEX = /^[a-z0-9-]+$/;

// ============================================================
// SHARED SCHEMAS
// ============================================================

export const billingDataSchema = z.object({
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

export const provisionDataSchema = z.object({
  id: z.string(),
  userId: z.string(),
  organizationId: z.string(),
  ownerName: z.string(),
  ownerEmail: z.string(),
  organizationName: z.string(),
  type: z.enum(["trial", "checkout"]),
  status: z.enum([
    "pending_payment",
    "pending_activation",
    "active",
    "deleted",
  ]),
  activationUrl: z.string().nullable(),
  activatedAt: z.string().nullable(),
  checkoutUrl: z.string().nullable(),
  checkoutExpiresAt: z.string().nullable(),
  notes: z.string().nullable(),
  createdBy: entityReferenceSchema.nullable(),
  createdAt: z.string(),
});

// ============================================================
// TRIAL
// ============================================================

export const createProvisionTrialSchema = z.object({
  ownerName: z.string().min(2).max(100).describe("Name of the owner"),
  ownerEmail: z.email().describe("Email of the owner"),
  organization: z
    .object({
      tradeName: z.string().min(1).describe("Nome fantasia"),
      taxId: z
        .string()
        .refine((value) => isValidCNPJ(value), { message: "CNPJ invalido" })
        .describe("CNPJ (14 digitos)"),
      email: z.email().describe("Email comercial da organizacao"),
      phone: z
        .string()
        .min(10)
        .max(15)
        .describe("Telefone comercial (10-15 digitos)"),
      legalName: z.string().optional().describe("Razao social"),
      street: z.string().optional().describe("Logradouro"),
      number: z.string().optional().describe("Numero"),
      complement: z.string().optional().describe("Complemento"),
      neighborhood: z.string().optional().describe("Bairro"),
      city: z.string().optional().describe("Cidade"),
      state: z.string().length(2).optional().describe("UF (2 chars)"),
      zipCode: z.string().length(8).optional().describe("CEP (8 digitos)"),
    })
    .describe("Organization profile data"),
  organizationSlug: z
    .string()
    .regex(
      SLUG_REGEX,
      "Slug must contain only lowercase letters, numbers, and hyphens"
    )
    .describe("Organization slug"),
  notes: z.string().max(500).optional().describe("Admin notes"),
});

export const createProvisionTrialResponseSchema =
  successResponseSchema(provisionDataSchema);

export type CreateProvisionTrial = z.infer<typeof createProvisionTrialSchema>;
export type CreateProvisionTrialInput = CreateProvisionTrial & {
  adminUserId: string;
  adminUserName: string;
  headers: Headers;
};

// ============================================================
// CHECKOUT
// ============================================================

export const createProvisionCheckoutSchema = z
  .object({
    ownerName: z.string().min(2).max(100).describe("Name of the owner"),
    ownerEmail: z.email().describe("Email of the owner"),
    organizationName: z.string().min(1).describe("Organization name"),
    organizationSlug: z
      .string()
      .regex(
        SLUG_REGEX,
        "Slug must contain only lowercase letters, numbers, and hyphens"
      )
      .describe("Organization slug"),
    basePlanId: z.string().min(1).describe("Base plan ID"),
    minEmployees: z.number().int().min(0).describe("Minimum employees"),
    maxEmployees: z.number().int().min(1).describe("Maximum employees"),
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
    billing: billingDataSchema.describe(
      "Billing data — required for new org without billing profile"
    ),
    notes: z.string().max(500).optional().describe("Admin notes"),
  })
  .refine((data) => data.maxEmployees > data.minEmployees, {
    message: "maxEmployees must be greater than minEmployees",
    path: ["maxEmployees"],
  });

export const createProvisionCheckoutResponseSchema =
  successResponseSchema(provisionDataSchema);

export type CreateProvisionCheckout = z.infer<
  typeof createProvisionCheckoutSchema
>;
export type CreateProvisionCheckoutInput = CreateProvisionCheckout & {
  adminUserId: string;
  adminUserName: string;
  headers: Headers;
};

// ============================================================
// LIST
// ============================================================

export const listProvisionsQuerySchema = z.object({
  status: z
    .enum(["pending_payment", "pending_activation", "active", "deleted"])
    .optional()
    .describe("Filter by status"),
  type: z.enum(["trial", "checkout"]).optional().describe("Filter by type"),
  limit: z.coerce.number().int().min(1).max(100).default(20).describe("Limit"),
  offset: z.coerce.number().int().min(0).default(0).describe("Offset"),
});

export const listProvisionsResponseSchema =
  paginatedResponseSchema(provisionDataSchema);

export type ListProvisionsQuery = z.infer<typeof listProvisionsQuerySchema>;

// ============================================================
// RESPONSE TYPES
// ============================================================

export type ProvisionData = z.infer<typeof provisionDataSchema>;
