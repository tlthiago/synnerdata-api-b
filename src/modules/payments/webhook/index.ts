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
  async ({ request, body: rawBody }) => {
    const authHeader = request.headers.get("Authorization");
    const rawBodyString =
      typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody);
    const body = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;
    await WebhookService.process(body, authHeader, rawBodyString);
    return { success: true as const, data: { received: true } };
  },
  {
    parse: "text",
    response: {
      200: processWebhookResponseSchema,
      422: validationErrorSchema,
      401: unauthorizedErrorSchema,
    },
    detail: {
      summary: "Process Pagarme webhook",
      description:
        "Receives and processes webhook events from Pagarme payment provider.",
    },
  }
);
