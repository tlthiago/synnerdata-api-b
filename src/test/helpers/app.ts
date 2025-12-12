import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { env } from "@/env";
import { betterAuthPlugin } from "@/lib/auth-plugin";
import { paymentsController } from "@/modules/payments";

/**
 * Creates a test instance of the Elysia app.
 * Does not start listening - use app.handle() for testing.
 */
export function createTestApp() {
  return new Elysia()
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
    .get("/", () => "Test Server");
}

export type TestApp = ReturnType<typeof createTestApp>;
