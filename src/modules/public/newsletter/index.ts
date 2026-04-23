import { Elysia } from "elysia";
import { isProduction } from "@/env";
import { wrapMessage } from "@/lib/responses/envelope";
import {
  messageOnlyResponseSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import { subscribeNewsletterSchema } from "./newsletter.model";
import { NewsletterService } from "./newsletter.service";

export const newsletterController = new Elysia({
  name: "newsletter",
  prefix: "/public/newsletter",
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
      422: validationErrorSchema,
    },
    detail: {
      hide: isProduction,
      summary: "Inscrever na newsletter",
      description: "Inscreve um email na newsletter. Não requer autenticação.",
    },
  }
);
