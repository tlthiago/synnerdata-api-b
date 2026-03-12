import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";
import { isFutureDate } from "@/lib/schemas/date-helpers";
import { entityReferenceSchema } from "@/lib/schemas/relationships";

const cpfAnalysisStatusValues = [
  "pending",
  "approved",
  "rejected",
  "review",
] as const;
const riskLevelValues = ["low", "medium", "high"] as const;

export const createCpfAnalysisSchema = z.object({
  employeeId: z
    .string()
    .min(1, "ID do funcionário é obrigatório")
    .describe("ID do funcionário"),
  analysisDate: z
    .string()
    .date("Data de análise deve ser uma data válida")
    .refine((val) => !isFutureDate(val), {
      message: "Data de análise não pode ser no futuro",
    })
    .describe("Data da análise"),
  status: z.enum(cpfAnalysisStatusValues).describe("Status da análise"),
  score: z
    .number()
    .int()
    .min(0, "Score não pode ser negativo")
    .optional()
    .describe("Score da análise"),
  riskLevel: z.enum(riskLevelValues).optional().describe("Nível de risco"),
  observations: z
    .string()
    .max(1000, "Observações devem ter no máximo 1000 caracteres")
    .optional()
    .describe("Observações"),
  externalReference: z
    .string()
    .max(255, "Referência externa deve ter no máximo 255 caracteres")
    .optional()
    .describe("Referência externa"),
});

export const updateCpfAnalysisSchema = createCpfAnalysisSchema
  .partial()
  .extend({
    score: z
      .number()
      .int()
      .min(0, "Score não pode ser negativo")
      .nullable()
      .optional(),
    riskLevel: z.enum(riskLevelValues).nullable().optional(),
    observations: z
      .string()
      .max(1000, "Observações devem ter no máximo 1000 caracteres")
      .nullable()
      .optional(),
    externalReference: z
      .string()
      .max(255, "Referência externa deve ter no máximo 255 caracteres")
      .nullable()
      .optional(),
  });

export const idParamSchema = z.object({
  id: z.string().min(1).describe("ID da análise de CPF"),
});

const cpfAnalysisDataSchema = z.object({
  id: z.string().describe("ID da análise de CPF"),
  organizationId: z.string().describe("ID da organização"),
  employee: entityReferenceSchema.describe("Funcionário"),
  analysisDate: z.string().describe("Data da análise"),
  status: z.enum(cpfAnalysisStatusValues).describe("Status da análise"),
  score: z.number().nullable().describe("Score da análise"),
  riskLevel: z.enum(riskLevelValues).nullable().describe("Nível de risco"),
  observations: z.string().nullable().describe("Observações"),
  externalReference: z.string().nullable().describe("Referência externa"),
  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
});

const deletedCpfAnalysisDataSchema = cpfAnalysisDataSchema.extend({
  deletedAt: z.coerce.date().describe("Data de exclusão"),
  deletedBy: z.string().nullable().describe("ID do usuário que excluiu"),
});

const cpfAnalysisListDataSchema = z.array(cpfAnalysisDataSchema);

export const createCpfAnalysisResponseSchema = successResponseSchema(
  cpfAnalysisDataSchema
);
export const getCpfAnalysisResponseSchema = successResponseSchema(
  cpfAnalysisDataSchema
);
export const updateCpfAnalysisResponseSchema = successResponseSchema(
  cpfAnalysisDataSchema
);
export const deleteCpfAnalysisResponseSchema = successResponseSchema(
  deletedCpfAnalysisDataSchema
);
export const listCpfAnalysesResponseSchema = successResponseSchema(
  cpfAnalysisListDataSchema
);

export type CreateCpfAnalysis = z.infer<typeof createCpfAnalysisSchema>;
export type CreateCpfAnalysisInput = CreateCpfAnalysis & {
  organizationId: string;
  userId: string;
};

export type UpdateCpfAnalysis = z.infer<typeof updateCpfAnalysisSchema>;
export type UpdateCpfAnalysisInput = UpdateCpfAnalysis & {
  userId: string;
};

export type CpfAnalysisData = z.infer<typeof cpfAnalysisDataSchema>;
export type DeletedCpfAnalysisData = z.infer<
  typeof deletedCpfAnalysisDataSchema
>;
