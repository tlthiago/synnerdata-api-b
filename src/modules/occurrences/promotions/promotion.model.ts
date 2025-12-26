import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";
import { entityReferenceSchema } from "@/lib/schemas/relationships";

export const createPromotionSchema = z.object({
  employeeId: z
    .string()
    .min(1, "ID do funcionário é obrigatório")
    .describe("ID do funcionário"),
  promotionDate: z
    .string()
    .refine((date) => !Number.isNaN(Date.parse(date)), {
      message: "Data de promoção inválida",
    })
    .describe("Data da promoção (formato ISO)"),
  previousJobPositionId: z
    .string()
    .min(1, "ID do cargo anterior é obrigatório")
    .describe("ID do cargo anterior"),
  newJobPositionId: z
    .string()
    .min(1, "ID do novo cargo é obrigatório")
    .describe("ID do novo cargo"),
  previousSalary: z
    .string()
    .refine(
      (val) =>
        !Number.isNaN(Number.parseFloat(val)) && Number.parseFloat(val) >= 0,
      {
        message: "Salário anterior deve ser um número válido e não negativo",
      }
    )
    .describe("Salário anterior"),
  newSalary: z
    .string()
    .refine(
      (val) =>
        !Number.isNaN(Number.parseFloat(val)) && Number.parseFloat(val) >= 0,
      {
        message: "Novo salário deve ser um número válido e não negativo",
      }
    )
    .describe("Novo salário"),
  reason: z
    .string()
    .max(500, "Motivo deve ter no máximo 500 caracteres")
    .optional()
    .describe("Motivo da promoção"),
  notes: z
    .string()
    .max(1000, "Observações devem ter no máximo 1000 caracteres")
    .optional()
    .describe("Observações adicionais"),
});

export const updatePromotionSchema = createPromotionSchema.partial();

const promotionDataSchema = z.object({
  id: z.string().describe("ID da promoção"),
  organizationId: z.string().describe("ID da organização"),
  employee: entityReferenceSchema.describe("Funcionário"),
  promotionDate: z.string().describe("Data da promoção"),
  previousJobPosition: entityReferenceSchema.describe("Cargo anterior"),
  newJobPosition: entityReferenceSchema.describe("Novo cargo"),
  previousSalary: z.string().describe("Salário anterior"),
  newSalary: z.string().describe("Novo salário"),
  reason: z.string().nullable().describe("Motivo da promoção"),
  notes: z.string().nullable().describe("Observações adicionais"),
  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
  createdBy: z.string().nullable().describe("ID do usuário que criou"),
  updatedBy: z.string().nullable().describe("ID do usuário que atualizou"),
});

const deletedPromotionDataSchema = promotionDataSchema.extend({
  deletedAt: z.coerce.date().describe("Data de exclusão"),
  deletedBy: z.string().nullable().describe("ID do usuário que excluiu"),
});

const promotionListDataSchema = z.array(promotionDataSchema);

export const createPromotionResponseSchema =
  successResponseSchema(promotionDataSchema);
export const getPromotionResponseSchema =
  successResponseSchema(promotionDataSchema);
export const updatePromotionResponseSchema =
  successResponseSchema(promotionDataSchema);
export const deletePromotionResponseSchema = successResponseSchema(
  deletedPromotionDataSchema
);
export const listPromotionsResponseSchema = successResponseSchema(
  promotionListDataSchema
);

export type CreatePromotion = z.infer<typeof createPromotionSchema>;
export type CreatePromotionInput = CreatePromotion & {
  organizationId: string;
  userId: string;
};

export type UpdatePromotion = z.infer<typeof updatePromotionSchema>;
export type UpdatePromotionInput = UpdatePromotion & {
  userId: string;
};

export type PromotionData = z.infer<typeof promotionDataSchema>;
export type DeletedPromotionData = z.infer<typeof deletedPromotionDataSchema>;
