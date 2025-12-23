import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

export const updateProfileSchema = z.object({
  tradeName: z.string().min(1).max(200).optional(),
  legalName: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  phone: z
    .string()
    .regex(/^\d{10,11}$/, "Telefone deve ter 10 ou 11 dígitos")
    .optional(),
  taxId: z
    .string()
    .regex(
      /^(\d{11}|\d{14})$/,
      "CPF deve ter 11 dígitos ou CNPJ deve ter 14 dígitos"
    )
    .optional(),
  taxRegime: z.string().max(100).optional(),
  stateRegistration: z.string().max(50).optional(),
  mainActivityCode: z.string().max(20).optional(),
  street: z.string().max(200).optional(),
  number: z.string().max(20).optional(),
  complement: z.string().max(100).optional(),
  neighborhood: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  state: z.string().length(2, "Estado deve ter 2 caracteres").optional(),
  zipCode: z
    .string()
    .regex(/^\d{8}$/, "CEP deve ter 8 dígitos")
    .optional(),
  industry: z.string().max(100).optional(),
  businessArea: z.string().max(100).optional(),
  foundingDate: z.string().date().optional(),
  revenue: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Receita deve ser um valor numérico")
    .optional(),
});

const organizationProfileDataSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  tradeName: z.string(),
  legalName: z.string().nullable(),
  taxId: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  mobile: z.string().nullable(),
  taxRegime: z.string().nullable(),
  stateRegistration: z.string().nullable(),
  mainActivityCode: z.string().nullable(),
  street: z.string().nullable(),
  number: z.string().nullable(),
  complement: z.string().nullable(),
  neighborhood: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zipCode: z.string().nullable(),
  industry: z.string().nullable(),
  businessArea: z.string().nullable(),
  foundingDate: z.string().nullable(),
  revenue: z.string().nullable(),
  pagarmeCustomerId: z.string().nullable(),
  status: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const billingStatusDataSchema = z.object({
  complete: z.boolean(),
  missingFields: z.array(z.string()),
});

export const getProfileResponseSchema = successResponseSchema(
  organizationProfileDataSchema
);
export const updateProfileResponseSchema = successResponseSchema(
  organizationProfileDataSchema
);
export const billingStatusResponseSchema = successResponseSchema(
  billingStatusDataSchema
);

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export type OrganizationProfileData = z.infer<
  typeof organizationProfileDataSchema
>;

export type BillingStatusData = z.infer<typeof billingStatusDataSchema>;

export type OrganizationData = {
  id: string;
  name: string;
};

export type CreateProfileData = {
  tradeName: string;
  legalName?: string;
  taxId: string;
  phone: string;
  email?: string;
};
