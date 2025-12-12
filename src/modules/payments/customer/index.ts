import { Elysia } from "elysia";
import {
  listCustomersQuerySchema,
  listCustomersResponseSchema,
} from "./customer.model";
import { CustomerService } from "./customer.service";

export const customerController = new Elysia({
  name: "customer",
  prefix: "/customers",
  detail: { tags: ["Payments - Customers"] },
}).get(
  "/",
  async ({ query }) =>
    CustomerService.list({
      name: query.name,
      email: query.email,
      document: query.document,
      page: query.page,
      size: query.size,
    }),
  {
    query: listCustomersQuerySchema,
    response: listCustomersResponseSchema,
    detail: { summary: "List customers from Pagarme" },
  }
);
