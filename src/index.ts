import "@/lib/zod-config";
import "@/lib/sentry";
import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { z } from "zod";
import { pool } from "./db";
import { env, isProduction } from "./env";
import { parseOrigins } from "./lib/cors";
import { logger } from "./lib/logger";
import { extractErrorMessages } from "./lib/openapi/error-messages";
import { setupGracefulShutdown } from "./lib/shutdown/shutdown";
import { registerEmployeeListeners } from "./modules/employees/hooks/listeners";
import { registerPaymentListeners } from "./modules/payments/hooks/listeners";
import { betterAuthPlugin } from "./plugins/auth/auth-plugin";
import { OpenAPI } from "./plugins/auth/openapi-enhance";
import { cronPlugin } from "./plugins/cron/cron-plugin";
import { errorPlugin } from "./plugins/errors/error-plugin";
import { healthPlugin } from "./plugins/health/health-plugin";
import { loggerPlugin } from "./plugins/logger/logger-plugin";
import { routesV1 } from "./routes/v1";

const corsOrigins = parseOrigins(env.CORS_ORIGIN);

const RATE_LIMIT_SKIP_PATHS = ["/health", "/health/live", "/api/auth"];

const REQUEST_IDLE_TIMEOUT_SECONDS = 30;

const app = new Elysia({
  serve: {
    maxRequestBodySize: 1024 * 1024 * 10,
    idleTimeout: REQUEST_IDLE_TIMEOUT_SECONDS,
  },
})
  .headers({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    ...(isProduction && {
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    }),
  })
  .use(errorPlugin)
  .use(loggerPlugin)
  .use(healthPlugin)
  .use(
    cors({
      origin: corsOrigins,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
      exposeHeaders: [
        "X-Request-ID",
        "RateLimit-Limit",
        "RateLimit-Remaining",
        "RateLimit-Reset",
      ],
      maxAge: 86_400,
    })
  )
  .use(
    rateLimit({
      duration: 60_000,
      max: 100,
      headers: true,
      skip: (request) => {
        const url = new URL(request.url);
        return RATE_LIMIT_SKIP_PATHS.some(
          (path) => url.pathname === path || url.pathname.startsWith(`${path}/`)
        );
      },
    })
  )
  .use(betterAuthPlugin)
  .use(
    openapi({
      mapJsonSchema: {
        zod: (schema: z.ZodType) =>
          z.toJSONSchema(schema, {
            unrepresentable: "any",
            override: (ctx) => {
              if (ctx.zodSchema._zod.def.type === "date") {
                ctx.jsonSchema.type = "string";
                ctx.jsonSchema.format = "date-time";
              }

              const messages = extractErrorMessages(ctx.zodSchema._zod.def);
              if (messages) {
                ctx.jsonSchema["x-error-messages"] = messages;
              }
            },
          }),
      },
      documentation: {
        info: {
          title: "Synnerdata API",
          version: "1.0.0",
        },
        components: await OpenAPI.components,
        paths: isProduction ? {} : await OpenAPI.getPaths(),
      },
    })
  )
  .use(cronPlugin)
  .use(routesV1)
  .get("/", ({ redirect }) => redirect("/health"));

registerPaymentListeners();
registerEmployeeListeners();

app.listen(env.PORT, ({ hostname, port }) => {
  logger.info({
    type: "app:start",
    message: `🦊 Elysia is running at ${hostname}:${port}`,
    host: hostname,
    port,
  });
});

setupGracefulShutdown({
  app,
  pool,
  gracePeriodMs: isProduction ? 5000 : 1000,
});
