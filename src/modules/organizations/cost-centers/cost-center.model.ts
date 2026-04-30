import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";
import { entityReferenceSchema } from "@/lib/schemas/relationships";

export const createCostCenterSchema = z.object({
  name: z
    .string()
    .min(1, "Nome é obrigatório")
    .max(100, "Nome deve ter no máximo 100 caracteres")
    .describe("Nome do centro de custo"),
});

export const updateCostCenterSchema = createCostCenterSchema.partial();

export const idParamSchema = z.object({
  id: z.string().min(1).describe("ID do centro de custo"),
});

const costCenterDataSchema = z.object({
  id: z.string().describe("ID do centro de custo"),
  organizationId: z.string().describe("ID da organização"),
  name: z.string().describe("Nome do centro de custo"),
  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
  createdBy: entityReferenceSchema.describe(
    "Usuário que criou o centro de custo"
  ),
  updatedBy: entityReferenceSchema.describe(
    "Usuário que atualizou o centro de custo pela última vez"
  ),
});

const deletedCostCenterDataSchema = costCenterDataSchema.extend({
  deletedAt: z.coerce.date().describe("Data de exclusão"),
});

const costCenterListDataSchema = z.array(costCenterDataSchema);

export const createCostCenterResponseSchema =
  successResponseSchema(costCenterDataSchema);
export const getCostCenterResponseSchema =
  successResponseSchema(costCenterDataSchema);
export const updateCostCenterResponseSchema =
  successResponseSchema(costCenterDataSchema);
export const deleteCostCenterResponseSchema = successResponseSchema(
  deletedCostCenterDataSchema
);
export const listCostCentersResponseSchema = successResponseSchema(
  costCenterListDataSchema
);

export type CreateCostCenter = z.infer<typeof createCostCenterSchema>;
export type CreateCostCenterInput = CreateCostCenter & {
  organizationId: string;
  userId: string;
};

export type UpdateCostCenter = z.infer<typeof updateCostCenterSchema>;
export type UpdateCostCenterInput = UpdateCostCenter & {
  userId: string;
};

export type CostCenterData = z.infer<typeof costCenterDataSchema>;
export type DeletedCostCenterData = z.infer<typeof deletedCostCenterDataSchema>;
