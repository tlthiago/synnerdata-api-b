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
  acquisitionPeriodId: z
    .string()
    .min(1, "ID do periodo aquisitivo e obrigatorio")
    .describe("ID do periodo aquisitivo"),
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

export const createVacationSchema = vacationFieldsSchema.refine(
  (data) => data.startDate <= data.endDate,
  {
    message: "Data de início deve ser anterior ou igual à data de término",
    path: ["endDate"],
  }
);

export const updateVacationSchema = vacationFieldsSchema
  .omit({ employeeId: true, acquisitionPeriodId: true })
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
  acquisitionPeriodId: z.string().describe("ID do periodo aquisitivo"),
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
