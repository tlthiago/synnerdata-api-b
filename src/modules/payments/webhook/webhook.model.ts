import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";

export const processWebhookSchema = z.looseObject({
  id: z.string().describe("Webhook event ID from Pagarme"),
  type: z.string().describe("Event type (e.g., charge.paid)"),
  created_at: z.string().describe("Event creation timestamp"),
  data: z.record(z.string(), z.unknown()).describe("Event payload data"),
});

const webhookDataSchema = z.object({
  received: z.boolean().describe("Whether the webhook was received"),
});

export const processWebhookResponseSchema =
  successResponseSchema(webhookDataSchema);

export type ProcessWebhook = z.infer<typeof processWebhookSchema>;
export type ProcessWebhookInput = ProcessWebhook & { signature: string | null };
export type WebhookData = z.infer<typeof webhookDataSchema>;
export type ProcessWebhookResponse = z.infer<
  typeof processWebhookResponseSchema
>;
