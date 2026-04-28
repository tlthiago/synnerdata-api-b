import { Elysia } from "elysia";
import { adminController } from "@/modules/admin";
import { auditController } from "@/modules/audit";
import { anonymizeController } from "@/modules/auth/anonymize/anonymize.controller";
import { employeeController } from "@/modules/employees";
import { occurrencesController } from "@/modules/occurrences";
import { organizationController } from "@/modules/organizations";
import { paymentsController } from "@/modules/payments";
import { publicController } from "@/modules/public";

export const routesV1 = new Elysia({
  prefix: "/v1",
})
  .use(organizationController)
  .use(employeeController)
  .use(occurrencesController)
  .use(paymentsController)
  .use(auditController)
  .use(adminController)
  .use(anonymizeController)
  .use(publicController);
