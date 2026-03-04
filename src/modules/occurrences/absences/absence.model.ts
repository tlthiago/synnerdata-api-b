import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";
import { isFutureDate } from "@/lib/schemas/date-helpers";
import { entityReferenceSchema } from "@/lib/schemas/relationships";

export const absenceTypeEnum = z.enum(["justified", "unjustified"], {
  error: "Tipo de ausência inválido",
});

export type AbsenceType = z.infer<typeof absenceTypeEnum>;

const absenceFieldsSchema = z.object({
  employeeId: z
    .string()
    .min(1, "ID do funcionário é obrigatório")
    .describe("ID do funcionário"),
  startDate: z
    .string()
    .min(1, "Data de início é obrigatória")
    .date("Data de início deve ser uma data válida")
    .refine((val) => !isFutureDate(val), {
      message: "Data de início não pode ser no futuro",
    })
    .describe("Data de início (YYYY-MM-DD)"),
  endDate: z
    .string()
    .min(1, "Data de término é obrigatória")
    .date("Data de término deve ser uma data válida")
    .refine((val) => !isFutureDate(val), {
      message: "Data de término não pode ser no futuro",
    })
    .describe("Data de término (YYYY-MM-DD)"),
  type: absenceTypeEnum.describe("Tipo da ausência"),
  reason: z.string().optional().describe("Motivo da ausência"),
  notes: z.string().optional().describe("Observações adicionais"),
});

export const createAbsenceSchema = absenceFieldsSchema.refine(
  (data) => data.startDate <= data.endDate,
  {
    message: "Data final deve ser igual ou posterior à data inicial",
    path: ["endDate"],
  }
);

export const updateAbsenceSchema = absenceFieldsSchema
  .partial()
  .omit({ employeeId: true })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.startDate <= data.endDate;
      }
      return true;
    },
    {
      message: "Data final deve ser igual ou posterior à data inicial",
      path: ["endDate"],
    }
  );

export const idParamSchema = z.object({
  id: z.string().min(1).describe("ID da ausência"),
});

const absenceDataSchema = z.object({
  id: z.string().describe("ID da ausência"),
  organizationId: z.string().describe("ID da organização"),
  employee: entityReferenceSchema.describe("Funcionário"),
  startDate: z.string().describe("Data de início"),
  endDate: z.string().describe("Data de término"),
  type: z.string().describe("Tipo da ausência"),
  reason: z.string().nullable().describe("Motivo da ausência"),
  notes: z.string().nullable().describe("Observações"),
  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
});

const deletedAbsenceDataSchema = absenceDataSchema.extend({
  deletedAt: z.coerce.date().describe("Data de exclusão"),
  deletedBy: z.string().nullable().describe("ID do usuário que excluiu"),
});

const absenceListDataSchema = z.array(absenceDataSchema);

export const createAbsenceResponseSchema =
  successResponseSchema(absenceDataSchema);
export const getAbsenceResponseSchema =
  successResponseSchema(absenceDataSchema);
export const updateAbsenceResponseSchema =
  successResponseSchema(absenceDataSchema);
export const deleteAbsenceResponseSchema = successResponseSchema(
  deletedAbsenceDataSchema
);
export const listAbsencesResponseSchema = successResponseSchema(
  absenceListDataSchema
);

export type CreateAbsence = z.infer<typeof createAbsenceSchema>;
export type CreateAbsenceInput = CreateAbsence & {
  organizationId: string;
  userId: string;
};

export type UpdateAbsence = z.infer<typeof updateAbsenceSchema>;
export type UpdateAbsenceInput = UpdateAbsence & {
  userId: string;
};

export type AbsenceData = z.infer<typeof absenceDataSchema>;
export type DeletedAbsenceData = z.infer<typeof deletedAbsenceDataSchema>;
