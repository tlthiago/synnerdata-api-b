import { Elysia } from "elysia";
import { wrapMessage } from "@/lib/responses/envelope";
import {
  conflictErrorSchema,
  messageOnlyResponseSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import { subscribeNewsletterSchema } from "./newsletter.model";
import { NewsletterService } from "./newsletter.service";

export const newsletterController = new Elysia({
  name: "newsletter",
  prefix: "/v1/public/newsletter",
  detail: { tags: ["Public - Newsletter"] },
}).post(
  "/subscribe",
  async ({ body }) => {
    await NewsletterService.subscribe(body);
    return wrapMessage("Inscrição realizada com sucesso");
  },
  {
    body: subscribeNewsletterSchema,
    response: {
      200: messageOnlyResponseSchema,
      409: conflictErrorSchema,
      422: validationErrorSchema,
    },
    detail: {
      summary: "Inscrever na newsletter",
      description: "Inscreve um email na newsletter. Não requer autenticação.",
    },
  }
);
