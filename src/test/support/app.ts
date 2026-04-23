import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { env } from "@/env";
import { betterAuthPlugin } from "@/plugins/auth/auth-plugin";
import { errorPlugin } from "@/plugins/errors/error-plugin";
import { healthPlugin } from "@/plugins/health/health-plugin";
import { loggerPlugin } from "@/plugins/logger/logger-plugin";
import { routesV1 } from "@/routes/v1";

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
    .use(routesV1)
    .get("/", ({ redirect }) => redirect("/health"));
}

export type TestApp = ReturnType<typeof createTestApp>;
