import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";
import { isFutureDate } from "@/lib/schemas/date-helpers";
import { entityReferenceSchema } from "@/lib/schemas/relationships";

const terminationFieldsSchema = z.object({
  employeeId: z
    .string()
    .min(1, "ID do funcionário é obrigatório")
    .describe("ID do funcionário"),
  terminationDate: z
    .string()
    .date("Data de demissão deve ser uma data válida")
    .refine((val) => !isFutureDate(val), {
      message: "Data de demissão não pode ser no futuro",
    })
    .describe("Data de demissão"),
  type: z
    .enum([
      "RESIGNATION",
      "DISMISSAL_WITH_CAUSE",
      "DISMISSAL_WITHOUT_CAUSE",
      "MUTUAL_AGREEMENT",
      "CONTRACT_END",
    ])
    .describe(
      "Tipo de demissão: RESIGNATION (pedido de demissão), DISMISSAL_WITH_CAUSE (demissão por justa causa), DISMISSAL_WITHOUT_CAUSE (demissão sem justa causa), MUTUAL_AGREEMENT (acordo mútuo), CONTRACT_END (fim de contrato)"
    ),
  reason: z
    .string()
    .max(1000, "Motivo deve ter no máximo 1000 caracteres")
    .optional()
    .describe("Motivo da demissão (opcional)"),
  noticePeriodDays: z
    .number()
    .int("Dias de aviso prévio deve ser um número inteiro")
    .min(0, "Dias de aviso prévio não pode ser negativo")
    .optional()
    .describe("Dias de aviso prévio (opcional)"),
  noticePeriodWorked: z
    .boolean()
    .default(false)
    .describe("Se o aviso prévio foi cumprido"),
  lastWorkingDay: z
    .string()
    .date("Último dia trabalhado deve ser uma data válida")
    .refine((val) => !isFutureDate(val), {
      message: "Último dia trabalhado não pode ser no futuro",
    })
    .describe("Último dia trabalhado"),
  notes: z
    .string()
    .max(2000, "Observações devem ter no máximo 2000 caracteres")
    .optional()
    .describe("Observações adicionais (opcional)"),
});

export const createTerminationSchema = terminationFieldsSchema.refine(
  (data) => data.lastWorkingDay <= data.terminationDate,
  {
    message:
      "Último dia trabalhado deve ser anterior ou igual à data de demissão",
    path: ["lastWorkingDay"],
  }
);

export const updateTerminationSchema = terminationFieldsSchema
  .omit({ employeeId: true })
  .partial()
  .extend({
    reason: z
      .string()
      .max(1000, "Motivo deve ter no máximo 1000 caracteres")
      .nullable()
      .optional(),
    noticePeriodDays: z
      .number()
      .int("Dias de aviso prévio deve ser um número inteiro")
      .min(0, "Dias de aviso prévio não pode ser negativo")
      .nullable()
      .optional(),
    notes: z
      .string()
      .max(2000, "Observações devem ter no máximo 2000 caracteres")
      .nullable()
      .optional(),
  })
  .refine(
    (data) => {
      if (data.lastWorkingDay && data.terminationDate) {
        return data.lastWorkingDay <= data.terminationDate;
      }
      return true;
    },
    {
      message:
        "Último dia trabalhado deve ser anterior ou igual à data de demissão",
      path: ["lastWorkingDay"],
    }
  );

export const idParamSchema = z.object({
  id: z.string().min(1).describe("ID da demissão"),
});

const terminationDataSchema = z.object({
  id: z.string().describe("ID da demissão"),
  organizationId: z.string().describe("ID da organização"),
  employee: entityReferenceSchema.describe("Funcionário"),
  terminationDate: z.string().describe("Data de demissão"),
  type: z
    .enum([
      "RESIGNATION",
      "DISMISSAL_WITH_CAUSE",
      "DISMISSAL_WITHOUT_CAUSE",
      "MUTUAL_AGREEMENT",
      "CONTRACT_END",
    ])
    .describe("Tipo de demissão"),
  reason: z.string().nullable().describe("Motivo da demissão"),
  noticePeriodDays: z.number().nullable().describe("Dias de aviso prévio"),
  noticePeriodWorked: z.boolean().describe("Se o aviso prévio foi cumprido"),
  lastWorkingDay: z.string().describe("Último dia trabalhado"),
  notes: z.string().nullable().describe("Observações adicionais"),
  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
});

const deletedTerminationDataSchema = terminationDataSchema.extend({
  deletedAt: z.coerce.date().describe("Data de exclusão"),
  deletedBy: z.string().nullable().describe("ID do usuário que excluiu"),
});

const terminationListDataSchema = z.array(terminationDataSchema);

export const createTerminationResponseSchema = successResponseSchema(
  terminationDataSchema
);
export const getTerminationResponseSchema = successResponseSchema(
  terminationDataSchema
);
export const updateTerminationResponseSchema = successResponseSchema(
  terminationDataSchema
);
export const deleteTerminationResponseSchema = successResponseSchema(
  deletedTerminationDataSchema
);
export const listTerminationsResponseSchema = successResponseSchema(
  terminationListDataSchema
);

export type CreateTermination = z.infer<typeof createTerminationSchema>;
export type CreateTerminationInput = CreateTermination & {
  organizationId: string;
  userId: string;
};

export type UpdateTermination = z.infer<typeof updateTerminationSchema>;
export type UpdateTerminationInput = UpdateTermination & {
  userId: string;
};

export type TerminationData = z.infer<typeof terminationDataSchema>;
export type DeletedTerminationData = z.infer<
  typeof deletedTerminationDataSchema
>;
