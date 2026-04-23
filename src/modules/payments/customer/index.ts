import { Elysia } from "elysia";
import { isProduction } from "@/env";
import { wrapSuccess } from "@/lib/responses/envelope";
import {
  forbiddenErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
import { betterAuthPlugin } from "@/plugins/auth-guard/auth-plugin";
import {
  listCustomersResponseSchema,
  listCustomersSchema,
} from "./customer.model";
import { CustomerService } from "./customer.service";

export const customerController = new Elysia({
  name: "customer",
  prefix: "/customers",
  detail: { tags: ["Payments - Customers"] },
})
  .use(betterAuthPlugin)
  .get(
    "/",
    async ({ query }) =>
      wrapSuccess(
        await CustomerService.list({
          name: query.name,
          email: query.email,
          document: query.document,
          page: query.page,
          size: query.size,
        })
      ),
    {
      auth: {
        requireAdmin: true,
      },
      query: listCustomersSchema,
      response: {
        200: listCustomersResponseSchema,
        422: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        hide: isProduction,
        summary: "List customers from Pagarme",
        description:
          "Lists all customers from the payment provider with optional filters.",
      },
    }
  );
