import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";
import { isFutureDate } from "@/lib/schemas/date-helpers";

export const createPpeDeliverySchema = z.object({
  employeeId: z
    .string()
    .min(1, "ID do funcionário é obrigatório")
    .describe("ID do funcionário"),
  deliveryDate: z
    .string()
    .min(1, "Data de entrega é obrigatória")
    .date("Data de entrega deve ser uma data válida")
    .refine((val) => !isFutureDate(val), {
      message: "Data de entrega não pode ser no futuro",
    })
    .describe("Data de entrega (YYYY-MM-DD)"),
  reason: z
    .string()
    .min(1, "Motivo é obrigatório")
    .max(500, "Motivo deve ter no máximo 500 caracteres")
    .describe("Motivo da entrega"),
  deliveredBy: z
    .string()
    .min(1, "Nome de quem entregou é obrigatório")
    .max(200, "Nome deve ter no máximo 200 caracteres")
    .describe("Nome de quem entregou"),
  ppeItemIds: z
    .array(z.string().min(1))
    .optional()
    .describe("IDs dos EPIs a serem associados"),
});

export const updatePpeDeliverySchema = z.object({
  deliveryDate: z
    .string()
    .date("Data de entrega deve ser uma data válida")
    .refine((val) => !isFutureDate(val), {
      message: "Data de entrega não pode ser no futuro",
    })
    .optional()
    .describe("Data de entrega (YYYY-MM-DD)"),
  reason: z
    .string()
    .max(500, "Motivo deve ter no máximo 500 caracteres")
    .optional()
    .describe("Motivo da entrega"),
  deliveredBy: z
    .string()
    .max(200, "Nome deve ter no máximo 200 caracteres")
    .optional()
    .describe("Nome de quem entregou"),
});

export const addPpeItemSchema = z.object({
  ppeItemId: z.string().min(1, "ID do EPI é obrigatório"),
});

export const listPpeDeliveriesQuerySchema = z.object({
  employeeId: z.string().optional().describe("Filtrar por funcionário"),
});

// Param schemas
export const idParamSchema = z.object({
  id: z.string().min(1).describe("ID da entrega de EPI"),
});

export const ppeItemIdParamsSchema = z.object({
  id: z.string().min(1).describe("ID da entrega de EPI"),
  ppeItemId: z.string().min(1).describe("ID do EPI"),
});

// Response data schemas
const employeeDataSchema = z.object({
  id: z.string().describe("ID do funcionário"),
  name: z.string().describe("Nome do funcionário"),
  cpf: z.string().describe("CPF do funcionário"),
});

const ppeItemDataSchema = z.object({
  id: z.string().describe("ID do EPI"),
  name: z.string().describe("Nome do EPI"),
  equipment: z.string().describe("Equipamento"),
});

const ppeDeliveryDataSchema = z.object({
  id: z.string().describe("ID da entrega"),
  organizationId: z.string().describe("ID da organização"),
  employee: employeeDataSchema.describe("Dados do funcionário"),
  deliveryDate: z.string().describe("Data de entrega"),
  reason: z.string().describe("Motivo da entrega"),
  deliveredBy: z.string().describe("Nome de quem entregou"),
  items: z.array(ppeItemDataSchema).describe("EPIs entregues"),
  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
});

const deletedPpeDeliveryDataSchema = ppeDeliveryDataSchema.extend({
  deletedAt: z.coerce.date().describe("Data de exclusão"),
  deletedBy: z.string().nullable().describe("ID do usuário que excluiu"),
});

const ppeDeliveryListDataSchema = z.array(ppeDeliveryDataSchema);

// Response schemas
export const createPpeDeliveryResponseSchema = successResponseSchema(
  ppeDeliveryDataSchema
);
export const getPpeDeliveryResponseSchema = successResponseSchema(
  ppeDeliveryDataSchema
);
export const updatePpeDeliveryResponseSchema = successResponseSchema(
  ppeDeliveryDataSchema
);
export const deletePpeDeliveryResponseSchema = successResponseSchema(
  deletedPpeDeliveryDataSchema
);
export const listPpeDeliveriesResponseSchema = successResponseSchema(
  ppeDeliveryListDataSchema
);

// PPE Item association response schemas
export const addPpeItemResponseSchema = successResponseSchema(
  z.object({
    ppeDeliveryId: z.string(),
    ppeItemId: z.string(),
    createdAt: z.coerce.date(),
  })
);
export const listPpeItemsResponseSchema = successResponseSchema(
  z.array(ppeItemDataSchema)
);
export const removePpeItemResponseSchema = successResponseSchema(
  z.object({
    success: z.boolean(),
  })
);

// Types
export type CreatePpeDelivery = z.infer<typeof createPpeDeliverySchema>;
export type CreatePpeDeliveryInput = CreatePpeDelivery & {
  organizationId: string;
  userId: string;
};

export type UpdatePpeDelivery = z.infer<typeof updatePpeDeliverySchema>;
export type UpdatePpeDeliveryInput = UpdatePpeDelivery & {
  userId: string;
};

export type AddPpeItem = z.infer<typeof addPpeItemSchema>;
export type PpeDeliveryData = z.infer<typeof ppeDeliveryDataSchema>;
export type DeletedPpeDeliveryData = z.infer<
  typeof deletedPpeDeliveryDataSchema
>;
