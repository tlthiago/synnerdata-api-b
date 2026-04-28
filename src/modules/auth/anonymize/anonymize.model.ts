import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

export const anonymizeRequestSchema = z.object({
  password: z.string().min(1, "Senha obrigatória."),
});

export type AnonymizeRequest = z.infer<typeof anonymizeRequestSchema>;

export const anonymizeResponseSchema = successResponseSchema(z.null());

export type AnonymizeResponse = z.infer<typeof anonymizeResponseSchema>;
