import { z } from "zod";
import { vacationStatusEnum } from "@/db/schema";
import { successResponseSchema } from "@/lib/responses/response.types";
import { entityReferenceSchema } from "@/lib/schemas/relationships";

const vacationStatuses = vacationStatusEnum.enumValues;

const vacationFieldsSchema = z.object({
  employeeId: z
    .string()
    .min(1, "ID do funcionário é obrigatório")
    .describe("ID do funcionário"),
  startDate: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "Data de início deve estar no formato YYYY-MM-DD"
    )
    .describe("Data de início das férias (YYYY-MM-DD)"),
  endDate: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "Data de término deve estar no formato YYYY-MM-DD"
    )
    .describe("Data de término das férias (YYYY-MM-DD)"),
  daysTotal: z
    .number()
    .int("Total de dias deve ser um número inteiro")
    .positive("Total de dias deve ser positivo")
    .describe("Total de dias de férias"),
  daysUsed: z
    .number()
    .int("Dias utilizados deve ser um número inteiro")
    .nonnegative("Dias utilizados não pode ser negativo")
    .describe("Dias utilizados"),
  acquisitionPeriodStart: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "Início do período aquisitivo deve estar no formato YYYY-MM-DD"
    )
    .describe("Início do período aquisitivo (YYYY-MM-DD)"),
  acquisitionPeriodEnd: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "Fim do período aquisitivo deve estar no formato YYYY-MM-DD"
    )
    .describe("Fim do período aquisitivo (YYYY-MM-DD)"),
  status: z
    .enum(vacationStatuses)
    .default("scheduled")
    .describe("Status das férias"),
  notes: z.string().optional().describe("Observações"),
});

export const createVacationSchema = vacationFieldsSchema
  .refine((data) => data.startDate <= data.endDate, {
    message: "Data de início deve ser anterior ou igual à data de término",
    path: ["endDate"],
  })
  .refine((data) => data.acquisitionPeriodStart <= data.acquisitionPeriodEnd, {
    message: "Início do período aquisitivo deve ser anterior ou igual ao fim",
    path: ["acquisitionPeriodEnd"],
  })
  .refine((data) => data.daysUsed <= data.daysTotal, {
    message: "Dias utilizados não pode exceder o total de dias",
    path: ["daysUsed"],
  });

export const updateVacationSchema = vacationFieldsSchema
  .omit({ employeeId: true })
  .partial()
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.startDate <= data.endDate;
      }
      return true;
    },
    {
      message: "Data de início deve ser anterior ou igual à data de término",
      path: ["endDate"],
    }
  )
  .refine(
    (data) => {
      if (data.acquisitionPeriodStart && data.acquisitionPeriodEnd) {
        return data.acquisitionPeriodStart <= data.acquisitionPeriodEnd;
      }
      return true;
    },
    {
      message: "Início do período aquisitivo deve ser anterior ou igual ao fim",
      path: ["acquisitionPeriodEnd"],
    }
  )
  .refine(
    (data) => {
      if (data.daysUsed !== undefined && data.daysTotal !== undefined) {
        return data.daysUsed <= data.daysTotal;
      }
      return true;
    },
    {
      message: "Dias utilizados não pode exceder o total de dias",
      path: ["daysUsed"],
    }
  );

export const idParamSchema = z.object({
  id: z.string().min(1).describe("ID das férias"),
});

const vacationDataSchema = z.object({
  id: z.string().describe("ID das férias"),
  organizationId: z.string().describe("ID da organização"),
  employee: entityReferenceSchema.describe("Funcionário"),
  startDate: z.string().describe("Data de início das férias"),
  endDate: z.string().describe("Data de término das férias"),
  daysTotal: z.number().describe("Total de dias de férias"),
  daysUsed: z.number().describe("Dias utilizados"),
  acquisitionPeriodStart: z.string().describe("Início do período aquisitivo"),
  acquisitionPeriodEnd: z.string().describe("Fim do período aquisitivo"),
  status: z.enum(vacationStatuses).describe("Status das férias"),
  notes: z.string().nullable().describe("Observações"),
  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
});

const deletedVacationDataSchema = vacationDataSchema.extend({
  deletedAt: z.coerce.date().describe("Data de exclusão"),
  deletedBy: z.string().nullable().describe("ID do usuário que excluiu"),
});

const vacationListDataSchema = z.array(vacationDataSchema);

export const createVacationResponseSchema =
  successResponseSchema(vacationDataSchema);
export const getVacationResponseSchema =
  successResponseSchema(vacationDataSchema);
export const updateVacationResponseSchema =
  successResponseSchema(vacationDataSchema);
export const deleteVacationResponseSchema = successResponseSchema(
  deletedVacationDataSchema
);
export const listVacationsResponseSchema = successResponseSchema(
  vacationListDataSchema
);

export type CreateVacation = z.infer<typeof createVacationSchema>;
export type CreateVacationInput = CreateVacation & {
  organizationId: string;
  userId: string;
};

export type UpdateVacation = z.infer<typeof updateVacationSchema>;
export type UpdateVacationInput = UpdateVacation & {
  userId: string;
};

export type VacationData = z.infer<typeof vacationDataSchema>;
export type DeletedVacationData = z.infer<typeof deletedVacationDataSchema>;
export type VacationStatus = (typeof vacationStatuses)[number];
