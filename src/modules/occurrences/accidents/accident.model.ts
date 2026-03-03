import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";
import { isFutureDate } from "@/lib/schemas/date-helpers";
import { entityReferenceSchema } from "@/lib/schemas/relationships";

export const createAccidentSchema = z.object({
  employeeId: z
    .string()
    .min(1, "ID do funcionário é obrigatório")
    .describe("ID do funcionário"),
  date: z.iso
    .date({ error: "Data inválida" })
    .refine((val) => !isFutureDate(val), {
      message: "Data do acidente não pode ser no futuro",
    })
    .describe("Data do acidente"),
  description: z
    .string()
    .min(1, "Descrição é obrigatória")
    .max(500, "Descrição deve ter no máximo 500 caracteres")
    .describe("Descrição do acidente"),
  nature: z
    .string()
    .min(1, "Natureza é obrigatória")
    .max(255, "Natureza deve ter no máximo 255 caracteres")
    .describe("Natureza/tipo do acidente"),
  cat: z
    .string()
    .max(25, "CAT deve ter no máximo 25 caracteres")
    .optional()
    .describe("Número da CAT (Comunicação de Acidente de Trabalho)"),
  measuresTaken: z
    .string()
    .min(1, "Medidas tomadas são obrigatórias")
    .max(500, "Medidas tomadas devem ter no máximo 500 caracteres")
    .describe("Medidas tomadas após o acidente"),
  notes: z.string().optional().describe("Observações adicionais"),
});

export const updateAccidentSchema = createAccidentSchema.partial();

export const idParamSchema = z.object({
  id: z.string().min(1).describe("ID do acidente"),
});

const accidentDataSchema = z.object({
  id: z.string().describe("ID do acidente"),
  organizationId: z.string().describe("ID da organização"),
  employee: entityReferenceSchema.describe("Funcionário"),
  date: z.string().describe("Data do acidente"),
  description: z.string().describe("Descrição do acidente"),
  nature: z.string().describe("Natureza/tipo do acidente"),
  cat: z.string().nullable().describe("Número da CAT"),
  measuresTaken: z.string().describe("Medidas tomadas"),
  notes: z.string().nullable().describe("Observações"),
  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
});

const deletedAccidentDataSchema = accidentDataSchema.extend({
  deletedAt: z.coerce.date().describe("Data de exclusão"),
  deletedBy: z.string().nullable().describe("ID do usuário que excluiu"),
});

const accidentListDataSchema = z.array(accidentDataSchema);

export const createAccidentResponseSchema =
  successResponseSchema(accidentDataSchema);
export const getAccidentResponseSchema =
  successResponseSchema(accidentDataSchema);
export const updateAccidentResponseSchema =
  successResponseSchema(accidentDataSchema);
export const deleteAccidentResponseSchema = successResponseSchema(
  deletedAccidentDataSchema
);
export const listAccidentsResponseSchema = successResponseSchema(
  accidentListDataSchema
);

export type CreateAccident = z.infer<typeof createAccidentSchema>;
export type CreateAccidentInput = CreateAccident & {
  organizationId: string;
  userId: string;
};

export type UpdateAccident = z.infer<typeof updateAccidentSchema>;
export type UpdateAccidentInput = UpdateAccident & {
  userId: string;
};

export type AccidentData = z.infer<typeof accidentDataSchema>;
export type DeletedAccidentData = z.infer<typeof deletedAccidentDataSchema>;
