import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

export const searchCboOccupationsQuerySchema = z.object({
  search: z
    .string()
    .min(2, "Busca deve ter no mínimo 2 caracteres")
    .describe("Busca por código ou título da ocupação"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const cboOccupationIdParamSchema = z.object({
  id: z.string().min(1).describe("ID da ocupação CBO"),
});

const cboOccupationDataSchema = z.object({
  id: z.string().describe("ID da ocupação CBO"),
  code: z.string().describe("Código CBO (ex: 2124-05)"),
  title: z.string().describe("Título da ocupação"),
  familyCode: z.string().describe("Código da família CBO"),
  familyTitle: z.string().describe("Título da família CBO"),
});

const cboOccupationListDataSchema = z.object({
  items: z.array(cboOccupationDataSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export const searchCboOccupationsResponseSchema = successResponseSchema(
  cboOccupationListDataSchema
);

export const getCboOccupationResponseSchema = successResponseSchema(
  cboOccupationDataSchema
);

export type SearchCboOccupationsQuery = z.infer<
  typeof searchCboOccupationsQuerySchema
>;
export type CboOccupationData = z.infer<typeof cboOccupationDataSchema>;
export type CboOccupationListData = z.infer<typeof cboOccupationListDataSchema>;
