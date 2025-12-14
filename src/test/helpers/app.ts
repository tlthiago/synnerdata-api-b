import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { env } from "@/env";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import { errorPlugin } from "@/lib/errors/error-plugin";
import { healthPlugin } from "@/lib/health";
import { loggerPlugin } from "@/lib/logger";
import { paymentsController } from "@/modules/payments";

/**
 * Creates a test instance of the Elysia app.
 * Does not start listening - use app.handle() for testing.
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
    .use(paymentsController)
    .get("/", ({ redirect }) => redirect("/health"));
}

export type TestApp = ReturnType<typeof createTestApp>;
