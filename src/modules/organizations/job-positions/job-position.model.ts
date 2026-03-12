import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

export const createJobPositionSchema = z.object({
  name: z
    .string()
    .min(1, "Nome é obrigatório")
    .max(100, "Nome deve ter no máximo 100 caracteres")
    .describe("Nome da função"),
  description: z
    .string()
    .max(500, "Descrição deve ter no máximo 500 caracteres")
    .optional()
    .describe("Descrição da função"),
});

export const updateJobPositionSchema = createJobPositionSchema
  .partial()
  .extend({
    description: z
      .string()
      .max(500, "Descrição deve ter no máximo 500 caracteres")
      .nullable()
      .optional()
      .describe("Descrição da função"),
  });

export const idParamSchema = z.object({
  id: z.string().min(1).describe("ID do cargo"),
});

const jobPositionDataSchema = z.object({
  id: z.string().describe("ID da função"),
  organizationId: z.string().describe("ID da organização"),
  name: z.string().describe("Nome da função"),
  description: z.string().nullable().describe("Descrição da função"),
  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
});

const deletedJobPositionDataSchema = jobPositionDataSchema.extend({
  deletedAt: z.coerce.date().describe("Data de exclusão"),
  deletedBy: z.string().nullable().describe("ID do usuário que excluiu"),
});

const jobPositionListDataSchema = z.array(jobPositionDataSchema);

export const createJobPositionResponseSchema = successResponseSchema(
  jobPositionDataSchema
);
export const getJobPositionResponseSchema = successResponseSchema(
  jobPositionDataSchema
);
export const updateJobPositionResponseSchema = successResponseSchema(
  jobPositionDataSchema
);
export const deleteJobPositionResponseSchema = successResponseSchema(
  deletedJobPositionDataSchema
);
export const listJobPositionsResponseSchema = successResponseSchema(
  jobPositionListDataSchema
);

export type CreateJobPosition = z.infer<typeof createJobPositionSchema>;
export type CreateJobPositionInput = CreateJobPosition & {
  organizationId: string;
  userId: string;
};

export type UpdateJobPosition = z.infer<typeof updateJobPositionSchema>;
export type UpdateJobPositionInput = UpdateJobPosition & {
  userId: string;
};

export type JobPositionData = z.infer<typeof jobPositionDataSchema>;
export type DeletedJobPositionData = z.infer<
  typeof deletedJobPositionDataSchema
>;
