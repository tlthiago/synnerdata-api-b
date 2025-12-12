import { Elysia } from "elysia";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import {
  listCustomersQuerySchema,
  listCustomersResponseSchema,
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
      auth: true,
      query: listCustomersQuerySchema,
      response: listCustomersResponseSchema,
      detail: { summary: "List customers from Pagarme" },
    }
  );
