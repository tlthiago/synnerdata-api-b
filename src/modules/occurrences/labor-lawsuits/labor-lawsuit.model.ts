import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";
import { isFutureDate } from "@/lib/schemas/date-helpers";
import { entityReferenceSchema } from "@/lib/schemas/relationships";

const laborLawsuitFieldsSchema = z.object({
  employeeId: z
    .string()
    .min(1, "ID do funcionário é obrigatório")
    .describe("ID do funcionário relacionado"),
  processNumber: z
    .string()
    .min(1, "Número do processo é obrigatório")
    .max(25, "Número do processo deve ter no máximo 25 caracteres")
    .describe("Número do processo judicial"),
  court: z
    .string()
    .min(1, "Tribunal é obrigatório")
    .max(255, "Tribunal deve ter no máximo 255 caracteres")
    .describe("Tribunal ou vara responsável"),
  filingDate: z.iso
    .date({ error: "Data de ajuizamento inválida" })
    .refine((val) => !isFutureDate(val), {
      message: "Data de ajuizamento não pode ser no futuro",
    })
    .describe("Data de ajuizamento da ação"),
  knowledgeDate: z.iso
    .date({ error: "Data de conhecimento inválida" })
    .refine((val) => !isFutureDate(val), {
      message: "Data de conhecimento não pode ser no futuro",
    })
    .describe("Data de conhecimento da ação"),
  plaintiff: z
    .string()
    .min(1, "Reclamante é obrigatório")
    .max(255, "Reclamante deve ter no máximo 255 caracteres")
    .describe("Nome do reclamante"),
  defendant: z
    .string()
    .min(1, "Reclamado é obrigatório")
    .max(255, "Reclamado deve ter no máximo 255 caracteres")
    .describe("Nome do reclamado"),
  plaintiffLawyer: z
    .string()
    .max(255, "Nome do advogado deve ter no máximo 255 caracteres")
    .optional()
    .describe("Advogado do reclamante"),
  defendantLawyer: z
    .string()
    .max(255, "Nome do advogado deve ter no máximo 255 caracteres")
    .optional()
    .describe("Advogado do reclamado"),
  description: z
    .string()
    .min(1, "Descrição é obrigatória")
    .describe("Descrição da ação trabalhista"),
  claimAmount: z.coerce
    .number()
    .positive("Valor da causa deve ser positivo")
    .optional()
    .describe("Valor da causa"),
  progress: z.string().optional().describe("Andamento processual"),
  decision: z.string().optional().describe("Decisão/sentença"),
  conclusionDate: z.iso
    .date({ error: "Data de conclusão inválida" })
    .refine((val) => !isFutureDate(val), {
      message: "Data de conclusão não pode ser no futuro",
    })
    .optional()
    .describe("Data de conclusão do processo"),
  appeals: z.string().optional().describe("Recursos interpostos"),
  costsExpenses: z.coerce
    .number()
    .positive("Custas e despesas devem ser positivas")
    .optional()
    .describe("Custas e despesas processuais"),
});

export const createLaborLawsuitSchema = laborLawsuitFieldsSchema
  .refine((data) => data.knowledgeDate >= data.filingDate, {
    message:
      "Data de conhecimento deve ser igual ou posterior à data de ajuizamento",
    path: ["knowledgeDate"],
  })
  .refine(
    (data) => !data.conclusionDate || data.conclusionDate >= data.filingDate,
    {
      message:
        "Data de conclusão deve ser igual ou posterior à data de ajuizamento",
      path: ["conclusionDate"],
    }
  );

export const updateLaborLawsuitSchema = laborLawsuitFieldsSchema
  .omit({ employeeId: true })
  .partial()
  .refine(
    (data) => {
      if (!(data.filingDate && data.knowledgeDate)) {
        return true;
      }
      return data.knowledgeDate >= data.filingDate;
    },
    {
      message:
        "Data de conhecimento deve ser igual ou posterior à data de ajuizamento",
      path: ["knowledgeDate"],
    }
  )
  .refine(
    (data) => {
      if (!(data.filingDate && data.conclusionDate)) {
        return true;
      }
      return data.conclusionDate >= data.filingDate;
    },
    {
      message:
        "Data de conclusão deve ser igual ou posterior à data de ajuizamento",
      path: ["conclusionDate"],
    }
  );

export const listLaborLawsuitsQuerySchema = z.object({
  employeeId: z.string().optional().describe("Filtrar por funcionário"),
});

export const idParamSchema = z.object({
  id: z.string().min(1).describe("ID da ação trabalhista"),
});

const laborLawsuitDataSchema = z.object({
  id: z.string().describe("ID da ação trabalhista"),
  organizationId: z.string().describe("ID da organização"),
  employee: entityReferenceSchema.describe("Funcionário relacionado"),
  processNumber: z.string().describe("Número do processo"),
  court: z.string().describe("Tribunal ou vara"),
  filingDate: z.string().describe("Data de ajuizamento"),
  knowledgeDate: z.string().describe("Data de conhecimento"),
  plaintiff: z.string().describe("Reclamante"),
  defendant: z.string().describe("Reclamado"),
  plaintiffLawyer: z.string().nullable().describe("Advogado do reclamante"),
  defendantLawyer: z.string().nullable().describe("Advogado do reclamado"),
  description: z.string().describe("Descrição da ação"),
  claimAmount: z.number().nullable().describe("Valor da causa"),
  progress: z.string().nullable().describe("Andamento processual"),
  decision: z.string().nullable().describe("Decisão/sentença"),
  conclusionDate: z.string().nullable().describe("Data de conclusão"),
  appeals: z.string().nullable().describe("Recursos interpostos"),
  costsExpenses: z.number().nullable().describe("Custas e despesas"),
  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
});

const deletedLaborLawsuitDataSchema = laborLawsuitDataSchema.extend({
  deletedAt: z.coerce.date().describe("Data de exclusão"),
  deletedBy: z.string().nullable().describe("ID do usuário que excluiu"),
});

const laborLawsuitListDataSchema = z.array(laborLawsuitDataSchema);

export const createLaborLawsuitResponseSchema = successResponseSchema(
  laborLawsuitDataSchema
);
export const getLaborLawsuitResponseSchema = successResponseSchema(
  laborLawsuitDataSchema
);
export const updateLaborLawsuitResponseSchema = successResponseSchema(
  laborLawsuitDataSchema
);
export const deleteLaborLawsuitResponseSchema = successResponseSchema(
  deletedLaborLawsuitDataSchema
);
export const listLaborLawsuitsResponseSchema = successResponseSchema(
  laborLawsuitListDataSchema
);

export type CreateLaborLawsuit = z.infer<typeof createLaborLawsuitSchema>;
export type CreateLaborLawsuitInput = CreateLaborLawsuit & {
  organizationId: string;
  userId: string;
};

export type UpdateLaborLawsuit = z.infer<typeof updateLaborLawsuitSchema>;
export type UpdateLaborLawsuitInput = UpdateLaborLawsuit & {
  userId: string;
};

export type LaborLawsuitData = z.infer<typeof laborLawsuitDataSchema>;
export type DeletedLaborLawsuitData = z.infer<
  typeof deletedLaborLawsuitDataSchema
>;
