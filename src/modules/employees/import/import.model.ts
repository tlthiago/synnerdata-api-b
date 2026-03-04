import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

export const importRowErrorSchema = z.object({
  row: z.number().describe("Número da linha no Excel"),
  field: z.string().describe("Campo com erro"),
  message: z.string().describe("Mensagem de erro"),
});

export const importResultSchema = z.object({
  total: z.number().describe("Total de linhas no arquivo"),
  imported: z.number().describe("Linhas importadas com sucesso"),
  failed: z.number().describe("Linhas com erro"),
  errors: z.array(importRowErrorSchema).describe("Erros por linha"),
});

export const importResponseSchema = successResponseSchema(importResultSchema);

export type ImportRowError = z.infer<typeof importRowErrorSchema>;
export type ImportResult = z.infer<typeof importResultSchema>;

export type ImportInput = {
  buffer: Buffer;
  organizationId: string;
  userId: string;
};
