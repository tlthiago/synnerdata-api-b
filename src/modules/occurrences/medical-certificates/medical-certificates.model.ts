import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";
import { isFutureDate } from "@/lib/schemas/date-helpers";
import { entityReferenceSchema } from "@/lib/schemas/relationships";

const medicalCertificateFieldsSchema = z.object({
  employeeId: z
    .string()
    .min(1, "Funcionário é obrigatório")
    .describe("ID do funcionário"),
  startDate: z
    .string()
    .date("Data de início deve ser uma data válida")
    .refine((val) => !isFutureDate(val), {
      message: "Data de início não pode ser no futuro",
    })
    .describe("Data de início do afastamento"),
  endDate: z
    .string()
    .date("Data de fim deve ser uma data válida")
    .describe("Data de fim do afastamento"),
  daysOff: z
    .number()
    .int("Dias de afastamento deve ser um número inteiro")
    .min(1, "Dias de afastamento deve ser no mínimo 1")
    .describe("Dias de afastamento"),
  cid: z
    .string()
    .max(10, "CID deve ter no máximo 10 caracteres")
    .optional()
    .describe("Código CID"),
  doctorName: z
    .string()
    .max(255, "Nome do médico deve ter no máximo 255 caracteres")
    .optional()
    .describe("Nome do médico"),
  doctorCrm: z
    .string()
    .max(20, "CRM do médico deve ter no máximo 20 caracteres")
    .optional()
    .describe("CRM do médico"),
  notes: z.string().optional().describe("Observações"),
});

export const createMedicalCertificateSchema =
  medicalCertificateFieldsSchema.refine(
    (data) => new Date(data.startDate) <= new Date(data.endDate),
    {
      message: "Data de início deve ser anterior ou igual à data de fim",
      path: ["startDate"],
    }
  );

export const updateMedicalCertificateSchema = medicalCertificateFieldsSchema
  .partial()
  .omit({ employeeId: true })
  .extend({
    cid: z
      .string()
      .max(10, "CID deve ter no máximo 10 caracteres")
      .nullable()
      .optional(),
    doctorName: z
      .string()
      .max(255, "Nome do médico deve ter no máximo 255 caracteres")
      .nullable()
      .optional(),
    doctorCrm: z
      .string()
      .max(20, "CRM do médico deve ter no máximo 20 caracteres")
      .nullable()
      .optional(),
    notes: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) <= new Date(data.endDate);
      }
      return true;
    },
    {
      message: "Data de início deve ser anterior ou igual à data de fim",
      path: ["startDate"],
    }
  );

export const idParamSchema = z.object({
  id: z.string().min(1).describe("ID do atestado médico"),
});

const medicalCertificateDataSchema = z.object({
  id: z.string().describe("ID do atestado"),
  organizationId: z.string().describe("ID da organização"),
  employee: entityReferenceSchema.describe("Funcionário"),
  startDate: z.string().describe("Data de início do afastamento"),
  endDate: z.string().describe("Data de fim do afastamento"),
  daysOff: z.number().describe("Dias de afastamento"),
  cid: z.string().nullable().describe("Código CID"),
  doctorName: z.string().nullable().describe("Nome do médico"),
  doctorCrm: z.string().nullable().describe("CRM do médico"),
  notes: z.string().nullable().describe("Observações"),
  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
});

const deletedMedicalCertificateDataSchema = medicalCertificateDataSchema.extend(
  {
    deletedAt: z.coerce.date().describe("Data de exclusão"),
  }
);

const medicalCertificateListDataSchema = z.array(medicalCertificateDataSchema);

export const createMedicalCertificateResponseSchema = successResponseSchema(
  medicalCertificateDataSchema
);
export const getMedicalCertificateResponseSchema = successResponseSchema(
  medicalCertificateDataSchema
);
export const updateMedicalCertificateResponseSchema = successResponseSchema(
  medicalCertificateDataSchema
);
export const deleteMedicalCertificateResponseSchema = successResponseSchema(
  deletedMedicalCertificateDataSchema
);
export const listMedicalCertificatesResponseSchema = successResponseSchema(
  medicalCertificateListDataSchema
);

export type CreateMedicalCertificate = z.infer<
  typeof createMedicalCertificateSchema
>;
export type CreateMedicalCertificateInput = CreateMedicalCertificate & {
  organizationId: string;
  userId: string;
};

export type UpdateMedicalCertificate = z.infer<
  typeof updateMedicalCertificateSchema
>;
export type UpdateMedicalCertificateInput = UpdateMedicalCertificate & {
  userId: string;
};

export type MedicalCertificateData = z.infer<
  typeof medicalCertificateDataSchema
>;
export type DeletedMedicalCertificateData = z.infer<
  typeof deletedMedicalCertificateDataSchema
>;
