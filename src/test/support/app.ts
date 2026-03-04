import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { env } from "@/env";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import { errorPlugin } from "@/lib/errors/error-plugin";
import { healthPlugin } from "@/lib/health";
import { loggerPlugin } from "@/lib/logger";
import { adminController } from "@/modules/admin";
import { auditController } from "@/modules/audit";
import { employeeController } from "@/modules/employees";
import { occurrencesController } from "@/modules/occurrences";
import { organizationController } from "@/modules/organizations";
import { paymentsController } from "@/modules/payments";
import { publicController } from "@/modules/public";

/**
 * Creates a test application instance with all controllers registered.
 *
 * @example
 * const app = createTestApp();
 * const response = await app.handle(new Request("http://localhost/health"));
 */
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
    .use(organizationController)
    .use(employeeController)
    .use(occurrencesController)
    .use(paymentsController)
    .use(auditController)
    .use(publicController)
    .get("/", ({ redirect }) => redirect("/health"));
}

export type TestApp = ReturnType<typeof createTestApp>;
