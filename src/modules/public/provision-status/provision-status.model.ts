import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

export const provisionStatusQuerySchema = z.object({
  email: z.email().describe("Email do owner da provisão"),
});

export const provisionStatusDataSchema = z.object({
  status: z.enum(["processing", "ready", "not_found"]),
  activationUrl: z.string().nullable(),
});

export const provisionStatusResponseSchema = successResponseSchema(
  provisionStatusDataSchema
);

export type ProvisionStatusQuery = z.infer<typeof provisionStatusQuerySchema>;
export type ProvisionStatusData = z.infer<typeof provisionStatusDataSchema>;
