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
    .date("Data de início deve ser uma data válida")
    .describe("Data de início das férias (YYYY-MM-DD)"),
  endDate: z
    .string()
    .date("Data de término deve ser uma data válida")
    .describe("Data de término das férias (YYYY-MM-DD)"),
  acquisitionPeriodStart: z
    .string()
    .date("Data deve ser válida")
    .optional()
    .describe("Início do período aquisitivo (YYYY-MM-DD)"),
  acquisitionPeriodEnd: z
    .string()
    .date("Data deve ser válida")
    .optional()
    .describe("Fim do período aquisitivo (YYYY-MM-DD)"),
  concessivePeriodStart: z
    .string()
    .date("Data deve ser válida")
    .optional()
    .describe("Início do período concessivo (YYYY-MM-DD)"),
  concessivePeriodEnd: z
    .string()
    .date("Data deve ser válida")
    .optional()
    .describe("Fim do período concessivo (YYYY-MM-DD)"),
  daysEntitled: z
    .number()
    .int("Dias deve ser um número inteiro")
    .positive("Dias deve ser positivo")
    .describe("Dias"),
  daysUsed: z
    .number()
    .int("Dias utilizados deve ser um número inteiro")
    .nonnegative("Dias utilizados não pode ser negativo")
    .describe("Dias utilizados"),
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
      if (data.concessivePeriodStart && data.concessivePeriodEnd) {
        return data.concessivePeriodStart <= data.concessivePeriodEnd;
      }
      return true;
    },
    {
      message: "Início do período concessivo deve ser anterior ou igual ao fim",
      path: ["concessivePeriodEnd"],
    }
  )
  .refine((data) => data.daysUsed <= data.daysEntitled, {
    message: "Dias utilizados não pode exceder dias de direito",
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
      if (data.concessivePeriodStart && data.concessivePeriodEnd) {
        return data.concessivePeriodStart <= data.concessivePeriodEnd;
      }
      return true;
    },
    {
      message: "Início do período concessivo deve ser anterior ou igual ao fim",
      path: ["concessivePeriodEnd"],
    }
  )
  .refine(
    (data) => {
      if (data.daysUsed !== undefined && data.daysEntitled !== undefined) {
        return data.daysUsed <= data.daysEntitled;
      }
      return true;
    },
    {
      message: "Dias utilizados não pode exceder dias de direito",
      path: ["daysUsed"],
    }
  );

export const idParamSchema = z.object({
  id: z.string().min(1).describe("ID das férias"),
});

export const employeeIdParamSchema = z.object({
  employeeId: z
    .string()
    .min(1, "ID do funcionario e obrigatorio")
    .describe("ID do funcionario"),
});

const vacationDataSchema = z.object({
  id: z.string().describe("ID das férias"),
  organizationId: z.string().describe("ID da organização"),
  employee: entityReferenceSchema.describe("Funcionário"),
  startDate: z.string().describe("Data de início das férias"),
  endDate: z.string().describe("Data de término das férias"),
  acquisitionPeriodStart: z
    .string()
    .nullable()
    .describe("Início do período aquisitivo"),
  acquisitionPeriodEnd: z
    .string()
    .nullable()
    .describe("Fim do período aquisitivo"),
  concessivePeriodStart: z
    .string()
    .nullable()
    .describe("Início do período concessivo"),
  concessivePeriodEnd: z
    .string()
    .nullable()
    .describe("Fim do período concessivo"),
  daysEntitled: z.number().describe("Dias"),
  daysUsed: z.number().describe("Dias utilizados"),
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
