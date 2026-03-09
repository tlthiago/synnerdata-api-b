import { Elysia } from "elysia";
import { contactController } from "./contact";
import { newsletterController } from "./newsletter";
import { provisionStatusController } from "./provision-status";

export const publicController = new Elysia({
  name: "public",
})
  .use(contactController)
  .use(newsletterController)
  .use(provisionStatusController);
