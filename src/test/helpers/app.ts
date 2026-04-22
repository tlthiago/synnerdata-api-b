import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { env } from "@/env";
import { adminController } from "@/modules/admin";
import { auditController } from "@/modules/audit";
import { cboOccupationController } from "@/modules/cbo-occupations";
import { employeeController } from "@/modules/employees";
import { occurrencesController } from "@/modules/occurrences";
import { organizationController } from "@/modules/organizations";
import { paymentsController } from "@/modules/payments";
import { betterAuthPlugin } from "@/plugins/auth/auth-plugin";
import { errorPlugin } from "@/plugins/errors/error-plugin";
import { healthPlugin } from "@/plugins/health/health-plugin";
import { loggerPlugin } from "@/plugins/logger/logger-plugin";

export function createTestApp() {
  return new Elysia()
    .use(errorPlugin)
    .use(loggerPlugin)
    .use(healthPlugin)
    .use(
      cors({
        origin: env.CORS_ORIGIN,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"],
      })
    )
    .use(betterAuthPlugin)
    .use(adminController)
    .use(cboOccupationController)
    .use(organizationController)
    .use(employeeController)
    .use(occurrencesController)
    .use(paymentsController)
    .use(auditController)
    .get("/", ({ redirect }) => redirect("/health"));
}

export type TestApp = ReturnType<typeof createTestApp>;
