import { Elysia } from "elysia";
import { isProduction } from "@/env";
import { wrapSuccess } from "@/lib/responses/envelope";
import { validationErrorSchema } from "@/lib/responses/response.types";
import {
  provisionStatusQuerySchema,
  provisionStatusResponseSchema,
} from "./provision-status.model";
import { ProvisionStatusService } from "./provision-status.service";

export const provisionStatusController = new Elysia({
  name: "provision-status",
  prefix: "/v1/public/provision-status",
  detail: { tags: ["Public - Provision Status"] },
}).get(
  "/",
  async ({ query }) => {
    const data = await ProvisionStatusService.check(query.email);
    return wrapSuccess(data);
  },
  {
    query: provisionStatusQuerySchema,
    response: {
      200: provisionStatusResponseSchema,
      422: validationErrorSchema,
    },
    detail: {
      hide: isProduction,
      summary: "Verificar status de ativação de provisão",
      description:
        "Endpoint de polling para verificar se a provisão está pronta para ativação após pagamento. Não requer autenticação.",
    },
  }
);
