import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";
import { isValidTaxId } from "@/lib/validation/documents";

export const updateProfileSchema = z.object({
  tradeName: z
    .string()
    .min(1, "Nome fantasia é obrigatório")
    .max(200, "Nome fantasia deve ter no máximo 200 caracteres")
    .optional()
    .describe("Nome fantasia"),
  legalName: z
    .string()
    .min(1, "Razão social é obrigatória")
    .max(200, "Razão social deve ter no máximo 200 caracteres")
    .optional()
    .describe("Razão social"),
  email: z
    .string()
    .email("Email inválido")
    .optional()
    .describe("Email da organização"),
  phone: z
    .string()
    .regex(/^\d{10,11}$/, "Telefone deve ter 10 ou 11 dígitos")
    .optional()
    .describe("Telefone"),
  taxId: z
    .string()
    .regex(
      /^(\d{11}|\d{14})$/,
      "CPF deve ter 11 dígitos ou CNPJ deve ter 14 dígitos"
    )
    .refine((val) => isValidTaxId(val), "CPF ou CNPJ inválido")
    .optional()
    .describe("CPF ou CNPJ"),
  taxRegime: z
    .string()
    .max(100, "Regime tributário deve ter no máximo 100 caracteres")
    .optional()
    .describe("Regime tributário"),
  stateRegistration: z
    .string()
    .max(50, "Inscrição estadual deve ter no máximo 50 caracteres")
    .optional()
    .describe("Inscrição estadual"),
  mainActivityCode: z
    .string()
    .max(20, "CNAE deve ter no máximo 20 caracteres")
    .optional()
    .describe("CNAE principal"),
  street: z
    .string()
    .max(200, "Rua deve ter no máximo 200 caracteres")
    .optional()
    .describe("Rua"),
  number: z
    .string()
    .max(20, "Número deve ter no máximo 20 caracteres")
    .optional()
    .describe("Número"),
  complement: z
    .string()
    .max(100, "Complemento deve ter no máximo 100 caracteres")
    .optional()
    .describe("Complemento"),
  neighborhood: z
    .string()
    .max(100, "Bairro deve ter no máximo 100 caracteres")
    .optional()
    .describe("Bairro"),
  city: z
    .string()
    .max(100, "Cidade deve ter no máximo 100 caracteres")
    .optional()
    .describe("Cidade"),
  state: z
    .string()
    .length(2, "Estado deve ter 2 caracteres")
    .optional()
    .describe("UF"),
  zipCode: z
    .string()
    .regex(/^\d{8}$/, "CEP deve ter 8 dígitos")
    .optional()
    .describe("CEP (8 dígitos)"),
  industry: z
    .string()
    .max(100, "Ramo de atividade deve ter no máximo 100 caracteres")
    .optional()
    .describe("Ramo de atividade"),
  businessArea: z
    .string()
    .max(100, "Área de atuação deve ter no máximo 100 caracteres")
    .optional()
    .describe("Área de atuação"),
  foundingDate: z
    .string()
    .date("Data de fundação deve ser uma data válida")
    .optional()
    .describe("Data de fundação"),
  revenue: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Receita deve ser um valor numérico")
    .optional()
    .describe("Receita"),
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
  maxUsers: z.number().nullable(),
  maxEmployees: z.number().nullable(),
  logoUrl: z.string().nullable(),
  pbUrl: z.string().nullable(),
  pagarmeCustomerId: z.string().nullable(),
  status: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const billingStatusDataSchema = z.object({
  complete: z.boolean(),
  missingFields: z.array(z.string()),
});

const powerBiUrlDataSchema = z.object({
  url: z.string().nullable(),
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
export const powerBiUrlResponseSchema =
  successResponseSchema(powerBiUrlDataSchema);

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export type OrganizationProfileData = z.infer<
  typeof organizationProfileDataSchema
>;

export type BillingStatusData = z.infer<typeof billingStatusDataSchema>;

export type PowerBiUrlData = z.infer<typeof powerBiUrlDataSchema>;

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
