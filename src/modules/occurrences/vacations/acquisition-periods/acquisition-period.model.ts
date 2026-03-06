import { z } from "zod";
import { acquisitionPeriodStatusEnum } from "@/db/schema";
import { successResponseSchema } from "@/lib/responses/response.types";
import { entityReferenceSchema } from "@/lib/schemas/relationships";

const statuses = acquisitionPeriodStatusEnum.enumValues;

export const createAcquisitionPeriodSchema = z.object({
  employeeId: z
    .string()
    .min(1, "ID do funcionário é obrigatório")
    .describe("ID do funcionário"),
  acquisitionStart: z
    .string()
    .date("Data de início do período aquisitivo deve ser uma data válida")
    .describe("Início do período aquisitivo (YYYY-MM-DD)"),
  acquisitionEnd: z
    .string()
    .date("Data de fim do período aquisitivo deve ser uma data válida")
    .describe("Fim do período aquisitivo (YYYY-MM-DD)"),
  concessionStart: z
    .string()
    .date("Data de início do período concessivo deve ser uma data válida")
    .describe("Início do período concessivo (YYYY-MM-DD)"),
  concessionEnd: z
    .string()
    .date("Data de fim do período concessivo deve ser uma data válida")
    .describe("Fim do período concessivo (YYYY-MM-DD)"),
  daysEntitled: z
    .number()
    .int("Dias de direito deve ser um número inteiro")
    .positive("Dias de direito deve ser positivo")
    .default(30)
    .describe("Dias de direito a férias"),
  status: z
    .enum(statuses)
    .default("pending")
    .describe("Status do período aquisitivo"),
  notes: z.string().optional().describe("Observações"),
});

export const updateAcquisitionPeriodSchema = createAcquisitionPeriodSchema
  .omit({ employeeId: true })
  .partial();

export const idParamSchema = z.object({
  id: z
    .string()
    .min(1, "ID do período aquisitivo é obrigatório")
    .describe("ID do período aquisitivo"),
});

export const employeeIdParamSchema = z.object({
  employeeId: z
    .string()
    .min(1, "ID do funcionário é obrigatório")
    .describe("ID do funcionário"),
});

export const listAvailableQuerySchema = z.object({
  employeeId: z
    .string()
    .min(1, "ID do funcionário é obrigatório")
    .describe("ID do funcionário"),
});

const acquisitionPeriodDataSchema = z.object({
  id: z.string().describe("ID do período aquisitivo"),
  organizationId: z.string().describe("ID da organização"),
  employee: entityReferenceSchema.describe("Funcionário"),
  acquisitionStart: z.string().describe("Início do período aquisitivo"),
  acquisitionEnd: z.string().describe("Fim do período aquisitivo"),
  concessionStart: z.string().describe("Início do período concessivo"),
  concessionEnd: z.string().describe("Fim do período concessivo"),
  daysEntitled: z.number().describe("Dias de direito a férias"),
  daysUsed: z.number().describe("Dias utilizados"),
  daysRemaining: z.number().describe("Dias restantes"),
  status: z.enum(statuses).describe("Status do período aquisitivo"),
  notes: z.string().nullable().describe("Observações"),
  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
});

const deletedAcquisitionPeriodDataSchema = acquisitionPeriodDataSchema.extend({
  deletedAt: z.coerce.date().describe("Data de exclusão"),
  deletedBy: z.string().nullable().describe("ID do usuário que excluiu"),
});

const acquisitionPeriodListDataSchema = z.array(acquisitionPeriodDataSchema);

export const createAcquisitionPeriodResponseSchema = successResponseSchema(
  acquisitionPeriodDataSchema
);
export const getAcquisitionPeriodResponseSchema = successResponseSchema(
  acquisitionPeriodDataSchema
);
export const updateAcquisitionPeriodResponseSchema = successResponseSchema(
  acquisitionPeriodDataSchema
);
export const deleteAcquisitionPeriodResponseSchema = successResponseSchema(
  deletedAcquisitionPeriodDataSchema
);
export const listAcquisitionPeriodsResponseSchema = successResponseSchema(
  acquisitionPeriodListDataSchema
);

export type CreateAcquisitionPeriod = z.infer<
  typeof createAcquisitionPeriodSchema
>;
export type CreateAcquisitionPeriodInput = CreateAcquisitionPeriod & {
  organizationId: string;
  userId: string;
};

export type UpdateAcquisitionPeriod = z.infer<
  typeof updateAcquisitionPeriodSchema
>;
export type UpdateAcquisitionPeriodInput = UpdateAcquisitionPeriod & {
  userId: string;
};

export type AcquisitionPeriodData = z.infer<typeof acquisitionPeriodDataSchema>;
export type DeletedAcquisitionPeriodData = z.infer<
  typeof deletedAcquisitionPeriodDataSchema
>;
export type AcquisitionPeriodStatus = (typeof statuses)[number];
