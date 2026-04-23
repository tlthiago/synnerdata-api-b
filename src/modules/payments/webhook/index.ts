import { Elysia } from "elysia";
import { isProduction } from "@/env";
import {
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import { extractClientIp } from "@/plugins/auth/validators";
import {
  processWebhookResponseSchema,
  processWebhookSchema,
} from "./webhook.model";
import { WebhookService } from "./webhook.service";

export const webhookController = new Elysia({
  name: "webhook",
  prefix: "/webhooks",
  detail: { tags: ["Payments - Webhook"] },
}).post(
  "/pagarme",
  async ({ request, body }) => {
    const authHeader = request.headers.get("Authorization");
    const clientIp = extractClientIp(request.headers);
    await WebhookService.process(body, authHeader, clientIp);
    return { success: true as const, data: { received: true } };
  },
  {
    body: processWebhookSchema,
    response: {
      200: processWebhookResponseSchema,
      422: validationErrorSchema,
      401: unauthorizedErrorSchema,
    },
    detail: {
      hide: isProduction,
      summary: "Process Pagarme webhook",
      description:
        "Receives and processes webhook events from Pagarme payment provider.",
    },
  }
);
