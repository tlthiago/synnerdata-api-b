import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";
import { isFutureDate } from "@/lib/schemas/date-helpers";
import { entityReferenceSchema } from "@/lib/schemas/relationships";

export const createPromotionSchema = z.object({
  employeeId: z
    .string()
    .min(1, "ID do funcionário é obrigatório")
    .describe("ID do funcionário"),
  promotionDate: z
    .string()
    .date("Data de promoção deve ser uma data válida")
    .refine((val) => !isFutureDate(val), {
      message: "Data de promoção não pode ser no futuro",
    })
    .describe("Data da promoção (YYYY-MM-DD)"),
  previousJobPositionId: z
    .string()
    .min(1, "ID do cargo anterior é obrigatório")
    .describe("ID do cargo anterior"),
  newJobPositionId: z
    .string()
    .min(1, "ID do novo cargo é obrigatório")
    .describe("ID do novo cargo"),
  previousSalary: z
    .number()
    .min(0, "Salário anterior não pode ser negativo")
    .describe("Salário anterior"),
  newSalary: z
    .number()
    .min(0, "Novo salário não pode ser negativo")
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

export const updatePromotionSchema = createPromotionSchema.partial().extend({
  reason: z
    .string()
    .max(500, "Motivo deve ter no máximo 500 caracteres")
    .nullable()
    .optional(),
  notes: z
    .string()
    .max(1000, "Observações devem ter no máximo 1000 caracteres")
    .nullable()
    .optional(),
});

export const idParamSchema = z.object({
  id: z.string().min(1).describe("ID da promoção"),
});

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
