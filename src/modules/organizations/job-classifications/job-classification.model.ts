import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

export const createJobClassificationSchema = z.object({
  name: z
    .string()
    .min(1, "Nome é obrigatório")
    .max(255, "Nome deve ter no máximo 255 caracteres")
    .describe("Nome da classificação de cargo (CBO)"),
});

export const updateJobClassificationSchema =
  createJobClassificationSchema.partial();

const jobClassificationDataSchema = z.object({
  id: z.string().describe("ID da classificação de cargo"),
  organizationId: z.string().describe("ID da organização"),
  name: z.string().describe("Nome da classificação de cargo"),
  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
});

const deletedJobClassificationDataSchema = jobClassificationDataSchema.extend({
  deletedAt: z.coerce.date().describe("Data de exclusão"),
  deletedBy: z.string().nullable().describe("ID do usuário que excluiu"),
});

const jobClassificationListDataSchema = z.array(jobClassificationDataSchema);

export const createJobClassificationResponseSchema = successResponseSchema(
  jobClassificationDataSchema
);
export const getJobClassificationResponseSchema = successResponseSchema(
  jobClassificationDataSchema
);
export const updateJobClassificationResponseSchema = successResponseSchema(
  jobClassificationDataSchema
);
export const deleteJobClassificationResponseSchema = successResponseSchema(
  deletedJobClassificationDataSchema
);
export const listJobClassificationsResponseSchema = successResponseSchema(
  jobClassificationListDataSchema
);

export type CreateJobClassification = z.infer<
  typeof createJobClassificationSchema
>;
export type CreateJobClassificationInput = CreateJobClassification & {
  organizationId: string;
  userId: string;
};

export type UpdateJobClassification = z.infer<
  typeof updateJobClassificationSchema
>;
export type UpdateJobClassificationInput = UpdateJobClassification & {
  userId: string;
};

export type JobClassificationData = z.infer<typeof jobClassificationDataSchema>;
export type DeletedJobClassificationData = z.infer<
  typeof deletedJobClassificationDataSchema
>;
