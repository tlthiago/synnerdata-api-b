import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";
import { isFutureDate, isFutureDatetime } from "@/lib/schemas/date-helpers";
import { entityReferenceSchema } from "@/lib/schemas/relationships";

export const warningTypeEnum = z.enum(["verbal", "written", "suspension"]);

const warningFieldsSchema = z.object({
  employeeId: z
    .string()
    .min(1, "ID do funcionário é obrigatório")
    .describe("ID do funcionário"),
  date: z
    .string()
    .date("Data da advertência deve ser uma data válida")
    .refine((val) => !isFutureDate(val), {
      message: "Data da advertência não pode ser no futuro",
    })
    .describe("Data da advertência"),
  type: warningTypeEnum.describe("Tipo da advertência"),
  reason: z
    .string()
    .min(1, "Motivo é obrigatório")
    .describe("Motivo da advertência"),
  description: z.string().optional().describe("Descrição detalhada"),
  witnessName: z.string().optional().describe("Nome da testemunha"),
  acknowledged: z.boolean().default(false).describe("Funcionário ciente"),
  acknowledgedAt: z
    .string()
    .datetime("Data do ciente deve ser uma data/hora válida")
    .refine((val) => !isFutureDatetime(val), {
      message: "Data de ciência não pode ser no futuro",
    })
    .optional()
    .describe("Data do ciente"),
  notes: z.string().optional().describe("Observações"),
});

export const createWarningSchema = warningFieldsSchema
  .refine((data) => !data.acknowledged || data.acknowledgedAt, {
    message: "Data de ciência é obrigatória quando o funcionário deu ciência",
    path: ["acknowledgedAt"],
  })
  .refine(
    (data) => {
      if (!data.acknowledgedAt) {
        return true;
      }
      return new Date(data.acknowledgedAt) >= new Date(data.date);
    },
    {
      message: "Data de ciência não pode ser anterior à data da advertência",
      path: ["acknowledgedAt"],
    }
  );

export const updateWarningSchema = warningFieldsSchema
  .partial()
  .refine(
    (data) => {
      if (data.acknowledged === true) {
        return !!data.acknowledgedAt;
      }
      return true;
    },
    {
      message: "Data de ciência é obrigatória quando o funcionário deu ciência",
      path: ["acknowledgedAt"],
    }
  )
  .refine(
    (data) => {
      if (!(data.acknowledgedAt && data.date)) {
        return true;
      }
      return new Date(data.acknowledgedAt) >= new Date(data.date);
    },
    {
      message: "Data de ciência não pode ser anterior à data da advertência",
      path: ["acknowledgedAt"],
    }
  );

export const idParamSchema = z.object({
  id: z.string().min(1).describe("ID da advertência"),
});

const warningDataSchema = z.object({
  id: z.string().describe("ID da advertência"),
  organizationId: z.string().describe("ID da organização"),
  employee: entityReferenceSchema.describe("Funcionário"),
  date: z.string().describe("Data da advertência"),
  type: warningTypeEnum.describe("Tipo da advertência"),
  reason: z.string().describe("Motivo da advertência"),
  description: z.string().nullable().describe("Descrição detalhada"),
  witnessName: z.string().nullable().describe("Nome da testemunha"),
  acknowledged: z.boolean().describe("Funcionário ciente"),
  acknowledgedAt: z.coerce.date().nullable().describe("Data do ciente"),
  notes: z.string().nullable().describe("Observações"),
  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
});

const deletedWarningDataSchema = warningDataSchema.extend({
  deletedAt: z.coerce.date().describe("Data de exclusão"),
  deletedBy: z.string().nullable().describe("ID do usuário que excluiu"),
});

const warningListDataSchema = z.array(warningDataSchema);

export const createWarningResponseSchema =
  successResponseSchema(warningDataSchema);
export const getWarningResponseSchema =
  successResponseSchema(warningDataSchema);
export const updateWarningResponseSchema =
  successResponseSchema(warningDataSchema);
export const deleteWarningResponseSchema = successResponseSchema(
  deletedWarningDataSchema
);
export const listWarningsResponseSchema = successResponseSchema(
  warningListDataSchema
);

export type CreateWarning = z.infer<typeof createWarningSchema>;
export type CreateWarningInput = CreateWarning & {
  organizationId: string;
  userId: string;
};

export type UpdateWarning = z.infer<typeof updateWarningSchema>;
export type UpdateWarningInput = UpdateWarning & {
  userId: string;
};

export type WarningData = z.infer<typeof warningDataSchema>;
export type DeletedWarningData = z.infer<typeof deletedWarningDataSchema>;
