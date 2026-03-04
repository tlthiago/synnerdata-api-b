import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";
import { isValidCNPJ } from "@/lib/validation/documents";

const isFutureDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date > today;
};

export const createBranchSchema = z.object({
  name: z
    .string()
    .min(1, "Nome é obrigatório")
    .max(255, "Nome deve ter no máximo 255 caracteres")
    .describe("Nome da filial"),
  taxId: z
    .string()
    .regex(/^\d{14}$/, "CNPJ deve ter 14 dígitos")
    .refine((val) => isValidCNPJ(val), "CNPJ inválido")
    .describe("CNPJ da filial (14 dígitos)"),
  street: z
    .string()
    .min(1, "Rua é obrigatória")
    .max(255, "Rua deve ter no máximo 255 caracteres")
    .describe("Rua"),
  number: z
    .string()
    .min(1, "Número é obrigatório")
    .max(10, "Número deve ter no máximo 10 caracteres")
    .describe("Número"),
  complement: z
    .string()
    .max(100, "Complemento deve ter no máximo 100 caracteres")
    .optional()
    .describe("Complemento"),
  neighborhood: z
    .string()
    .min(1, "Bairro é obrigatório")
    .max(100, "Bairro deve ter no máximo 100 caracteres")
    .describe("Bairro"),
  city: z
    .string()
    .min(1, "Cidade é obrigatória")
    .max(100, "Cidade deve ter no máximo 100 caracteres")
    .describe("Cidade"),
  state: z
    .string()
    .length(2, "Estado deve ter 2 caracteres")
    .describe("Estado (UF)"),
  zipCode: z
    .string()
    .regex(/^\d{8}$/, "CEP deve ter 8 dígitos")
    .describe("CEP (8 dígitos)"),
  phone: z
    .string()
    .regex(/^\d{10,11}$/, "Telefone deve ter 10 ou 11 dígitos")
    .optional()
    .describe("Telefone fixo (opcional)"),
  mobile: z
    .string()
    .regex(/^\d{10,11}$/, "Celular deve ter 10 ou 11 dígitos")
    .describe("Celular"),
  foundedAt: z.iso
    .date({ error: "Data de fundação deve ser uma data válida" })
    .refine((val) => !isFutureDate(val), {
      message: "Data de fundação não pode ser no futuro",
    })
    .optional()
    .describe("Data de fundação"),
});

export const updateBranchSchema = createBranchSchema.partial();

export const idParamSchema = z.object({
  id: z.string().min(1).describe("ID da filial"),
});

const branchDataSchema = z.object({
  id: z.string().describe("ID da filial"),
  organizationId: z.string().describe("ID da organização"),
  name: z.string().describe("Nome da filial"),
  taxId: z.string().describe("CNPJ da filial"),
  street: z.string().describe("Rua"),
  number: z.string().describe("Número"),
  complement: z.string().nullable().describe("Complemento"),
  neighborhood: z.string().describe("Bairro"),
  city: z.string().describe("Cidade"),
  state: z.string().describe("Estado (UF)"),
  zipCode: z.string().describe("CEP"),
  phone: z.string().nullable().describe("Telefone fixo"),
  mobile: z.string().describe("Celular"),
  foundedAt: z.string().nullable().describe("Data de fundação"),
  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
});

const deletedBranchDataSchema = branchDataSchema.extend({
  deletedAt: z.coerce.date().describe("Data de exclusão"),
  deletedBy: z.string().nullable().describe("ID do usuário que excluiu"),
});

const branchListDataSchema = z.array(branchDataSchema);

export const createBranchResponseSchema =
  successResponseSchema(branchDataSchema);
export const getBranchResponseSchema = successResponseSchema(branchDataSchema);
export const updateBranchResponseSchema =
  successResponseSchema(branchDataSchema);
export const deleteBranchResponseSchema = successResponseSchema(
  deletedBranchDataSchema
);
export const listBranchesResponseSchema =
  successResponseSchema(branchListDataSchema);

export type CreateBranch = z.infer<typeof createBranchSchema>;
export type CreateBranchInput = CreateBranch & {
  organizationId: string;
  userId: string;
};

export type UpdateBranch = z.infer<typeof updateBranchSchema>;
export type UpdateBranchInput = UpdateBranch & {
  userId: string;
};

export type BranchData = z.infer<typeof branchDataSchema>;
export type DeletedBranchData = z.infer<typeof deletedBranchDataSchema>;
