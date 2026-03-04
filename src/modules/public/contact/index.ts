import { Elysia } from "elysia";
import { isProduction } from "@/env";
import { wrapMessage } from "@/lib/responses/envelope";
import {
  messageOnlyResponseSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import { contactBodySchema } from "./contact.model";
import { ContactService } from "./contact.service";

export const contactController = new Elysia({
  name: "contact",
  prefix: "/v1/public/contact",
  detail: { tags: ["Public - Contact"] },
}).post(
  "/",
  async ({ body }) => {
    await ContactService.send(body);
    return wrapMessage("Mensagem enviada com sucesso");
  },
  {
    body: contactBodySchema,
    response: {
      200: messageOnlyResponseSchema,
      422: validationErrorSchema,
    },
    detail: {
      hide: isProduction,
      summary: "Enviar mensagem de contato",
      description:
        "Envia uma mensagem de contato por email. Não requer autenticação.",
    },
  }
);
