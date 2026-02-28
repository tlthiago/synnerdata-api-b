import { Elysia } from "elysia";
import { apiKeysController } from "./api-keys";
import { adminOrganizationsController } from "./organizations";

export const adminController = new Elysia({
  name: "admin",
  prefix: "/v1/admin",
})
  .use(adminOrganizationsController)
  .use(apiKeysController);
