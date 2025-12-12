import { Elysia } from "elysia";
import { webhookPayloadSchema, webhookResponseSchema } from "./webhook.model";
import { WebhookService } from "./webhook.service";

export const webhookController = new Elysia({
  name: "webhook",
  prefix: "/webhooks",
  detail: { tags: ["Payments - Webhook"] },
}).post(
  "/pagarme",
  async ({ body, request }) => {
    const signature = request.headers.get("x-hub-signature");
    await WebhookService.process(body, signature);
    return { received: true };
  },
  {
    body: webhookPayloadSchema,
    response: webhookResponseSchema,
    detail: { summary: "Process Pagarme webhook" },
  }
);
