import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

export const createPpeItemSchema = z.object({
  name: z
    .string()
    .min(1, "Nome é obrigatório")
    .max(100, "Nome deve ter no máximo 100 caracteres")
    .describe("Nome do EPI"),
  description: z
    .string()
    .min(1, "Descrição é obrigatória")
    .max(500, "Descrição deve ter no máximo 500 caracteres")
    .describe("Descrição do EPI"),
  equipment: z
    .string()
    .min(1, "Equipamento é obrigatório")
    .max(500, "Equipamento deve ter no máximo 500 caracteres")
    .describe("Lista de equipamentos"),
});

export const updatePpeItemSchema = createPpeItemSchema.partial();

export const idParamSchema = z.object({
  id: z.string().min(1).describe("ID do EPI"),
});

export const jobPositionIdParamsSchema = z.object({
  id: z.string().min(1).describe("ID do EPI"),
  jobPositionId: z.string().min(1).describe("ID da função"),
});

const ppeItemDataSchema = z.object({
  id: z.string().describe("ID do EPI"),
  organizationId: z.string().describe("ID da organização"),
  name: z.string().describe("Nome do EPI"),
  description: z.string().describe("Descrição do EPI"),
  equipment: z.string().describe("Lista de equipamentos"),
  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
});

const deletedPpeItemDataSchema = ppeItemDataSchema.extend({
  deletedAt: z.coerce.date().describe("Data de exclusão"),
});

const ppeItemListDataSchema = z.array(ppeItemDataSchema);

export const createPpeItemResponseSchema =
  successResponseSchema(ppeItemDataSchema);
export const getPpeItemResponseSchema =
  successResponseSchema(ppeItemDataSchema);
export const updatePpeItemResponseSchema =
  successResponseSchema(ppeItemDataSchema);
export const deletePpeItemResponseSchema = successResponseSchema(
  deletedPpeItemDataSchema
);
export const listPpeItemsResponseSchema = successResponseSchema(
  ppeItemListDataSchema
);

// Job Position association schemas
export const addJobPositionSchema = z.object({
  jobPositionId: z.string().min(1, "Job position ID é obrigatório"),
});

const jobPositionDataSchema = z.object({
  id: z.string().describe("ID da função"),
  name: z.string().describe("Nome da função"),
  description: z.string().nullable().describe("Descrição da função"),
});

const jobPositionListDataSchema = z.array(jobPositionDataSchema);

export const addJobPositionResponseSchema = successResponseSchema(
  z.object({
    ppeItemId: z.string(),
    jobPositionId: z.string(),
    createdAt: z.coerce.date(),
  })
);
export const listJobPositionsResponseSchema = successResponseSchema(
  jobPositionListDataSchema
);
export const removeJobPositionResponseSchema = successResponseSchema(
  z.object({
    success: z.boolean(),
  })
);

export type CreatePpeItem = z.infer<typeof createPpeItemSchema>;
export type CreatePpeItemInput = CreatePpeItem & {
  organizationId: string;
  userId: string;
};

export type UpdatePpeItem = z.infer<typeof updatePpeItemSchema>;
export type UpdatePpeItemInput = UpdatePpeItem & {
  userId: string;
};

export type PpeItemData = z.infer<typeof ppeItemDataSchema>;
export type DeletedPpeItemData = z.infer<typeof deletedPpeItemDataSchema>;
export type AddJobPosition = z.infer<typeof addJobPositionSchema>;
