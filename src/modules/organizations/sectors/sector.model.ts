import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";
import { entityReferenceSchema } from "@/lib/schemas/relationships";

export const createSectorSchema = z.object({
  name: z
    .string()
    .min(1, "Nome é obrigatório")
    .max(100, "Nome deve ter no máximo 100 caracteres")
    .describe("Nome do setor"),
});

export const updateSectorSchema = createSectorSchema.partial();

export const idParamSchema = z.object({
  id: z.string().min(1).describe("ID do setor"),
});

const sectorDataSchema = z.object({
  id: z.string().describe("ID do setor"),
  organizationId: z.string().describe("ID da organização"),
  name: z.string().describe("Nome do setor"),
  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
  createdBy: entityReferenceSchema.describe("Usuário que criou o setor"),
  updatedBy: entityReferenceSchema.describe(
    "Usuário que atualizou o setor pela última vez"
  ),
});

const deletedSectorDataSchema = sectorDataSchema.extend({
  deletedAt: z.coerce.date().describe("Data de exclusão"),
});

const sectorListDataSchema = z.array(sectorDataSchema);

export const createSectorResponseSchema =
  successResponseSchema(sectorDataSchema);
export const getSectorResponseSchema = successResponseSchema(sectorDataSchema);
export const updateSectorResponseSchema =
  successResponseSchema(sectorDataSchema);
export const deleteSectorResponseSchema = successResponseSchema(
  deletedSectorDataSchema
);
export const listSectorsResponseSchema =
  successResponseSchema(sectorListDataSchema);

export type CreateSector = z.infer<typeof createSectorSchema>;
export type CreateSectorInput = CreateSector & {
  organizationId: string;
  userId: string;
};

export type UpdateSector = z.infer<typeof updateSectorSchema>;
export type UpdateSectorInput = UpdateSector & {
  userId: string;
};

export type SectorData = z.infer<typeof sectorDataSchema>;
export type DeletedSectorData = z.infer<typeof deletedSectorDataSchema>;
