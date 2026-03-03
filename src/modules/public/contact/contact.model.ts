import { z } from "zod";

export const contactBodySchema = z.object({
  name: z
    .string()
    .min(1, "Nome é obrigatório")
    .max(255, "Nome deve ter no máximo 255 caracteres")
    .describe("Nome completo"),
  email: z.email("Email inválido").describe("Email de contato"),
  company: z
    .string()
    .min(1, "Empresa é obrigatória")
    .max(255, "Empresa deve ter no máximo 255 caracteres")
    .describe("Nome da empresa"),
  phone: z
    .string()
    .regex(/^\d{10,11}$/, "Celular deve conter 10 ou 11 dígitos")
    .optional()
    .describe("Celular (10 ou 11 dígitos, sem máscara)"),
  subject: z
    .string()
    .min(1, "Assunto é obrigatório")
    .max(255, "Assunto deve ter no máximo 255 caracteres")
    .describe("Assunto da mensagem"),
  message: z
    .string()
    .min(10, "Mensagem deve ter no mínimo 10 caracteres")
    .max(5000, "Mensagem deve ter no máximo 5000 caracteres")
    .describe("Mensagem"),
});

export type ContactBody = z.infer<typeof contactBodySchema>;
