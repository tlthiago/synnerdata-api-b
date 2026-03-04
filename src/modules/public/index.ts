import { Elysia } from "elysia";
import { contactController } from "./contact";
import { newsletterController } from "./newsletter";

export const publicController = new Elysia({
  name: "public",
})
  .use(contactController)
  .use(newsletterController);
