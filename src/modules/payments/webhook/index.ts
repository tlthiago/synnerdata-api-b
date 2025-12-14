import { Elysia } from "elysia";
import {
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import { processWebhookResponseSchema } from "./webhook.model";
import { WebhookService } from "./webhook.service";

export const webhookController = new Elysia({
  name: "webhook",
  prefix: "/webhooks",
  detail: { tags: ["Payments - Webhook"] },
}).post(
  "/pagarme",
  async ({ request }) => {
    const authHeader = request.headers.get("Authorization");
    const rawBody = await request.text();
    const body = JSON.parse(rawBody);
    await WebhookService.process(body, authHeader, rawBody);
    return { success: true as const, data: { received: true } };
  },
  {
    response: {
      200: processWebhookResponseSchema,
      400: validationErrorSchema,
      401: unauthorizedErrorSchema,
    },
    detail: {
      summary: "Process Pagarme webhook",
      description:
        "Receives and processes webhook events from Pagarme payment provider.",
    },
  }
);
