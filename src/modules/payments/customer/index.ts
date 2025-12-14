import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import {
  forbiddenErrorSchema,
  unauthorizedErrorSchema,
  validationErrorSchema,
} from "@/lib/responses/response.types";
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
    ({ query }) =>
      CustomerService.list({
        name: query.name,
        email: query.email,
        document: query.document,
        page: query.page,
        size: query.size,
      }),
    {
      auth: {
        requireAdmin: true,
      },
      query: listCustomersSchema,
      response: {
        200: listCustomersResponseSchema,
        400: validationErrorSchema,
        401: unauthorizedErrorSchema,
        403: forbiddenErrorSchema,
      },
      detail: {
        summary: "List customers from Pagarme",
        description:
          "Lists all customers from the payment provider with optional filters.",
      },
    }
  );
