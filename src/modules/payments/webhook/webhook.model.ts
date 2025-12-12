import { z } from "zod";

// ============================================================
// WEBHOOK PAYLOAD SCHEMA
// ============================================================

export const webhookPayloadSchema = z.object({
  id: z.string(),
  type: z.string(),
  created_at: z.string(),
  data: z.record(z.string(), z.unknown()),
});

// ============================================================
// RESPONSE SCHEMA
// ============================================================

export const webhookResponseSchema = z.object({
  received: z.boolean(),
});

// ============================================================
// INFERRED TYPES
// ============================================================

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
export type WebhookResponse = z.infer<typeof webhookResponseSchema>;
