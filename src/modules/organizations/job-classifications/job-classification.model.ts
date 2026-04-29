import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

export const createJobClassificationSchema = z
  .object({
    name: z
      .string()
      .min(1, "Nome é obrigatório")
      .max(255, "Nome deve ter no máximo 255 caracteres")
      .describe("Nome da classificação de cargo (CBO)")
      .optional(),
    cboOccupationId: z
      .string()
      .min(1, "ID da ocupação CBO é obrigatório")
      .describe("ID da ocupação CBO oficial")
      .optional(),
  })
  .refine((data) => data.name || data.cboOccupationId, {
    message: "Nome ou CBO é obrigatório",
    path: ["name"],
  });

export const updateJobClassificationSchema = z.object({
  name: z
    .string()
    .min(1, "Nome é obrigatório")
    .max(255, "Nome deve ter no máximo 255 caracteres")
    .describe("Nome da classificação de cargo (CBO)")
    .optional(),
  cboOccupationId: z
    .string()
    .min(1, "ID da ocupação CBO é obrigatório")
    .describe("ID da ocupação CBO oficial")
    .nullable()
    .optional(),
});

export const idParamSchema = z.object({
  id: z.string().min(1).describe("ID do CBO"),
});

const jobClassificationDataSchema = z.object({
  id: z.string().describe("ID da classificação de cargo"),
  organizationId: z.string().describe("ID da organização"),
  name: z.string().describe("Nome da classificação de cargo"),
  cboOccupationId: z.string().nullable().describe("ID da ocupação CBO oficial"),
  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
});

const deletedJobClassificationDataSchema = jobClassificationDataSchema.extend({
  deletedAt: z.coerce.date().describe("Data de exclusão"),
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
